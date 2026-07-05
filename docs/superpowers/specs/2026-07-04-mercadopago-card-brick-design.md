# MercadoPago — Card Payment Brick in-app

**Fecha:** 2026-07-04
**Estado:** Aprobado. En ejecución.

## Contexto

VARRE24 ya tiene MercadoPago **Checkout Pro** funcionando en producción (redirección
al hospedado de MP): `mpCreatePreference`, el webhook `POST /webhooks/mercadopago` con
verificación de firma HMAC, la tabla de idempotencia `payment_webhook_events`, la
función idempotente `approveOrderFromMP`, y un cron de reconciliación
(`reconcileMpPayments`) que corre cada 15 minutos para órdenes de tarjeta que se
quedaron `pending_payment` sin que el webhook llegara. Todo esto vive inline en
`backend/server/index.js` (~15,950 líneas).

Existía un documento de referencia (`MERCADOPAGO.md`, en la raíz del Desktop, fuera
del repo) que describe una arquitectura con dos flujos — Checkout Pro y **Card
Payment Brick** (tarjeta tokenizada dentro de la app) — más una extracción a un
módulo puro `server/lib/mercadopago.js` con tests, y un endpoint admin de
reconciliación manual `sync-mp`. Ese documento no corresponde 1:1 a este repo (rutas,
dominios y hasta el nombre del negocio son de otro proyecto reciclado como plantilla),
pero identificó correctamente el hueco real: **VARRE24 no tiene el flujo Brick
in-app**. El código actual ya lo anticipa — hay un comentario explícito: *"Public Key
... Hoy el flujo es Checkout Pro (redirección) ... Queda lista para Bricks/SDK
embebido"* (`backend/server/index.js:43-44`), y el endpoint
`GET /api/public/mp-config` que expone la public key ya existe sin usarse.

**Alcance de este spec:** implementar el flujo Brick in-app. Explícitamente **fuera
de alcance**: extraer la lógica de MercadoPago a un módulo `lib/` con tests, y el
endpoint admin `sync-mp` (el cron de reconciliación cada 15 min ya cubre ese caso).

## Decisiones tomadas

1. **SDK**: JS vanilla de MercadoPago v2 (`https://sdk.mercadopago.com/js/v2`)
   cargado bajo demanda con un `<script>` tag, sin agregar la dependencia npm
   `@mercadopago/sdk-react`.
2. **Dónde vive el Brick**: como un paso nuevo (`"card"`) dentro del flujo existente
   de `Checkout.tsx` — no una página aparte. Al elegir "Tarjeta" y confirmar, la orden
   se crea igual que hoy pero ya no redirige a MercadoPago; monta el Brick in-app.
3. **Reintento desde "Mis órdenes"**: el botón "Reintentar pago" en `MyOrders.tsx`
   también monta el Brick in-app (ya no redirige a `mp_checkout_url` de Checkout Pro).
4. **Limpieza incluida**: `POST /api/orders` y `POST /api/orders/:id/pay-with-card`
   dejan de generar una preferencia de Checkout Pro para pagos con tarjeta (hoy se
   genera pero ya no la consume ningún flujo de la UI — era una llamada externa
   desperdiciada en cada creación de orden). El código de `mpCreatePreference` /
   Checkout Pro **no se borra** — queda disponible sin invocarse desde estos dos
   puntos, tal como ya describía el comentario existente en el código.
5. **Monto**: sale siempre de `order.total_amount` en BD. El endpoint nuevo nunca
   confía en un monto que venga del cliente.
6. **Rechazos**: un pago `rejected` no cambia el estado de la orden (sigue
   `pending_payment`) — se traduce el `status_detail` a español y la clienta puede
   reintentar con otra tarjeta de inmediato, sin crear una orden nueva.
7. **Sin tests nuevos**: por el alcance elegido (solo Brick, sin extracción a lib),
   no se agrega un módulo de tests dedicado. Verificación manual con tarjetas de
   prueba de MP (aprobada / rechazada / pendiente) antes de dar por cerrado.

## Arquitectura

### Backend (`backend/server/index.js`)

**Nueva función pura**, junto al bloque MercadoPago existente (~línea 4200):

