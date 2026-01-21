(() => {
  // ---------- Config ----------
  const PLANO_URL = "./assets/plano.png";      // <-- tu plano simulado
  const STANDS_URL = "./stands.sample.json";   // o "./stands.json"
  const MAP_W = 2000;  // tamaño virtual del plano (en "unidades" CRS.Simple)
  const MAP_H = 1200;

  // ---------- DOM ----------
  const els = {
    sidebar: document.getElementById("sidebar"),
    menuBtn: document.getElementById("menuBtn"),
    q: document.getElementById("q"),
    cat: document.getElementById("cat"),
    quickCats: document.getElementById("quickCats"),
    stats: document.getElementById("stats"),
    list: document.getElementById("list"),
    fitBtn: document.getElementById("fitBtn"),
    toast: document.getElementById("toast"),

    adminBtn: document.getElementById("adminBtn"),
    exportBtn: document.getElementById("exportBtn"),
    adminPanel: document.getElementById("adminPanel"),
    lastXY: document.getElementById("lastXY"),
    lastRect: document.getElementById("lastRect"),
    rectStartBtn: document.getElementById("rectStartBtn"),
    rectEndBtn: document.getElementById("rectEndBtn"),
    rectClearBtn: document.getElementById("rectClearBtn"),
    jsonSnippet: document.getElementById("jsonSnippet"),
    copyBtn: document.getElementById("copyBtn"),
    helpBtn: document.getElementById("helpBtn"),

    modal: document.getElementById("modal"),
    closeModal: document.getElementById("closeModal"),
    mTitle: document.getElementById("mTitle"),
    mMeta: document.getElementById("mMeta"),
    mMedia: document.getElementById("mMedia"),
    qrBtn: document.getElementById("qrBtn"),
    arBtn: document.getElementById("arBtn"),
    favBtn: document.getElementById("favBtn"),
    mDesc: document.getElementById("mDesc"),
    mNote: document.getElementById("mNote"),
  };

  // ---------- State ----------
  let map, imageOverlay;
  let stands = [];
  let filtered = [];
  let rectStart = null;
  let rectEnd = null;
  let adminMode = false;
  const standLayers = new Map(); // id -> layer
  const favorites = new Set(JSON.parse(localStorage.getItem("expo_favs") || "[]"));

  // ---------- Helpers ----------
  function toast(msg, ms = 2200) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (els.toast.hidden = true), ms);
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // bounds array: [x1,y1,x2,y2] in image coordinates
  // Leaflet CRS.Simple uses lat=y, lng=x
  function boundsToLatLngBounds(b) {
    const [x1,y1,x2,y2] = b;
    const minX = Math.min(x1,x2), maxX = Math.max(x1,x2);
    const minY = Math.min(y1,y2), maxY = Math.max(y1,y2);
    return L.latLngBounds([minY, minX], [maxY, maxX]);
  }

  function normalizeText(s) {
    return (s || "").toString().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }

  function uniq(arr) {
    return [...new Set(arr)];
  }

  function setSelectOptions(select, values) {
    select.innerHTML = `<option value="all">Todas</option>` + values
      .map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  }

  function escapeHtml(str){
    return (str || "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function saveFavs(){
    localStorage.setItem("expo_favs", JSON.stringify([...favorites]));
  }

  // ---------- Map ----------
  function initMap(){
    map = L.map("map", {
      crs: L.CRS.Simple,
      zoomControl: true,
      attributionControl: false,
      minZoom: -4,
      maxZoom: 4,
    });

    const bounds = [[0,0],[MAP_H, MAP_W]];
    imageOverlay = L.imageOverlay(PLANO_URL, bounds, { interactive: false }).addTo(map);
    map.fitBounds(bounds);

    imageOverlay.on("error", () => {
      toast("No se pudo cargar el plano. Revisa assets/plano.png", 5000);
    });

    map.on("click", (e) => {
      if (window.matchMedia("(max-width: 980px)").matches) {
        // en móvil/tablet, tocar el mapa cierra el panel
        els.sidebar.classList.remove("open");
      }
      if (!adminMode) return;
      const x = e.latlng.lng;
      const y = e.latlng.lat;
      els.lastXY.textContent = `${x.toFixed(1)}, ${y.toFixed(1)}`;
      toast("Clic capturado (Admin).");
    });
  }

  // ---------- Data ----------
  async function loadStands(){
    const res = await fetch(STANDS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${STANDS_URL} (${res.status})`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("stands.json debe ser un arreglo");
    stands = data.map(s => ({
      id: String(s.id ?? ""),
      name: String(s.name ?? s.id ?? "Stand"),
      category: String(s.category ?? "General"),
      desc: String(s.desc ?? ""),
      note: String(s.note ?? ""),
      token: String(s.token ?? s.id ?? "demo"),
      bounds: Array.isArray(s.bounds) ? s.bounds.map(Number) : null
    })).filter(s => s.id && s.bounds && s.bounds.length === 4);

    const cats = uniq(stands.map(s => s.category)).sort((a,b)=>a.localeCompare(b));
    setSelectOptions(els.cat, cats);
    renderQuickCats(cats);
    drawStands();
    applyFilters();
    toast("Listo. Toca un stand para ver detalles.");
  }

  function renderQuickCats(cats){
    els.quickCats.innerHTML = "";
    const items = ["Favoritos", ...cats];
    items.forEach(cat => {
      const div = document.createElement("div");
      div.className = "chip";
      div.textContent = cat;
      div.onclick = () => {
        if (cat === "Favoritos") {
          els.cat.value = "all";
          els.q.value = "fav:";
        } else {
          els.q.value = "";
          els.cat.value = cat;
        }
        applyFilters();
      };
      els.quickCats.appendChild(div);
    });
  }

  function drawStands(){
    // limpia capas previas
    for (const layer of standLayers.values()) layer.remove();
    standLayers.clear();

    stands.forEach(s => {
      const llb = boundsToLatLngBounds(s.bounds);
      const isFav = favorites.has(s.id);
      const layer = L.rectangle(llb, {
        weight: 2,
        color: isFav ? "#43f58a" : "#5ee7ff",
        fillColor: isFav ? "#43f58a" : "#5ee7ff",
        fillOpacity: 0.12,
      }).addTo(map);

      layer.on("click", () => openStand(s));
      standLayers.set(s.id, layer);
    });
  }

  // ---------- UI: filters/list ----------
  function applyFilters(){
    const q = normalizeText(els.q.value.trim());
    const cat = els.cat.value;

    filtered = stands.filter(s => {
      const matchCat = (cat === "all") ? true : s.category === cat;

      if (q === "") return matchCat;

      if (q.startsWith("fav:")) {
        return matchCat && favorites.has(s.id);
      }

      const hay = normalizeText(`${s.id} ${s.name} ${s.category} ${s.desc}`);
      return matchCat && hay.includes(q);
    });

    renderStats();
    renderList();
    styleStandLayers();
  }

  function renderStats(){
    const total = stands.length;
    const shown = filtered.length;
    const favs = favorites.size;
    els.stats.innerHTML = `
      <div>${shown} / ${total} visibles</div>
      <div>★ ${favs} favoritos</div>
    `;
  }

  function renderList(){
    els.list.innerHTML = "";
    filtered.forEach(s => {
      const isFav = favorites.has(s.id);
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="itemTop">
          <div>
            <div class="itemName">${escapeHtml(s.id)} — ${escapeHtml(s.name)}</div>
            <div class="itemCat">${escapeHtml(s.category)}</div>
          </div>
          <div class="kpill">${isFav ? "★ Fav" : "Stand"}</div>
        </div>
      `;
      div.onclick = () => openStand(s);
      els.list.appendChild(div);
    });

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "item";
      empty.style.opacity = "0.85";
      empty.innerHTML = `<div class="itemName">Sin resultados</div><div class="itemCat">Prueba otra búsqueda o categoría.</div>`;
      els.list.appendChild(empty);
    }
  }

  function styleStandLayers(){
    stands.forEach(s => {
      const layer = standLayers.get(s.id);
      if (!layer) return;
      const visible = filtered.some(x => x.id === s.id);

      const isFav = favorites.has(s.id);
      layer.setStyle({
        opacity: visible ? 1 : 0.15,
        fillOpacity: visible ? 0.12 : 0.02,
        color: isFav ? "#43f58a" : "#5ee7ff",
        fillColor: isFav ? "#43f58a" : "#5ee7ff",
      });
    });
  }

  // ---------- Modal ----------
  function openStand(s){
    // centrar al stand
    const llb = boundsToLatLngBounds(s.bounds);
    map.fitBounds(llb.pad(0.25));

    els.mTitle.textContent = `${s.id} — ${s.name}`;
    els.mMeta.textContent = `${s.category} • token=${s.token}`;

    // media placeholder (puedes reemplazar por video/galería por stand luego)
    els.mMedia.innerHTML = `
      <div class="mediaHint">
        Contenido demo.<br/>
        QR abre la ficha del stand.<br/>
        AR abre la cámara.
      </div>
    `;

    els.qrBtn.href = `./s.html?token=${encodeURIComponent(s.token)}`;
    els.arBtn.href = `./ar.html?token=${encodeURIComponent(s.token)}`;

    const isFav = favorites.has(s.id);
    els.favBtn.textContent = isFav ? "★ Favorito" : "☆ Favorito";

    els.mDesc.textContent = s.desc || "—";
    els.mNote.textContent = s.note || "";

    els.modal.hidden = false;
  }

  function closeModal(){
    els.modal.hidden = true;
  }

  // ---------- Admin ----------
  function setAdmin(on){
    adminMode = on;
    els.adminPanel.hidden = !on;
    els.adminBtn.textContent = on ? "Modo Admin: ON" : "Modo Admin: OFF";
    toast(on ? "Admin ON: usa esquina 1 y esquina 2" : "Admin OFF");
  }

  function setRectText(){
    if (!rectStart || !rectEnd) {
      els.lastRect.textContent = "—";
      return;
    }
    const x1 = rectStart.lng, y1 = rectStart.lat;
    const x2 = rectEnd.lng, y2 = rectEnd.lat;
    els.lastRect.textContent = `${x1.toFixed(1)}, ${y1.toFixed(1)}, ${x2.toFixed(1)}, ${y2.toFixed(1)}`;
    els.jsonSnippet.value = JSON.stringify({
      id: "A01",
      name: "Stand A01",
      category: "IA & Datos",
      bounds: [Number(x1.toFixed(1)), Number(y1.toFixed(1)), Number(x2.toFixed(1)), Number(y2.toFixed(1))],
      token: "A01",
      desc: "Demo de contenido del stand",
      note: "Aquí puedes agregar links/CTA"
    }, null, 2);
  }

  // ---------- Export ----------
  function exportJSON(){
    const blob = new Blob([JSON.stringify(stands, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "stands.export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- Events ----------
  function bindUI(){
    // sidebar toggle (mobile/tablet)
    els.menuBtn.addEventListener("click", () => {
      els.sidebar.classList.toggle("open");
    });

    els.q.addEventListener("input", applyFilters);
    els.cat.addEventListener("change", () => {
      // si usuario cambia categoría, limpia fav:
      if (els.q.value.trim().startsWith("fav:")) els.q.value = "";
      applyFilters();
    });

    els.fitBtn.addEventListener("click", () => {
      map.fitBounds([[0,0],[MAP_H, MAP_W]]);
      toast("Vista ajustada.");
    });

    // modal close
    els.closeModal.addEventListener("click", closeModal);
    els.modal.addEventListener("click", (e) => {
      if (e.target === els.modal) closeModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.modal.hidden) closeModal();
    });

    // favorites
    els.favBtn.addEventListener("click", () => {
      const title = els.mTitle.textContent || "";
      const id = title.split("—")[0].trim();
      if (!id) return;

      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);

      saveFavs();
      drawStands();
      applyFilters();

      const isFav = favorites.has(id);
      els.favBtn.textContent = isFav ? "★ Favorito" : "☆ Favorito";
      toast(isFav ? "Agregado a favoritos" : "Quitado de favoritos");
    });

    // admin
    els.adminBtn.addEventListener("click", () => setAdmin(!adminMode));
    els.exportBtn.addEventListener("click", exportJSON);

    els.rectStartBtn.addEventListener("click", () => {
      if (!adminMode) return toast("Activa Admin primero.");
      toast("Ahora haz clic en el mapa: esquina 1");
      const once = (e) => {
        rectStart = e.latlng;
        setRectText();
        map.off("click", once);
        toast("Esquina 1 guardada.");
      };
      map.on("click", once);
    });

    els.rectEndBtn.addEventListener("click", () => {
      if (!adminMode) return toast("Activa Admin primero.");
      toast("Ahora haz clic en el mapa: esquina 2");
      const once = (e) => {
        rectEnd = e.latlng;
        setRectText();
        map.off("click", once);
        toast("Esquina 2 guardada.");
      };
      map.on("click", once);
    });

    els.rectClearBtn.addEventListener("click", () => {
      rectStart = null;
      rectEnd = null;
      setRectText();
      toast("Rectángulo limpiado.");
    });

    els.copyBtn.addEventListener("click", async () => {
      const txt = els.jsonSnippet.value || "";
      try{
        await navigator.clipboard.writeText(txt);
        toast("Snippet copiado.");
      }catch{
        toast("No se pudo copiar. Copia manual.");
      }
    });

    els.helpBtn.addEventListener("click", () => {
      alert(
        "Guía rápida Admin:\n\n" +
        "1) Activa Modo Admin\n" +
        "2) Click en 'esquina 1' y luego clic en el mapa\n" +
        "3) Click en 'esquina 2' y luego clic en el mapa\n" +
        "4) Copia el snippet JSON y pégalo en stands.json\n\n" +
        "El plano debe estar en assets/plano.png"
      );
    });
  }

  // ---------- Init ----------
  async function init(){
    // estado inicial
    els.modal.hidden = true;
    els.adminPanel.hidden = true;

    initMap();
    bindUI();

    try{
      await loadStands();
    }catch(err){
      console.error(err);
      toast(`Error: ${err.message}`, 6000);
    }
  }

  init();
})();
