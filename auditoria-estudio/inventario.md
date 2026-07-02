# Inventario — VARRE24 (Fase 1)

**Fecha de auditoría:** 2026-07-02 · **Modo:** auditoría de código fuente · **Skill:** pilates-studio-auditor

## Perfil de operación

| Aspecto | Valor |
|---|---|
| Tipo | Estudio boutique de **mat/barre** (Barre, Pilates Mat) — sin camas numeradas, cupo 7 |
| Sucursales | Una (Arizona 14, Col. Nápoles, CDMX) |
| Cobro | Mixto: MercadoPago (tarjeta online) + transferencia SPEI con comprobante + pago en estudio |
| Agregadores | No usa TotalPass/Wellhub/Fitpass → dominio F6/EC19 = N/A |
| Tenancy | **Single-tenant** (un solo estudio) → RLS multi-tenant y split payments = N/A |
| Producción | Railway (varre24-web-production.up.railway.app), un servicio Express que sirve API + SPA |

## Stack

- **Backend:** Express + `pg` (Postgres crudo, sin ORM) — `backend/server/index.js` (~16,600 líneas, monolito). Schema autogestionado en arranque (`ensureSchema()`: `CREATE TABLE IF NOT EXISTS` + `ALTER` idempotentes + seeds versionados).
- **Frontend:** React 18 + Vite + TS + Tailwind + shadcn/ui — `frontend/src` (landing pública, portal de clienta `/app/*`, panel admin `/admin/*`, auth).
- **Base de datos:** Postgres (Railway). `DATABASE_URL` con SSL.
- **Auth:** JWT propio (`JWT_SECRET` env), roles `client` / `admin`.

## Actores presentes

| Actor | Superficie | Estado |
|---|---|---|
| Clienta | Portal `/app`: inicio, reservar clase, mis reservas, mis órdenes, checkout, eventos (cumpleaños), perfil, notificaciones | ✔ existe |
| Nueva (visitante) | Landing pública con horario semanal en vivo, planes, registro | ✔ existe |
| Dueña/Admin | Panel `/admin`: dashboard, clientes, pagos (venta manual + verificación), reservas, waitlist, planes, membresías, clases (calendario, tipos, generación semanal), cupones, reportes, auditoría, configuración | ✔ existe |
| Recepcionista | **No hay rol separado** — usa la cuenta admin | ⚠ rol único |
| Instructora | **No hay vista/rol de instructora** — tabla `instructors` existe para asignación de clases | ⚠ sin panel |
| Sistema (jobs) | Crons en proceso: `auto-checkin` (10 min), `auto-revert` de órdenes (60 min), `membership-expiry` (60 min). Webhook MercadoPago con tabla de idempotencia | ✔ existe |

## Módulos detectados

| Módulo | Implementación |
|---|---|
| Registro/login | `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password` + reset por email (Resend), `/api/auth/change-password` |
| Calendario/reservas | `classes` generadas desde plantilla semanal (`schedule_slots`), `GET /api/classes` con cupo en vivo, `POST /api/bookings` (incluye invitada +1 = 2 lugares), waitlist como estado de booking |
| Cancelaciones | `DELETE /api/bookings/:id` con ventana configurable (`cancellation_window` en settings), cupo de cancelaciones gratis por membresía, mensaje de late-cancel |
| Paquetes/planes | Tabla `plans` (vigencia, límite de clases, precio con descuento efectivo/transferencia, no-repetible/trial), catálogo público |
| Membresías | Tabla `memberships` (clases restantes, vencimiento, `order_id`), activación por aprobación de orden o **manual desde admin** (`POST /api/memberships`) |
| Pagos | Órdenes (`orders`): MP checkout pro (preferencia + webhook + `payment_webhook_events` idempotente), transferencia con subida de comprobante (`payment_proofs`), pago en estudio, aprobación/rechazo admin, auto-aprobación provisional con reversión |
| Eventos privados | `event_packages` (cumpleaños) + órdenes sin plan (`event_details` JSONB); módulo `events` + `event_registrations` + `event_passes` (fecha fija) |
| Check-in | Cron `auto-checkin`, check-in/no-show desde admin; walk-in "bloquear lugar" |
| Wallet | Apple PKPass (requiere certs, hoy en "web pass fallback") + Google Wallet + pases de evento con QR |
| Notificaciones | Email (Resend): confirmación/cancelación de reserva, membresía activada, recordatorio semanal, renovación, cumpleaños. WhatsApp vía Evolution API (conexión QR desde admin) + broadcast admin + plantillas configurables. Preferencias de la clienta (recordatorios/promos/resumen) |
| Loyalty | Puntos por compra, bono de cumpleaños (`loyalty_transactions`) |
| Admin/config | Settings editables: ventana de cancelación, validación de pagos, notificaciones, políticas, WhatsApp; auditoría (`AuditLogPage`); cupones (`discount_codes`) |
| Reportes | Ingresos del mes + detalle por fechas + 12 meses, desempeño por tipo de clase, instructoras |

## Integraciones y su estado en producción

| Integración | Estado |
|---|---|
| MercadoPago | Código completo (preferencias, webhook, reconciliación parcial); **sin credenciales en prod** (`isMercadoPagoEnabled()` = false hoy) |
| Resend (email) | Código completo; sin API key en prod |
| WhatsApp (Evolution API) | Código completo (conexión QR, plantillas, broadcast); sin configurar en prod |
| Apple/Google Wallet | Código completo; sin certificados en prod → fallback QR web |

> Nota: la auditoría evalúa **capacidad del sistema** (código), señalando aparte lo que está inactivo por falta de credenciales.
