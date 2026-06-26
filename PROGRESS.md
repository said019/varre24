# VARRE24 — Progreso

Rebrand + división del sistema de reservas `pilates-room` para el studio **VARRE24**
(Barre y Pilates, Nápoles, CDMX). Diseño completo: `docs/superpowers/specs/2026-06-26-varre24-rebrand-design.md`.

## Decisiones
- Conservar TODA la funcionalidad; rebrandear + adaptar catálogo.
- Integraciones a activar: MercadoPago + WhatsApp (Evolution) + Resend. Wallet apagada pero lista.
- Sin integración FitPass/Wellhub/TotalPass (solo informativo).
- Hosting: Railway + Postgres de Railway. Paleta: cálida terracota/coral/crema (tipo maren).
- Monorepo `frontend/` + `backend/` (npm workspaces).

## Estado por fases

| Fase | Estado | Notas |
|------|--------|-------|
| **1 — Monorepo split** | ✅ Hecho | `frontend/` (Vite+React+TS) + `backend/` (Express+pg), workspaces, configs, Railway/Nixpacks. Instala, compila y arranca (verificado). |
| **Bootstrap de esquema** | ✅ Hecho | BD virgen aplica `schema_complete.sql` automáticamente (deploy limpio en Railway). |
| **2 — Catálogo VARRE24** | ✅ Hecho | Clases (Pilates Mat, Barre, Experience), cupo 7, planes/precios ($120/$270/$500/$990/$16,000), horario base, políticas. **Verificado contra Postgres local.** |
| **Brand board** | ✅ Aprobado | `docs/brand/brand-board.html` + `docs/brand/varre24-brand-kit-overview.jpg`. Paleta + tipografías (Fraunces + Inter Tight). |
| **Scrub de seguridad (parcial)** | ✅ Hecho | Quitados: emails/contraseñas de admin de terceros (ahora admin via env `ADMIN_*`), API key de Evolution ajena, seed con Postgres+password. JWT_SECRET y dominios → defaults VARRE24. |
| **3 — Identidad visual (frontend)** | ✅ Hecho (color/tokens) | Paleta **Red Pink Bold** del deck (Cherry Cola `#7C0116` · Claret `#670626` · Pink `#FFBDC5` · Hibiscus `#E0A4B0`). Barrido de ~2,260 hex → tokens, `:root` HSL + gradientes ambientales, escala `brand.*`, fuentes (Fraunces+Inter Tight), strings "Pilates Room"→"VARRE24", metadatos/PWA (theme `#7C0116`), badges de categoría `barre`/`pilates`/`especial`, restricción de trial en UI. Build verde, verificado por screenshot. ⚠️ Corrección: la 1ª pasada usó terracota (supuesto erróneo de la spec vieja); rehecho al rojo/rosa real del deck. |
| **4 — Limpieza + seguridad (resto)** | ⏳ Pendiente | Geo del studio (hoy Zócalo) → Nápoles; quitar branding Xolobitos del pase Apple; seeds/instructores + generar clases; limpiar bloques muertos. |
| **5 — Integraciones** | ⏳ Pendiente | Cablear MercadoPago, WhatsApp, Resend con credenciales reales del studio. |
| **6 — Deploy Railway** | ⏳ Pendiente | Provisionar Postgres, env vars, deploy, verificación end-to-end. |

## Próximo paso concreto (Paso 4 — contenido + limpieza)
El **color** ya quedó (Paso 3 ✅). Lo que sigue es **contenido/copy** (no color), aún con
restos de Pilates Room en el landing:
1. Hero/landing: "PILATES REFORMER" / "IN MY PILATES ERA" → catálogo VARRE24 (Pilates Mat,
   Barre, Experience). VARRE24 no usa Reformer.
2. Ubicación: "Centro Oils&Love · Jardines del Country, GDL" → Arizona 14 P3, Nápoles, CDMX
   (y coords del studio en `backend/server/index.js`, hoy Zócalo).
3. "Clases de 50 min en grupos de siete" → 60 min, cupo 7.
4. Logo/wordmark VARRE24 + fotos nuevas (hoy se usan assets `pilates-room-*`).
5. (Pendiente confirmar) Fuente de titulares: ¿Fraunces serif actual o display bold tipo
   Druk/Anton como el deck?
6. Resto de Paso 4: hardening de seguridad (admin hardcodeado, JWT, branding Xolobitos del
   pase Apple), limpieza de esquema/seeds.

## Cómo correr (local)
```bash
npm install
cp .env.example .env          # configura DATABASE_URL, etc.
npm run dev                   # frontend :5173 (proxy /api) + backend :8080
# o build de prod:
npm run build && npm start
```
Requiere Postgres (local o Railway). El esquema se crea/migra solo al arrancar.
