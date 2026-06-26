# VARRE24

Sistema de reservas para **VARRE24**, studio boutique de Barre y Pilates en Nápoles, CDMX.
Monorepo con **frontend** (React + Vite) y **backend** (Express + PostgreSQL) en un solo repo.

> Rebrandeado y dividido a partir del sistema base `pilates-room`. Conserva toda la
> funcionalidad (reservas, membresías/créditos, pagos, check-in QR, recordatorios por
> WhatsApp, panel admin) y adapta marca + catálogo a VARRE24.

## Estructura

```
varre24/
├── frontend/        # React 18 + Vite + TypeScript + Tailwind/shadcn (SPA)
├── backend/         # Express + pg (API REST + sirve el build del frontend)
│   ├── server/      # index.js (API), emailService.js, tests/
│   ├── supabase/    # migraciones SQL (esquema de la base)
│   └── *.sql / *.js # seeds
├── docs/            # specs de diseño
├── package.json     # npm workspaces (frontend + backend)
├── railway.json     # deploy (Railway / Nixpacks)
└── nixpacks.toml
```

## Requisitos

- Node.js >= 20
- PostgreSQL (Railway Postgres en producción)

## Desarrollo

```bash
npm install                 # instala ambos workspaces
cp .env.example .env        # configura variables (DATABASE_URL, etc.)
npm run dev                 # frontend :5173 (proxy /api) + backend :8080
```

- Frontend (Vite): http://localhost:5173 — proxya `/api` al backend.
- Backend (Express): http://localhost:8080 — API + (en prod) sirve `frontend/dist`.

El esquema de la base se crea/migra al arrancar el backend (`ensureSchema()`).

## Build & producción

```bash
npm run build               # compila el frontend -> frontend/dist
npm start                   # backend sirve la API + el build (un solo proceso)
```

## Deploy (Railway)

Un solo servicio. Nixpacks: `npm install` → `npm run build` → `node backend/server/index.js`.
Configura las variables de entorno en el panel de Railway (ver `.env.example`).
