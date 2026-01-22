/* Expo IA & Industria 5.0 — Mobile Web 2026
   - Mapa indoor (Leaflet CRS.Simple) con plano.png
   - Lista expositores: seleccionar -> zoom al stand (bounds correctos)
   - Totalmente responsive (móvil primero)
*/

(() => {
  const els = {
    sheet: document.getElementById("sheet"),
    sheetBtn: document.getElementById("sheetBtn"),
    sheetClose: document.getElementById("sheetClose"),
    q: document.getElementById("q"),
    cat: document.getElementById("cat"),
    stats: document.getElementById("stats"),
    list: document.getElementById("list"),
    fitBtn: document.getElementById("fitBtn"),
    demoBtn: document.getElementById("demoBtn"),
    toast: document.getElementById("toast"),
    pillCount: document.getElementById("pillCount"),
  };

  const STATE = {
    map: null,
    overlay: null,
    img: { url: "./assets/plano.png", w: 1536, h: 1024, bounds: null },
    stands: [],
    filtered: [],
    layers: new Map(),
    activeId: null,
  };

  function showToast(msg, ms=1700){
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (els.toast.hidden = true), ms);
  }

  function openSheet(){ els.sheet.classList.add("open"); }
  function closeSheet(){ els.sheet.classList.remove("open"); }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
    }[m]));
  }

  async function loadConfig(){
    const res = await fetch("./stands.json?v=" + Date.now());
    if(!res.ok) throw new Error("No pude cargar stands.json");
    return await res.json();
  }

  function createMap(){
    const map = L.map("map", {
      crs: L.CRS.Simple,
      zoomControl: false,
      attributionControl: false,
      minZoom: -5,
      maxZoom: 2,
      preferCanvas: true,
      inertia: true,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    STATE.map = map;
  }

  function setFloorplan(){
    const { w, h, url } = STATE.img;
    const bounds = [[0,0],[h,w]];
    STATE.img.bounds = bounds;

    if(STATE.overlay){
      STATE.map.removeLayer(STATE.overlay);
    }
    STATE.overlay = L.imageOverlay(url, bounds).addTo(STATE.map);
    STATE.map.fitBounds(bounds);
  }

  function clearStandLayers(){
    for(const layer of STATE.layers.values()){
      STATE.map.removeLayer(layer);
    }
    STATE.layers.clear();
  }

  function styleFor(active=false){
    return {
      color: active ? "#12c77a" : "#f6c54a",
      weight: active ? 3 : 2,
      opacity: 0.95,
      fillColor: active ? "#12c77a" : "#f6c54a",
      fillOpacity: active ? 0.20 : 0.10,
    };
  }

  function drawStands(list){
    clearStandLayers();

    list.forEach(s => {
      const [x1,y1,x2,y2] = s.bounds;
      const b = [[y1,x1],[y2,x2]];
      const rect = L.rectangle(b, styleFor(false)).addTo(STATE.map);
      rect.on("click", () => focusStand(s.id, true));
      STATE.layers.set(s.id, rect);
    });
  }

  function focusStand(id, fromMap=false){
    const s = STATE.stands.find(x => x.id === id);
    if(!s) return;

    STATE.activeId = id;

    STATE.layers.forEach((layer, sid) => {
      layer.setStyle(styleFor(sid === id));
    });

    const [x1,y1,x2,y2] = s.bounds;
    const b = [[y1,x1],[y2,x2]];
    STATE.map.fitBounds(b, { padding:[38,38], maxZoom: 0 });

    showToast(`📍 ${s.id} • ${s.category}`);

    // In mobile, close sheet after choosing from list
    if(!fromMap && window.matchMedia("(max-width: 980px)").matches){
      closeSheet();
    }
  }

  function initCategoryUI(){
    const cats = [...new Set(STATE.stands.map(s => s.category))].sort();
    els.cat.innerHTML = `<option value="all">Todas</option>` + cats.map(c =>
      `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
    ).join("");
  }

  function renderList(list){
    els.list.innerHTML = list.map(s => `
      <div class="item" data-id="${escapeHtml(s.id)}">
        <div class="itemTop">
          <div>
            <div class="itemName">${escapeHtml(s.name)}</div>
            <div class="itemCat">${escapeHtml(s.category)}</div>
          </div>
          <div class="kpill">${escapeHtml(s.id)}</div>
        </div>
      </div>
    `).join("");

    els.list.querySelectorAll(".item").forEach(it => {
      it.addEventListener("click", () => {
        const id = it.getAttribute("data-id");
        focusStand(id, false);
      });
    });

    els.stats.textContent = `${list.length} visibles • ${STATE.stands.length} total`;
  }

  function applyFilters(){
    const q = (els.q.value || "").trim().toLowerCase();
    const cat = els.cat.value;

    let list = STATE.stands.slice();

    if(cat && cat !== "all"){
      list = list.filter(s => s.category === cat);
    }
    if(q){
      list = list.filter(s =>
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    }

    STATE.filtered = list;
    renderList(list);
    drawStands(list);
  }

  function wireUI(){
    els.sheetBtn.addEventListener("click", () => els.sheet.classList.toggle("open"));
    els.sheetClose.addEventListener("click", closeSheet);

    els.q.addEventListener("input", applyFilters);
    els.cat.addEventListener("change", applyFilters);

    els.fitBtn.addEventListener("click", () => {
      if(STATE.img.bounds) STATE.map.fitBounds(STATE.img.bounds);
      showToast("Vista ajustada al plano");
    });

    els.demoBtn.addEventListener("click", () => {
      openSheet();
      focusStand("A01", false);
    });

    STATE.map.on("click", () => {
      if(window.matchMedia("(max-width: 980px)").matches){
        closeSheet();
      }
    });

    // deep-link ?stand=A01
    const params = new URLSearchParams(location.search);
    const stand = params.get("stand");
    if(stand){
      setTimeout(() => focusStand(stand, false), 450);
    }
  }

  async function init(){
    createMap();

    try{
      const cfg = await loadConfig();
      STATE.img.url = cfg.image?.url || "./assets/plano.png";
      STATE.img.w = cfg.image?.width || 1536;
      STATE.img.h = cfg.image?.height || 1024;
      STATE.stands = cfg.stands || [];
    }catch(e){
      console.error(e);
      showToast("⚠️ No se pudo cargar stands.json");
      STATE.stands = [];
    }

    els.pillCount.textContent = `${STATE.stands.length || 0} stands`;

    setFloorplan();
    initCategoryUI();
    applyFilters();
    wireUI();

    showToast("Listo. Abre Expositores y elige un stand.", 2200);
  }

  init();
})();
