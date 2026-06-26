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
| **4 — Limpieza + seguridad (resto)** | ✅ Hecho | Backend rebrandeado (strings "Pilates Room"→VARRE24, dominio→varre24.com, emails a red/pink, EVOLUTION_INSTANCE), branding ajeno **Xolobitos** quitado del pase Apple (colores+coords), SQL legacy consistente. Seguridad ya OK (admin via env, JWT default marcado, sin secretos hardcodeados). |
| **Landing "Editorial en movimiento"** | ✅ Hecho | Rediseño único (no copia de Pilates Room): 7 secciones editoriales (Hero cinemático, marquee, clases pinned, Experience, Alexandra Murillo, planes, contacto) con paleta Red Pink Bold + Anton. Sistema de movimiento global con **Framer Motion** (primitivas `Reveal`/`MagneticButton`/`Marquee`/`KineticHeading` + `AnimatedRoutes` para transiciones de página en landing/portal/admin). Contenido real de varre24fit.com. 20/20 tests, build verde, review final READY TO MERGE. Spec/plan en `docs/superpowers/`. |
| **5 — Integraciones** | ⏳ Pendiente | Cablear MercadoPago, WhatsApp, Resend con credenciales reales del studio. |
| **6 — Deploy Railway** | ⏳ Pendiente | Provisionar Postgres, env vars, deploy, verificación end-to-end. |

## Próximos pasos / follow-ups
Color, contenido, backend y el nuevo landing ya están. Pendiente:
1. **Assets reales** (lo que más sube la calidad): logo VARRE24, foto del hero y de la
   fundadora (las actuales son placeholder `pilates-room-*` con texto "IN MY PILATES ERA"
   horneado), logo de emails (`pr-logo-email.png`).
2. **Datos reales** (hoy placeholders): dominio `varre24.com`, email `hola@varre24.com`,
   IG/FB, y coords exactas del studio (pase Apple + mapa).
3. **Polish del landing** (no bloqueante): la transición de *salida* de página de
   `AnimatedRoutes` es un no-op (patrón framer+router) — la de entrada sí anima; menú móvil
   (hoy solo wordmark + Entrar); links externos en nueva pestaña (`target/rel`).
4. **Paso 5 — Integraciones:** MercadoPago, WhatsApp (Evolution), Resend con credenciales.
5. **Paso 6 — Deploy Railway:** Postgres, env vars, deploy end-to-end.

## Cómo correr (local)
```bash
npm install
cp .env.example .env          # configura DATABASE_URL, etc.
npm run dev                   # frontend :5173 (proxy /api) + backend :8080
# o build de prod:
npm run build && npm start
```
Requiere Postgres (local o Railway). El esquema se crea/migra solo al arrancar.
