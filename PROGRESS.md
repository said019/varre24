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
| **3 — Identidad visual (frontend)** | ⏳ **EN CURSO — AQUÍ ME QUEDÉ** | Falta tokenizar el frontend: reemplazar ~2,250 hex de Pilates Room por tokens VARRE24, fuentes, logos, copys "Pilates Room"→"VARRE24", metadatos/PWA, etiquetas `barre`/`especial` y trial en la UI. Inventario de hex ya hecho. |
| **4 — Limpieza + seguridad (resto)** | ⏳ Pendiente | Geo del studio (hoy Zócalo) → Nápoles; quitar branding Xolobitos del pase Apple; seeds/instructores + generar clases; limpiar bloques muertos. |
| **5 — Integraciones** | ⏳ Pendiente | Cablear MercadoPago, WhatsApp, Resend con credenciales reales del studio. |
| **6 — Deploy Railway** | ⏳ Pendiente | Provisionar Postgres, env vars, deploy, verificación end-to-end. |

## Próximo paso concreto (Paso 3)
1. Reescribir tokens en `frontend/src/index.css` (`:root` HSL) y `frontend/tailwind.config.ts` (escala `brand.*` + fuentes) a la paleta VARRE24.
2. Sweep de hex Pilates→VARRE24 en `frontend/src` (top: `#836a5d`, `#2d2d2d`, `#c8b79e`…).
3. Strings "Pilates Room"→"VARRE24", logos/assets, `index.html` + `site.webmanifest` + `sw.js`.
4. Etiquetas de categoría `barre`/`especial` y restricción de trial en el frontend.
5. `npm run build` + correr + screenshot para verificar el look; iterar.

## Cómo correr (local)
```bash
npm install
cp .env.example .env          # configura DATABASE_URL, etc.
npm run dev                   # frontend :5173 (proxy /api) + backend :8080
# o build de prod:
npm run build && npm start
```
Requiere Postgres (local o Railway). El esquema se crea/migra solo al arrancar.
