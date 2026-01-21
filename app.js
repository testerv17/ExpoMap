/* Expo Industry 5.0 — Mapa Indoor (Leaflet + ImageOverlay)
   - Carga stands desde ./stands.json (o ./stands.sample.json si no existe)
   - Click en un stand => modal + links QR/AR
   - Modo Admin: captura coordenadas y genera snippet JSON
*/
(() => {
  // ✅ Forzar UI limpia al arrancar
  try{ document.getElementById('modal').hidden = true; }catch(e){}
  try{ document.getElementById('adminPanel').hidden = true; }catch(e){}

  const MAP_IMG = './assets/plano.jpg';

  // Utilidad: debounce
  const debounce = (fn, ms=250) => {
    let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
  };

  const els = {
    menuBtn: document.getElementById('menuBtn'),
    q: document.getElementById('q'),
    cat: document.getElementById('cat'),
    quickCats: document.getElementById('quickCats'),
    list: document.getElementById('list'),
    stats: document.getElementById('stats'),
    fitBtn: document.getElementById('fitBtn'),
    adminBtn: document.getElementById('adminBtn'),
    exportBtn: document.getElementById('exportBtn'),
    toast: document.getElementById('toast'),

    adminPanel: document.getElementById('adminPanel'),
    lastXY: document.getElementById('lastXY'),
    lastRect: document.getElementById('lastRect'),
    rectStartBtn: document.getElementById('rectStartBtn'),
    rectEndBtn: document.getElementById('rectEndBtn'),
    rectClearBtn: document.getElementById('rectClearBtn'),
    jsonSnippet: document.getElementById('jsonSnippet'),
    copyBtn: document.getElementById('copyBtn'),
    helpBtn: document.getElementById('helpBtn'),

    modal: document.getElementById('modal'),
    closeModal: document.getElementById('closeModal'),
    mTitle: document.getElementById('mTitle'),
    mMeta: document.getElementById('mMeta'),
    mDesc: document.getElementById('mDesc'),
    mNote: document.getElementById('mNote'),
    qrBtn: document.getElementById('qrBtn'),
    arBtn: document.getElementById('arBtn'),
    favBtn: document.getElementById('favBtn'),
  };

  const state = {
    stands: [],
    filtered: [],
    favorites: new Set(JSON.parse(localStorage.getItem('expo5_favs') || '[]')),
    admin: false,
    rect: { p1: null, p2: null },
    layersById: new Map(),
    selectedId: null,
    imgSize: { w: 1600, h: 900 }, // se actualiza al cargar la imagen
  };

  // ---------- Mapa ----------
  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 3,
    zoomControl: true,
    attributionControl: false,
  });

  // Cargar imagen para conocer tamaño real
  const img = new Image();
  img.onload = () => {
    state.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
    const bounds = [[0,0], [state.imgSize.h, state.imgSize.w]];
    L.imageOverlay(MAP_IMG, bounds).addTo(map);
    map.fitBounds(bounds);

    // Evita arrastrar fuera (suave)
    map.setMaxBounds([
      [-state.imgSize.h*0.15, -state.imgSize.w*0.15],
      [ state.imgSize.h*1.15,  state.imgSize.w*1.15]
    ]);

    init();
  };
  img.src = MAP_IMG;

  // ---------- Carga de stands ----------
  async function loadStands() {
    const tryFiles = ['./stands.json', './stands.sample.json'];
    for (const f of tryFiles) {
      try {
        const res = await fetch(f, { cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data)) return data;
      } catch (_) {}
    }
    return [];
  }

  function uniqueCats(stands){
    const s = new Set();
    stands.forEach(x => s.add(x.category || 'Sin categoría'));
    return [...s].sort((a,b)=>a.localeCompare(b,'es'));
  }

  function setCatsUI(cats){
    // select
    const current = els.cat.value || 'all';
    els.cat.innerHTML = '<option value="all">Todas</option>' + cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    els.cat.value = cats.includes(current) ? current : 'all';

    // quick chips (top 8)
    els.quickCats.innerHTML = '';
    cats.slice(0, 8).forEach(c => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = c;
      chip.onclick = () => { els.cat.value = c; applyFilters(); };
      els.quickCats.appendChild(chip);
    });
  }

  function escapeHtml(s){
    return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  }

  function applyFilters(){
    const q = (els.q.value || '').trim().toLowerCase();
    const cat = els.cat.value;

    state.filtered = state.stands.filter(st => {
      const inCat = (cat === 'all') || ((st.category||'') === cat);
      if (!inCat) return false;

      if (!q) return true;
      const hay = `${st.id||''} ${st.name||''} ${st.category||''} ${st.zone||''}`.toLowerCase();
      return hay.includes(q);
    });

    renderList();
    renderLayers();
    renderStats();
  }

  // ---------- Capas (stands) ----------
  function boundsToLatLngBounds(b){
    // b: [x1,y1,x2,y2] en pixeles; en CRS.Simple => lat=y, lng=x
    const [x1,y1,x2,y2] = b;
    const southWest = [Math.min(y1,y2), Math.min(x1,x2)];
    const northEast = [Math.max(y1,y2), Math.max(x1,x2)];
    return L.latLngBounds(southWest, northEast);
  }

  function colorForCategory(cat){
    // No fijamos una paleta estricta; damos variedad determinística por hash
    const s = String(cat||'x');
    let h = 0;
    for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return `hsl(${hue} 85% 65%)`;
  }

  function renderLayers(){
    // Limpia capas anteriores
    for (const [id, layer] of state.layersById.entries()){
      map.removeLayer(layer);
    }
    state.layersById.clear();

    state.filtered.forEach(st => {
      if (!st.bounds || st.bounds.length !== 4) return;

      const lb = boundsToLatLngBounds(st.bounds);
      const c = colorForCategory(st.category);
      const isFav = state.favorites.has(st.id);
      const isSelected = state.selectedId === st.id;

      const layer = L.rectangle(lb, {
        color: c,
        weight: isSelected ? 3 : 2,
        opacity: 0.95,
        fillColor: c,
        fillOpacity: isSelected ? 0.18 : 0.10,
        dashArray: isFav ? '0' : '6 6',
      });

      layer.on('click', () => openStand(st.id));
      layer.addTo(map);
      state.layersById.set(st.id, layer);
    });
  }

  function highlightSelected(){
    // re-render for weight
    renderLayers();
  }

  // ---------- Lista ----------
  function renderList(){
    els.list.innerHTML = '';
    state.filtered.forEach(st => {
      const div = document.createElement('div');
      div.className = 'item';
      div.onclick = () => openStand(st.id);

      const top = document.createElement('div');
      top.className = 'itemTop';

      const left = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'itemName';
      name.textContent = `${st.id ? st.id + ' • ' : ''}${st.name || 'Stand'}`;
      const cat = document.createElement('div');
      cat.className = 'itemCat';
      cat.textContent = st.category || 'Sin categoría';
      left.appendChild(name);
      left.appendChild(cat);

      const pill = document.createElement('div');
      pill.className = 'kpill';
      pill.textContent = state.favorites.has(st.id) ? '★ Favorito' : (st.zone ? `Zona ${st.zone}` : 'Ver');

      top.appendChild(left);
      top.appendChild(pill);
      div.appendChild(top);

      els.list.appendChild(div);
    });

    if (!state.filtered.length){
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.style.padding = '10px';
      empty.textContent = 'No hay stands con esos filtros.';
      els.list.appendChild(empty);
    }
  }

  function renderStats(){
    const total = state.stands.length;
    const shown = state.filtered.length;
    const favs = state.favorites.size;
    els.stats.innerHTML = `
      <span>${shown} visibles</span>
      <span>${total} total</span>
      <span>${favs} favoritos</span>
    `;
  }

  // ---------- Modal ----------
  function tokenForStand(id){
    // En producción, el token viene del backend; aquí hacemos demo determinístico
    return btoa(String(id)).replaceAll('=','');
  }

  function openStand(id){
    const st = state.stands.find(s => s.id === id);
    if (!st) return;

    state.selectedId = id;
    highlightSelected();

    // zoom al stand
    if (st.bounds){
      map.fitBounds(boundsToLatLngBounds(st.bounds), { padding: [40, 40] });
    }

    const fav = state.favorites.has(id);
    els.mTitle.textContent = `${st.id ? st.id + ' • ' : ''}${st.name || 'Stand'}`;
    els.mMeta.textContent = `${st.category || 'Sin categoría'}${st.zone ? ' • Zona ' + st.zone : ''}`;
    els.mDesc.textContent = st.description || 'Descripción pendiente. Aquí puedes mostrar: video, galería, PDF, encuesta y CTA de contacto.';
    els.mNote.textContent = st.note || 'Siguiente paso: conecta Supabase/Firebase para cargar medios reales por stand.';

    const token = st.token || tokenForStand(id);
    els.qrBtn.href = `./s.html?token=${encodeURIComponent(token)}`;
    els.arBtn.href = `./ar.html?token=${encodeURIComponent(token)}`;
    els.favBtn.textContent = fav ? '★ Quitar favorito' : '☆ Favorito';

    els.modal.hidden = false;
  }

  function closeModal(){
    els.modal.hidden = true;
    state.selectedId = null;
    highlightSelected();
  }

  els.closeModal.onclick = closeModal;
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });

  els.favBtn.onclick = () => {
    const id = state.selectedId;
    if (!id) return;
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    localStorage.setItem('expo5_favs', JSON.stringify([...state.favorites]));
    applyFilters(); // actualiza list/estilos
    // mantiene modal abierto
    openStand(id);
  };

  // ---------- Admin mode ----------
  function showToast(msg){
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>els.toast.hidden=true, 3200);
  }

  function setAdmin(on){
    state.admin = on;
    els.adminPanel.hidden = !on;
    els.adminBtn.textContent = on ? 'Modo Admin: ON' : 'Modo Admin: OFF';
    showToast(on ? 'Modo Admin activado. Haz clic en el mapa para capturar coordenadas.' : 'Modo Admin desactivado.');
  }

  els.adminBtn.onclick = () => setAdmin(!state.admin);

  map.on('click', (e) => {
    if (!state.admin) return;
    const x = Math.round(e.latlng.lng); // CRS.Simple: lng = x
    const y = Math.round(e.latlng.lat); // lat = y
    els.lastXY.textContent = `${x}, ${y}`;
    showToast(`Clic: x=${x}, y=${y}`);
  });

  els.rectStartBtn.onclick = () => {
    if (!state.admin) return;
    const center = map.getCenter();
    const x = Math.round(center.lng);
    const y = Math.round(center.lat);
    state.rect.p1 = {x,y};
    showToast('Esquina 1 marcada (usa el centro del mapa).');
    updateRectUI();
  };

  els.rectEndBtn.onclick = () => {
    if (!state.admin) return;
    const center = map.getCenter();
    const x = Math.round(center.lng);
    const y = Math.round(center.lat);
    state.rect.p2 = {x,y};
    showToast('Esquina 2 marcada (usa el centro del mapa).');
    updateRectUI();
  };

  els.rectClearBtn.onclick = () => {
    state.rect = { p1:null, p2:null };
    updateRectUI();
    showToast('Rectángulo limpio.');
  };

  function updateRectUI(){
    const {p1,p2} = state.rect;
    if (!p1 || !p2){
      els.lastRect.textContent = '—';
      els.jsonSnippet.value = '';
      return;
    }
    const b = [p1.x, p1.y, p2.x, p2.y];
    els.lastRect.textContent = `[${b.join(', ')}]`;

    const snippet = {
      id: 'NEW',
      name: 'Nuevo Stand',
      category: 'Smart Factory',
      zone: 'A',
      bounds: b,
      description: 'Contenido del stand (video/galería/descarga).',
      token: tokenForStand('NEW')
    };
    els.jsonSnippet.value = JSON.stringify(snippet, null, 2);
  }

  els.copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(els.jsonSnippet.value || '');
      showToast('Snippet copiado.');
    } catch {
      showToast('No se pudo copiar. Copia manualmente.');
    }
  };

  els.helpBtn.onclick = () => {
    alert(
`Guía rápida (Admin):
1) Haz zoom al stand en el plano.
2) Centra la vista en una esquina del stand y presiona “Marcar esquina 1”.
3) Centra la vista en la esquina opuesta y presiona “Marcar esquina 2”.
4) Copia el snippet y pégalo en stands.json.
Tip: usa bounds [x1,y1,x2,y2] en pixeles de la imagen.`
    );
  };

  // Export JSON (descarga)
  els.exportBtn.onclick = () => {
    const blob = new Blob([JSON.stringify(state.stands, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stands.export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Ajustar vista
  els.fitBtn.onclick = () => {
    const bounds = [[0,0], [state.imgSize.h, state.imgSize.w]];
    map.fitBounds(bounds);
  };

  // Filtros
  els.q.addEventListener('input', debounce(applyFilters, 200));
  els.cat.addEventListener('change', applyFilters);

  // Mobile: toggle panel
  const sidebar = document.querySelector('.sidebar');
  if (els.menuBtn && sidebar){
    els.menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    map.on('click', () => {
      if (window.matchMedia('(max-width: 520px)').matches){
        sidebar.classList.remove('open');
      }
    });
  }

// ---------- Init ----------
  async function init(){
    state.stands = await loadStands();

    // Si no hay stands, carga algunos de ejemplo
    if (!state.stands.length){
      state.stands = getSampleStands();
    }

    setCatsUI(uniqueCats(state.stands));
    applyFilters();
    renderStats();

    showToast('Listo. Clic en un stand para ver detalles.');
  }

  function getSampleStands(){
    // OJO: Estos bounds son aproximados (para demo). Ajusta con Modo Admin.
    return [
      { id:'405', name:'Industria Mexicana (Demo)', category:'Smart Factory', zone:'Centro',
        bounds:[735, 640, 1240, 905],
        description:'Smart Factory • Automatización • Integración OT/IT • Industria 5.0 centrada en humanos.',
        note:'Demo: reemplaza por tu contenido real (video/galería/AR).'
      },
      { id:'705', name:'Bimbo (Demo)', category:'Smart Supply Chain', zone:'Derecha',
        bounds:[1315, 700, 1460, 930],
        description:'Cadena de suministro inteligente, trazabilidad, analítica y sostenibilidad.'
      },
      { id:'415', name:'BBVA (Demo)', category:'AI & Analytics', zone:'Centro',
        bounds:[710, 545, 835, 650],
        description:'IA aplicada, analítica avanzada y experiencias de datos.'
      },
      { id:'723', name:'Activaciones (Demo)', category:'AR/VR & Experience', zone:'Arriba',
        bounds:[1185, 380, 1325, 510],
        description:'Zona de activaciones: experiencias inmersivas, demos y retos.'
      },
      { id:'TALLER', name:'Taller', category:'Learning & Skills', zone:'Arriba derecha',
        bounds:[1205, 170, 1505, 350],
        description:'Workshops, hands-on labs y certificaciones.'
      },
      { id:'CONF', name:'Conferencias', category:'Conferences', zone:'Izquierda',
        bounds:[390, 140, 645, 530],
        description:'Auditorio de conferencias y keynotes sobre industria 5.0.'
      }
    ];
  }
})();