```js
async function mpCreateCardPayment({ orderId, orderNumber, amount, token,
  paymentMethodId, issuerId, installments, payer }) {
  // POST https://api.mercadopago.com/v1/payments
  // body: { transaction_amount: amount, token, description, installments,
  //         payment_method_id, issuer_id, payer, external_reference: orderId,
  //         statement_descriptor: MP_STATEMENT_DESCRIPTOR,
  //         metadata: { order_id: orderId, order_number: orderNumber } }
  // header X-Idempotency-Key: `card-payment-${orderId}-${token}`
  //   (el token de MP es de un solo uso, así que ligar la idempotencia al par
  //   orderId+token evita doble cobro si el navegador reintenta la request sin
  //   que la clienta lo pida, pero permite un nuevo intento con un token nuevo)
}
```

**Nueva función de traducción de rechazos:**

```js
function mpRejectionMessage(statusDetail) {
  const MAP = {
    cc_rejected_insufficient_amount: "Fondos insuficientes.",
    cc_rejected_bad_filled_security_code: "El código de seguridad (CVV) es incorrecto.",
    cc_rejected_bad_filled_date: "La fecha de vencimiento es incorrecta.",
    cc_rejected_bad_filled_card_number: "El número de tarjeta es incorrecto.",
    cc_rejected_bad_filled_other: "Revisa los datos de tu tarjeta e intenta de nuevo.",
    cc_rejected_call_for_authorize: "Tu banco requiere que autorices el pago. Llama a tu banco o intenta con otra tarjeta.",
    cc_rejected_card_disabled: "Tu tarjeta está deshabilitada. Contacta a tu banco o usa otra tarjeta.",
    cc_rejected_duplicated_payment: "Ya se procesó un pago igual. Revisa tus órdenes antes de intentar de nuevo.",
    cc_rejected_high_risk: "El pago fue rechazado por seguridad. Intenta con otra tarjeta.",
    cc_rejected_max_attempts: "Alcanzaste el máximo de intentos. Intenta más tarde u otra tarjeta.",
    cc_rejected_other_reason: "Tu banco rechazó el pago. Intenta con otra tarjeta.",
  };
  return MAP[statusDetail] || "No pudimos procesar tu pago. Intenta con otra tarjeta.";
}
```

**Nuevo endpoint**, junto a `pay-with-card` (~línea 5182):

```
POST /api/orders/:id/pay-card-token
Body: { token, payment_method_id, issuer_id, installments, payer }
```

1. Carga la orden (`WHERE id = $1 AND user_id = $2`), 404 si no existe.
2. 400 si `order.status !== 'pending_payment'`.
3. 503 si `!isMercadoPagoEnabled()`.
4. Llama `mpCreateCardPayment` con `amount = order.total_amount` (nunca del body).
5. Según `status` de la respuesta:
   - `approved` → `approveOrderFromMP(orderId, paymentId, paymentInfo)` en la misma
     request (ya deja `payment_method='card'`, `payment_provider='mercadopago'` y
     `mp_payment_id`/`mp_payment_status` en su propia transacción — no hace falta un
     UPDATE previo). Responde `{ data: { status: "approved" } }`.
   - `in_process` / `pending` → `UPDATE orders SET status='pending_verification',
     mp_payment_id=..., mp_payment_status=..., payment_method='card',
     payment_provider='mercadopago' WHERE id=$1`. Responde
     `{ data: { status: "pending" } }`.
   - `rejected` / cualquier otro → **no** toca `orders.status`; persiste
     `mp_payment_status`/`mp_status_detail` para diagnóstico. Responde 402 con
     `{ message: mpRejectionMessage(status_detail) }`.
6. Errores de red/HTTP contra MP (5xx, timeout) → catch, 502,
   `{ message: "No pudimos procesar tu pago. Intenta de nuevo." }`, orden sin cambios.

El webhook, si llega después de una aprobación síncrona, no reprocesa nada —
`approveOrderFromMP` ya es idempotente (`if (order.status === 'approved') return`).

**Limpieza en `POST /api/orders` y `pay-with-card`:** el bloque que llama
`mpCreatePreference` para `paymentMethod === 'card'` se remueve de ambos endpoints.
La orden con `payment_method='card'` se crea/actualiza sin `mp_checkout_url`.
`mpCreatePreference` y el resto de Checkout Pro (incluida la ruta interna que aún
podría reutilizarse a futuro) permanecen en el archivo, sin llamarse desde aquí.

### Frontend

**Nuevo componente** `frontend/src/components/payments/CardPaymentBrick.tsx`:

Props: `orderId: string`, `amount: number`, `onApproved: () => void`,
`onPending: () => void`, `onRejected: (message: string) => void`.

