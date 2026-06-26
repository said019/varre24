# VARRE24 — Diseño del sistema de reservas (rebrand de pilates-room)

**Fecha:** 2026-06-26
**Estado:** Aprobado (enfoque A). En ejecución por fases.

## Contexto

VARRE24 es un studio boutique de **Barre y Pilates** en Arizona 14, Piso 3, Col. Nápoles,
Benito Juárez, 03810, CDMX. Marca: elegante, minimalista, femenina, cálida, premium
accesible ("modernidad con un toque de lujo sutil"). Cliente ideal: mujeres y adultos
jóvenes 22–35.

El sitio actual (`varre24fit.com`, Next.js) está a medias. En vez de terminarlo, se
**rebrandeará y reutilizará** un sistema de reservas ya funcional y maduro: el repo
`pilates-room` (https://github.com/said019/pilates-room), propiedad del usuario.

Referencia visual/de marca: `maren-studio` (página de Mariana) — paleta cálida
terracota/coral/crema.

## Decisiones tomadas

1. **Alcance v1:** conservar TODA la funcionalidad que ya existe; solo rebrandear y
   adaptar el catálogo (clases/precios/cupo) a VARRE24.
2. **Integraciones activas al lanzar:** MercadoPago (tarjeta + SPEI), WhatsApp
   (Evolution API) y Email (Resend). Apple/Google Wallet quedan **configuradas pero
   apagadas** (degradan sin romper). El **check-in con QR sigue activo** (el QR vive en
   el portal del cliente; no depende del pase de wallet).
3. **Sin integración** con FitPass / Wellhub / TotalPass: solo se mencionan/enlazan en
   el sitio, no se conectan.
4. **Hosting/BD:** Railway + Postgres de Railway (Postgres puro vía `pg`, sin SDK de
   Supabase).
5. **Identidad visual:** paleta cálida tipo maren (terracota/coral/crema).
6. **Estructura:** un solo repo dividido en `frontend/` + `backend/` (workspaces).
7. **Enfoque A** (trasplantar, dividir y rebrandear). Refactor del backend solo
   quirúrgico (lo que el rebrand exija); NO modularizar el monolito en v1.

## El sistema base (qué conservamos)

Plataforma full-stack de reservas para studio boutique:

- **Frontend:** Vite + React 18 + TS, shadcn/ui + Tailwind, Zustand (auth) + TanStack
  Query, react-router. 3 áreas: landing público, portal cliente (`/app/*`), panel admin
  (`/admin/*`). Auth JWT (token en localStorage).
- **Backend:** Express monolítico (`server/index.js`, ~16k líneas), **Postgres puro**
  (`pg`, sin ORM/Supabase SDK), ~210 endpoints, ~35 tablas creadas al arranque vía
  `ensureSchema()` (idempotente). Auth JWT (HS256, 30d) + bcrypt. Roles: client,
  instructor, admin, super_admin, reception.
- **Reservas:** calendario semanal, cupo configurable, lista de espera, invitado (+1 =
  2 créditos), créditos por membresía, ventana de cancelación con cuota de cancelaciones
  gratis + penalización, no-show.
- **Pagos:** MercadoPago Checkout Pro (tarjeta) + transferencia SPEI con comprobante y
  verificación (auto-aprobación 24h, cron de auto-revert).
- **Check-in:** QR (base64 del userId), check-in manual + automático, roster por clase.
- **WhatsApp:** recordatorios automáticos (clase, renovación) vía Evolution API, en crons
  `setInterval` (zona America/Mexico_City).
- **Email:** Resend (bienvenida, confirmaciones, reset password, etc.).
- **Extras (se conservan):** lealtad/puntos, referidos, reseñas, eventos, Apple/Google
  Wallet, portal de coaches, venta de videos.
- **Deploy:** Railway + Nixpacks, un solo proceso (Express sirve el build del frontend).

## Arquitectura objetivo (monorepo)

```
varre24/
├── frontend/        # React + Vite + TS (src/, public/, index.html, configs)
├── backend/         # Express + pg (server/, supabase/migrations, seeds)
├── shared/          # (futuro) tipos/constantes compartidos
├── docs/            # specs
├── package.json     # npm workspaces ["frontend","backend"]
├── railway.json     # startCommand: node backend/server/index.js
└── nixpacks.toml    # install → build (frontend) → start (backend)
```

- **Dev:** Vite `:5173` con `proxy /api → :8080`; script raíz `dev` (concurrently)
  levanta ambos.
- **Prod (Railway):** un solo servicio. Build del frontend → `frontend/dist`; el backend
  lo sirve (`distDir` resuelto por candidatos, default `../../frontend/dist`). Un `$PORT`.
- **Gestor de paquetes:** npm (se elimina `bun.lockb`).

## Catálogo VARRE24 (reemplaza el de Pilates Room)

- **Clases:** Pilates Mat (60 min), Barre (60 min), Experience Class (2 h, especial,
  $500), B'Day (evento). **Cupo 7** en clases regulares.
- **Planes / precios (MXN):**
  | Plan | Precio | Notas |
  |------|--------|-------|
  | Clase prueba | $120 | 1 clase, validez corta |
  | Clase individual | $270 | 1 crédito |
  | Paquete 4 clases/mes | $500 | 4 créditos, 30 días |
  | Membresía mensual | $990 | hasta 3 clases/sem (ver nota) |
  | Plan ilimitado 6 meses | $16,000 | ilimitado, 180 días |
- **Membresía mensual = "3 clases/semana":** se modela como **12 créditos válidos 30
  días** (≈3/sem). Si se requiere tope real por semana, es lógica extra (pendiente de
  confirmar con el usuario; default = 12 créditos/mes).
- **Políticas:** sin devoluciones tras activar membresía; penalización **$70** desde la
  2ª falta/cancelación tardía. (Ya soportado por `cancellation_window` +
  `free_cancellations_per_membership`.)
- **Cumpleaños:** B'Day Basic $3,499 / B'Day Plus $5,000 (como eventos/paquetes).
- **Experience Class:** 1 evento mensual, precio/contenido variable.
- **FitPass/Wellhub/TotalPass:** solo informativo en el sitio (sin integración).

## Identidad visual

**CORRECCIÓN (2026-06-26):** la paleta NO es terracota/crema (eso fue un supuesto
derivado de "maren" en una sesión previa). La paleta oficial sale del deck de marca del
usuario ("Red Pink Bold Modern Fashion" — VARRE24 Marketing Plan): **rojo + rosa bold**.

Paleta oficial (deck):

- **Cherry Cola** `#7C0116` — primario (CTA, links, firma de marca)
- **Claret** `#670626` — marca profunda / títulos / superficies oscuras / footer
- **Pink** `#FFBDC5` — secundario suave / fills rosados
- **Hibiscus Tonic** `#E0A4B0` — acento rosa empolvado

Neutros derivados para UI: fondo blush `#FFF1F3`, superficie `#FFF7F8`, superficie-2
`#FFE4E8`, borde `#F3CCD4`, muted `#FBE3E7`, texto principal (ink vino) `#2B0911`, texto
secundario `#9B5A66`. Tokenizado en `frontend/src/index.css` (:root HSL) +
`frontend/tailwind.config.ts` (escala `brand.*`).

Tipografía actual: **Inter Tight** (cuerpo) + **Fraunces** (títulos, serif editorial).
NOTA: el deck usa un display bold/condensado pesado para titulares — pendiente confirmar
con el usuario si se cambia Fraunces por un display tipo Druk/Anton. Logo/wordmark
VARRE24 y fotos nuevas: pendientes (hoy se usan assets de Pilates Room).

## Integraciones

- **Activas (con credenciales del usuario):** MercadoPago MX, Evolution/WhatsApp, Resend.
- **Apagadas pero listas:** Apple/Google Wallet (requieren cuenta Apple Developer / GCP).
- Todas degradan con guardas `isXEnabled()`; el sistema arranca sin ellas.

## Limpieza y seguridad (parte del rebrand)

- **Esquema:** consolidar a un esquema canónico + **una** semilla VARRE24. Quitar la
  migración legacy de 5 tablas (`...06e61368...`) y los 3 sets de precios/planes en
  conflicto (`fix_plans_real_prices`, seeds duplicados).
- **Secretos de terceros (YA eliminados en el split):** docs `.md` con una API key de
  Evolution de otro studio (redactada) y URLs ajenas; `seed-pilates-room.js` con URL de
  Postgres + password en vivo (NO copiado).
- **Pendiente (Paso 4):** quitar contraseñas/emails de admin hardcodeados
  (`server/index.js` ~1745, 1767–1768) y moverlos a env/onboarding; `JWT_SECRET` real;
  corregir coordenadas del studio (hoy Zócalo `19.4326,-99.1332`) a Nápoles CDMX; quitar
  branding Xolobitos del `wallet-assets/apple-pass/pass.json`.

## Plan por fases

1. **Monorepo split** (frontend/ + backend/, workspaces, configs, build verde). ← en curso
2. **Catálogo VARRE24** (clases, planes/precios, cupo 7, políticas, schedule base).
3. **Identidad visual** (tokens de color, fuentes, logos, copys, metadatos, PWA).
4. **Limpieza de esquema/seeds + hardening de seguridad.**
5. **Configurar integraciones** (MercadoPago, WhatsApp, Resend) con credenciales reales.
6. **Deploy a Railway** + verificación end-to-end.

Cada fase: cambios pequeños y verificables; el sistema debe seguir arrancando y
compilando entre fases.

## Lo que se necesita del usuario (puede llegar después de construir)

Cuenta MercadoPago MX (access token + webhook secret + public key); número + servidor
Evolution API; dominio verificado en Resend; datos bancarios SPEI reales; emails/usuarios
admin de VARRE24; logos/fotos VARRE24; (opcional) Apple Developer + GCP para wallet.
