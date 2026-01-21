# Expo Industry 5.0 — Web (PWA-lite) • Mapa Indoor + QR + AR demo

Este proyecto arranca **100% web** (herramientas libres) y usa un **plano como imagen** con Leaflet en `CRS.Simple`
para simular un mapa indoor (perfecto para expos).

## Qué incluye
- Mapa indoor (imagen) + stands como rectángulos clicables
- Sidebar moderna (buscar, filtrar por categoría, favoritos)
- Flujo QR: `s.html?token=...`
- Plantilla AR demo: `ar.html?token=...` (lista para integrar MindAR o AR.js)
- **Modo Admin** para capturar coordenadas (bounds) y crear stands rápido

## Cómo correrlo (local)
Opción A (más simple): Live Server de VS Code
1) Abre la carpeta del proyecto en VS Code
2) Click derecho a `index.html` → **Open with Live Server**

Opción B: Python (si lo tienes)
```bash
python -m http.server 8080
```
Luego abre: http://localhost:8080

## Crear/editar stands (60 stands)
1) Abre la app → activa **Modo Admin**
2) Haz zoom al stand en el plano
3) Centra la vista en esquina 1 → clic en “Marcar esquina 1”
4) Centra la vista en esquina 2 → “Marcar esquina 2”
5) Copia el **snippet JSON** y pégalo en `stands.json` (crea este archivo copiando `stands.sample.json`)

Formato:
```json
{
  "id":"405",
  "name":"Nombre del Stand",
  "category":"Smart Factory",
  "zone":"A",
  "bounds":[x1,y1,x2,y2],
  "description":"..."
}
```

## Conectar backend (siguiente fase)
Recomendación libre: **Supabase** (Postgres + Storage).
- `stands` + `stand_assets` + `qr_tokens`
- Resolver token → stand → assets (video/galería/modelos)

## AR libre (cuando lo activemos)
- MindAR (image tracking) o AR.js (marker based)
- Fallback a contenido normal si el dispositivo no soporta AR

---

Si quieres, el siguiente paso es:
1) Definir 8–10 categorías de industria 5.0 (nombres exactos)
2) Montar `stands.json` con 60 stands (te puedo generar un borrador)
3) Integrar MindAR o AR.js con 1 plantilla reusable