- `useEffect` con `key` en el div de montaje (para poder forzar remount tras un
  rechazo): carga el script `sdk.mercadopago.com/js/v2` una sola vez (guard global,
  ej. `window.__mpSdkLoaded`), pide `GET /api/public/mp-config` para la public key,
  inicializa `new window.MercadoPago(publicKey, { locale: "es-MX" })`, y monta
  `mp.bricks().create("cardPayment", "cardPaymentBrick_container", { initialization:
  { amount, payer: { email } }, callbacks: { onSubmit, onReady, onError } })`.
- `onSubmit(formData)` → `api.post(`/orders/${orderId}/pay-card-token`, formData)` →
  según la respuesta llama `onApproved` / `onPending` / (en el catch del 402)
  `onRejected(err.response.data.message)`.
- Limpieza: `mp.bricks().get(...)?.unmount()` en el cleanup del efecto.

**`Checkout.tsx`:**
- `Step` gana `"card"`. `STEPS`/`StepBar` tratan `"card"` igual que hoy tratan
  `"cash"`/`"bank"` (paso "Pago" activo, `order` array incluye `"card"`).
- En `createOrderMutation.onSuccess`, si `paymentMethod === "card"`: en vez de
  redirigir con `checkoutUrl`, `setStep("card")` (ya no se espera `mp_checkout_url`
  del backend).
- Paso `"card"` renderiza `<CardPaymentBrick orderId={orderUuid} amount={finalAmount}
  onApproved={() => setStep("done")} onPending={() => setStep("done-pending")}
  onRejected={(msg) => setCardError(msg)} />`. Si hay `cardError`, se muestra arriba
  del Brick (que se remonta con una `key` incremental para permitir reintentar).
  `"done-pending"` reutiliza la tarjeta de éxito de `"done"` con copy distinto
  ("tu pago está siendo verificado, te avisamos por correo").

**`MyOrders.tsx`:**
- `retryCardPayment` deja de llamar `pay-with-card`/redirigir. En su lugar abre un
  modal/panel (ej. `Dialog` ya usado en el archivo para `AlertDialog`) que monta
  `<CardPaymentBrick orderId={o.id} amount={o.total_amount} ...>`. `onApproved` →
  `qc.invalidateQueries(["my-orders"])` + toast de éxito + cerrar modal. `onPending`
  → toast informativo + cerrar. `onRejected` → mostrar el mensaje dentro del modal,
  Brick se remonta para reintentar sin cerrar.

## Manejo de errores — resumen

| Caso | Backend | Frontend |
|---|---|---|
| Tokenización falla en el navegador (Brick `onError`) | no se llama al backend | mensaje genérico, Brick sigue montado |
| `approved` | `approveOrderFromMP` síncrono | paso `"done"` |
| `in_process`/`pending` | orden → `pending_verification` | paso `"done-pending"` |
| `rejected` | orden sin cambios, 402 + mensaje traducido | mensaje inline, Brick se remonta |
| Error de red/HTTP contra MP | 502, orden sin cambios | mensaje genérico, reintentar |
| Orden no pertenece al usuario / no es `pending_payment` | 404/400 | mensaje de error, redirige a "Mis órdenes" |

## Testing

Verificación manual con las tarjetas de prueba de MercadoPago (modo producción no
tiene sandbox de tarjetas — se prueba con montos bajos y tarjetas propias, o se
alterna `MP_ACCESS_TOKEN`/`MP_PUBLIC_KEY` a credenciales de test temporalmente en
local):
- Pago aprobado → orden se activa al instante, membresía creada, sin duplicar si el
  webhook llega después.
- Pago rechazado → mensaje en español correcto, orden sigue `pending_payment`,
  se puede reintentar en el mismo paso.
- Pago pendiente/in_process → orden pasa a `pending_verification`, el cron de
  reconciliación o el webhook la resuelven.
- Reintento desde "Mis órdenes" con una orden `pending_payment` existente.

No se agregan tests automatizados (fuera del alcance elegido para este spec).

## Referencias

- Documento de referencia externo que originó este spec: `MERCADOPAGO.md` (Desktop,
  plantilla de otro proyecto — no corresponde 1:1 a este repo).
- Checkout Pro existente: `backend/server/index.js` (`mpCreatePreference`,
  `mpVerifyWebhookSignature`, `approveOrderFromMP`, `handleMpPaymentNotification`,
  `reconcileMpPayments`).
- `GET /api/public/mp-config` (`backend/server/index.js:8773`) — ya expone la public
  key, se reutiliza sin cambios.
