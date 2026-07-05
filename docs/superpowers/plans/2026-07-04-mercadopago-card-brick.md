# MercadoPago Card Payment Brick — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la redirección a Checkout Pro por un flujo de pago con tarjeta in-app (Card Payment Brick de MercadoPago) en el checkout de VARRE24 y en el reintento de pago desde "Mis órdenes".

**Architecture:** Un nuevo endpoint síncrono `POST /api/orders/:id/pay-card-token` cobra directo contra `POST https://api.mercadopago.com/v1/payments` con el token que ya tokenizó el navegador, y reutiliza la función `approveOrderFromMP` existente (idempotente) para activar la orden en la misma request si el pago se aprueba. En el frontend, un componente reutilizable `CardPaymentBrick` carga el SDK JS v2 de MercadoPago bajo demanda y monta el Brick de tarjeta; se usa tanto en el checkout nuevo (`Checkout.tsx`) como en el reintento de pago (`MyOrders.tsx`). La generación de preferencias de Checkout Pro para tarjeta se elimina de `POST /api/orders` (código muerto desde la UI); el resto de Checkout Pro (webhook, reconciliación, `pay-with-card`) queda intacto sin cambios.

**Tech Stack:** Node.js/Express + `pg` (backend, `backend/server/index.js`), React + TypeScript + TanStack Query + Zustand (frontend), SDK JS v2 de MercadoPago cargado por `<script>` (sin dependencia npm nueva).

---

## Contexto y límites de alcance

Este plan implementa `docs/superpowers/specs/2026-07-04-mercadopago-card-brick-design.md`. Por decisión explícita del alcance:

- **No** se toca `server/lib/mercadopago.js` (no existe ni se crea) — todo el código nuevo vive inline en `backend/server/index.js`, junto al resto del código de MercadoPago.
- **No** se agrega el endpoint admin `sync-mp` (el cron `reconcileMpPayments`, cada 15 min, ya cubre ese caso).
- **No** se agregan tests automatizados nuevos — se verifica manualmente con tarjetas de prueba de MercadoPago (Tarea 7).
- **No** se toca `POST /api/orders/event` (paquetes de cumpleaños) — ese flujo sigue usando Checkout Pro con redirección tal cual está hoy; no está en el alcance de este spec.
- `mpCreatePreference`, el webhook y la reconciliación **no se borran** — quedan disponibles, simplemente dejan de invocarse desde `POST /api/orders` (Tarea 3).
- **Precisión respecto al spec:** el spec menciona `pay-with-card` como otro punto donde se deja de generar la preferencia de Checkout Pro. Este plan **no lo modifica**: su único llamador en el frontend era `retryCardPayment` en `MyOrders.tsx`, y la Tarea 6 lo reemplaza por completo (ya no se llama a `pay-with-card` desde ningún lado). Tocar su cuerpo sería trabajo extra sin ningún efecto observable — queda igual de "sin invocarse desde la UI" ya sea que se edite o no. Si en el futuro algo vuelve a llamarlo directamente, seguiría generando un checkout de Checkout Pro funcional (no está roto, solo sin uso).

---

### Task 1: Backend — funciones puras `mpCreateCardPayment` y `mpRejectionMessage`

**Files:**
- Modify: `backend/server/index.js` (insertar después de `mpSyncPayment`, que termina en la línea 4276 con un `}` seguido de línea en blanco en 4277, justo antes del comentario `// Verifica la firma HMAC del webhook...` en la línea 4278)

- [ ] **Step 1: Ubicar el punto de inserción**

Ejecutar:
```bash
grep -n "^async function mpSyncPayment\|^function mpVerifyWebhookSignature" backend/server/index.js
```
Debe mostrar `mpSyncPayment` seguido más abajo por `mpVerifyWebhookSignature`. El código nuevo se inserta entre el `}` que cierra `mpSyncPayment` y el comentario que antecede a `mpVerifyWebhookSignature`.

- [ ] **Step 2: Insertar las dos funciones**

Justo después del cierre de `mpSyncPayment` (antes del comentario `// Verifica la firma HMAC del webhook...`), insertar:

```js

// Cobra una tarjeta tokenizada por el Card Payment Brick (síncrono, sin
// redirección). A diferencia de Checkout Pro, el pago se crea directo contra
// /v1/payments con el token que ya tokenizó el navegador — el número de
// tarjeta nunca toca este backend.
async function mpCreateCardPayment({ orderId, orderNumber, planName, amount, token,
  paymentMethodId, issuerId, installments, payer }) {
  if (!isMercadoPagoEnabled()) throw new Error("MercadoPago no está configurado (falta MP_ACCESS_TOKEN)");
  const body = {
    transaction_amount: Number(amount),
    token,
    description: `VARRE24 — ${planName || "Membresía"}`,
    installments: Math.max(1, Number(installments) || 1),
    payment_method_id: paymentMethodId,
    payer,
    external_reference: orderId,
    statement_descriptor: MP_STATEMENT_DESCRIPTOR,
    notification_url: `${MP_BACKEND_URL}/webhooks/mercadopago`,
    metadata: { order_id: orderId, order_number: orderNumber || null },
  };
  if (issuerId) body.issuer_id = issuerId;
  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      // Ligado a orderId+token (el token de MP es de un solo uso): un reintento
      // de red con el MISMO token no duplica el cobro; un intento nuevo con
      // token distinto (otra tarjeta) sí genera un cobro nuevo.
      "X-Idempotency-Key": `card-payment-${orderId}-${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // MP responde 201 siempre que el recurso "payment" se creó, sin importar si
  // el resultado final es approved/rejected/in_process. Cualquier otro código
  // (400/401/500) es un error real de la request (token inválido, auth, etc.),
  // no un rechazo de tarjeta.
  if (res.status !== 201) {
    throw new Error(`MercadoPago card payment error ${res.status}: ${JSON.stringify(data)}`);
  }
  return {
    id: data.id,
    status: data.status,
    status_detail: data.status_detail,
  };
}

// Traduce el status_detail de un pago rechazado a un mensaje en español que la
// clienta pueda entender y accionar (reintentar con otra tarjeta, llamar a su
// banco, etc.). Fallback genérico para códigos no mapeados.
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

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check backend/server/index.js`
Expected: sin salida (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add backend/server/index.js
git commit -m "feat(mercadopago): agrega mpCreateCardPayment y mpRejectionMessage"
```

---

### Task 2: Backend — endpoint `POST /api/orders/:id/pay-card-token`

**Files:**
- Modify: `backend/server/index.js` (insertar después del endpoint `pay-with-card`, que cierra con `});` en la línea 5182, antes del comentario `// POST /api/orders/:id/cancel...` en la línea 5184)

- [ ] **Step 1: Ubicar el punto de inserción**

Run: `grep -n "app.post(\"/api/orders/:id/pay-with-card\"\|app.post(\"/api/orders/:id/cancel\"" backend/server/index.js`
El código nuevo va inmediatamente después del `});` que cierra `pay-with-card`, antes del comentario del endpoint `/cancel`.

- [ ] **Step 2: Insertar el endpoint**

```js

// POST /api/orders/:id/pay-card-token — cobra una orden con el Card Payment
// Brick (tarjeta tokenizada en el navegador). SÍNCRONO: si MP aprueba, la
// orden se activa en esta misma request, sin esperar al webhook.
app.post("/api/orders/:id/pay-card-token", authMiddleware, async (req, res) => {
  try {
    if (!isMercadoPagoEnabled()) {
      return res.status(503).json({ message: "El pago con tarjeta no está disponible por el momento." });
    }
    const { token, payment_method_id, issuer_id, installments, payer } = req.body || {};
    if (!token || !payment_method_id) {
      return res.status(400).json({ message: "Faltan datos de la tarjeta." });
    }
    const orderRes = await pool.query(
      `SELECT o.*, COALESCE(p.name, o.event_details->>'package_name') AS plan_name, u.email AS user_email
         FROM orders o
         LEFT JOIN plans p ON o.plan_id = p.id
         JOIN users u ON o.user_id = u.id
        WHERE o.id = $1 AND o.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ message: "Orden no encontrada" });
    const order = orderRes.rows[0];
    if (order.status !== "pending_payment") {
      return res.status(400).json({ message: "Esta orden ya no acepta pagos." });
    }

    let payment;
    try {
      payment = await mpCreateCardPayment({
        orderId: order.id,
        orderNumber: order.order_number,
        planName: order.plan_name,
        // El monto SIEMPRE sale de la orden en BD, nunca del body del request.
        amount: Number(order.total_amount),
        token,
        paymentMethodId: payment_method_id,
        issuerId: issuer_id,
        installments: Number(installments) || 1,
        payer: {
          email: payer?.email || order.user_email || "",
          identification: payer?.identification,
        },
      });
    } catch (mpErr) {
      console.error("POST /api/orders/:id/pay-card-token — MP error:", mpErr.message);
      return res.status(502).json({ message: "No pudimos procesar tu pago. Intenta de nuevo." });
    }

    if (payment.status === "approved") {
      await approveOrderFromMP(order.id, String(payment.id), payment);
      return res.json({ data: { status: "approved" } });
    }

    if (payment.status === "in_process" || payment.status === "pending") {
      await pool.query(
        `UPDATE orders SET status = 'pending_verification', payment_method = 'card',
                payment_provider = 'mercadopago', mp_payment_id = $1, mp_payment_status = $2,
                mp_status_detail = $3, provider_synced_at = NOW(), updated_at = NOW()
          WHERE id = $4`,
        [String(payment.id), payment.status, payment.status_detail || null, order.id]
      );
      return res.json({ data: { status: "pending" } });
    }

    // rejected (o cualquier otro estado no manejado): la orden NO cambia de
    // estado — sigue pending_payment para poder reintentar de inmediato con
    // otra tarjeta, sin crear una orden nueva.
    await pool.query(
      `UPDATE orders SET mp_payment_id = $1, mp_payment_status = $2, mp_status_detail = $3,
              provider_synced_at = NOW(), updated_at = NOW()
        WHERE id = $4`,
      [String(payment.id), payment.status, payment.status_detail || null, order.id]
    );
    return res.status(402).json({ message: mpRejectionMessage(payment.status_detail) });
  } catch (err) {
    console.error("POST /api/orders/:id/pay-card-token error:", err.message);
    return res.status(500).json({ message: "No se pudo procesar el pago." });
  }
});
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check backend/server/index.js`
Expected: sin salida (exit code 0).

- [ ] **Step 4: Correr la suite de tests existente del backend (regresión)**

Run: `cd backend && npm test`
Expected: los 3 archivos de test (`cancellation`, `referrals`, `transfer-flow`) siguen en verde — no dependen de MercadoPago, así que no deben verse afectados.

- [ ] **Step 5: Commit**

```bash
git add backend/server/index.js
git commit -m "feat(mercadopago): endpoint pay-card-token para el Brick in-app"
```

---

### Task 3: Backend — quitar la generación de Checkout Pro en `POST /api/orders`

**Files:**
- Modify: `backend/server/index.js` (dos ediciones dentro del mismo handler `app.post("/api/orders", ...)`)

- [ ] **Step 1: Simplificar la reutilización de orden duplicada (rama de tarjeta)**

Buscar este bloque (dentro del `if (pendingDup.rows.length) {` del endpoint `POST /api/orders`):

```js
      // Pago con tarjeta: en vez de bloquear, REUTILIZAR la orden pendiente y
      // devolver (o regenerar) su checkout de MercadoPago. Antes esto devolvía
      // 409 y el cliente quedaba atascado tras un intento de pago fallido.
      if (paymentMethod === "card" && dup.status === "pending_payment") {
        try {
          let checkoutUrl = dup.mp_checkout_url || null;
          if (!checkoutUrl && isMercadoPagoEnabled()) {
            const dupFull = await pool.query(
              `SELECT o.*, p.name AS plan_name, u.email AS user_email
                 FROM orders o JOIN plans p ON o.plan_id = p.id JOIN users u ON o.user_id = u.id
                WHERE o.id = $1`,
              [dup.id]
            );
            if (dupFull.rows.length) {
              const d = dupFull.rows[0];
              const pref = await mpCreatePreference({
                orderId: d.id,
                orderNumber: d.order_number,
                planName: d.plan_name,
                amount: Number(d.total_amount),
                userEmail: d.user_email || "",
              });
              checkoutUrl = pref.checkout_url;
              await pool.query(
                `UPDATE orders SET payment_method = 'card', payment_provider = 'mercadopago',
                        payment_intent_id = $1, mp_checkout_url = $2, updated_at = NOW()
                  WHERE id = $3`,
                [pref.preference_id, pref.checkout_url, d.id]
              );
            }
          }
          if (checkoutUrl) {
            return res.status(200).json({
              data: { id: dup.id, order_number: dup.order_number, reused: true, mp_checkout_url: checkoutUrl },
            });
          }
        } catch (reuseErr) {
          console.error("[orders] reuse pending card order error:", reuseErr.message);
        }
      }
```

Reemplazarlo por (el Brick in-app cobra directo con el `orderId`, no necesita preferencia de Checkout Pro):

```js
      // Pago con tarjeta: en vez de bloquear, REUTILIZAR la orden pendiente —
      // el Brick in-app cobra directo con el orderId, no hace falta regenerar
      // ninguna preferencia. Antes esto devolvía 409 y el cliente quedaba
      // atascado tras un intento de pago fallido.
      if (paymentMethod === "card" && dup.status === "pending_payment") {
        return res.status(200).json({
          data: { id: dup.id, order_number: dup.order_number, reused: true },
        });
      }
```

- [ ] **Step 2: Quitar la generación de preferencia en la creación normal**

Buscar este bloque (después del `COMMIT` de la creación de la orden nueva):

```js
    // ── Pago con tarjeta en línea: generar checkout de MercadoPago ──
    let mp_checkout_url = null;
    if (paymentMethod === "card") {
      if (!isMercadoPagoEnabled()) {
        console.warn("[orders] MercadoPago no configurado — orden con tarjeta queda pendiente sin checkout");
      } else {
        try {
          const u = await pool.query("SELECT email FROM users WHERE id = $1", [req.userId]);
          const pref = await mpCreatePreference({
            orderId: order.id,
            orderNumber: order.order_number,
            planName: plan.name,
            amount: Number(order.total_amount),
            userEmail: u.rows[0]?.email || "",
          });
          mp_checkout_url = pref.checkout_url;
          await pool.query(
            `UPDATE orders SET payment_provider = 'mercadopago', payment_intent_id = $1, mp_checkout_url = $2, updated_at = NOW() WHERE id = $3`,
            [pref.preference_id, pref.checkout_url, order.id]
          );
          order.payment_provider = "mercadopago";
          order.payment_intent_id = pref.preference_id;
          order.mp_checkout_url = pref.checkout_url;
        } catch (mpErr) {
          console.error("[orders] MercadoPago preference error:", mpErr.message);
          // La orden ya existe; el cliente puede reintentar desde /api/orders/:id/pay-with-card
        }
      }
    }
```

Reemplazarlo por:

```js
    // Pago con tarjeta: ya no se genera preferencia de Checkout Pro aquí — el
    // frontend cobra con el Card Payment Brick in-app vía pay-card-token.
    const mp_checkout_url = null;
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check backend/server/index.js`
Expected: sin salida (exit code 0).

- [ ] **Step 4: Correr la suite de tests existente del backend (regresión)**

Run: `cd backend && npm test`
Expected: sigue en verde.

- [ ] **Step 5: Commit**

```bash
git add backend/server/index.js
git commit -m "refactor(mercadopago): quita la generación de Checkout Pro (no usada) en POST /api/orders"
```

---

### Task 4: Frontend — componente `CardPaymentBrick.tsx`

**Files:**
- Create: `frontend/src/components/payments/CardPaymentBrick.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

declare global {
  interface Window {
    MercadoPago?: any;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadMercadoPagoSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el SDK de MercadoPago."));
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

type CardPaymentBrickProps = {
  orderId: string;
  amount: number;
  payerEmail?: string;
  onApproved: () => void;
  onPending: () => void;
  onRejected: (message: string) => void;
};

const CardPaymentBrick = ({
  orderId, amount, payerEmail, onApproved, onPending, onRejected,
}: CardPaymentBrickProps) => {
  const containerId = useRef(`cardPaymentBrick_container_${orderId}_${Math.random().toString(36).slice(2)}`).current;
  const controllerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      setLoading(true);
      setLoadError(null);
      try {
        await loadMercadoPagoSdk();
        const configRes = await api.get("/public/mp-config");
        const publicKey = configRes.data?.data?.publicKey ?? configRes.data?.publicKey;
        if (!publicKey) throw new Error("MercadoPago no está configurado.");
        if (cancelled) return;

        const mp = new window.MercadoPago(publicKey, { locale: "es-MX" });
        const bricksBuilder = mp.bricks();
        const controller = await bricksBuilder.create("cardPayment", containerId, {
          initialization: {
            amount,
            payer: payerEmail ? { email: payerEmail } : undefined,
          },
          callbacks: {
            onReady: () => { if (!cancelled) setLoading(false); },
            onSubmit: ({ formData }: any) =>
              new Promise<void>((resolve, reject) => {
                api
                  .post(`/orders/${orderId}/pay-card-token`, {
                    token: formData.token,
                    payment_method_id: formData.payment_method_id,
                    issuer_id: formData.issuer_id,
                    installments: formData.installments,
                    payer: formData.payer,
                  })
                  .then((res) => {
                    const status = res.data?.data?.status;
                    if (status === "approved") onApproved();
                    else onPending();
                    resolve();
                  })
                  .catch((err) => {
                    const message =
                      err?.response?.data?.message || "No pudimos procesar tu pago. Intenta con otra tarjeta.";
                    onRejected(message);
                    reject();
                  });
              }),
            onError: (error: any) => {
              console.error("[CardPaymentBrick] error:", error);
              if (!cancelled) {
                setLoading(false);
                setLoadError("No se pudo cargar el formulario de pago. Recarga la página e intenta de nuevo.");
              }
            },
          },
        });
        controllerRef.current = controller;
      } catch (err: any) {
        if (!cancelled) {
          setLoading(false);
          setLoadError(err?.message || "No se pudo cargar el formulario de pago.");
        }
      }
    }

    mount();

    return () => {
      cancelled = true;
      controllerRef.current?.unmount?.();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, amount, payerEmail, containerId]);

  return (
    <div className="space-y-3">
      {loadError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</p>
      )}
      {loading && !loadError && (
        <p className="text-xs text-[#1A060B]/50">Cargando formulario de pago…</p>
      )}
      <div id={containerId} />
    </div>
  );
};

export default CardPaymentBrick;
```

- [ ] **Step 2: Verificar tipos**

Run: `cd frontend && npx tsc -b`
Expected: sin errores (exit code 0). `tsconfig.app.json` tiene `noEmit: true`, así que solo tipa-chequea, no genera archivos.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/payments/CardPaymentBrick.tsx
git commit -m "feat(mercadopago): componente CardPaymentBrick reutilizable"
```

---

### Task 5: Frontend — integrar el Brick en `Checkout.tsx`

**Files:**
- Modify: `frontend/src/pages/client/Checkout.tsx`

- [ ] **Step 1: Agregar imports**

En la parte superior del archivo (junto a los imports existentes de `@/lib/api`, etc.), agregar:

```tsx
import CardPaymentBrick from "@/components/payments/CardPaymentBrick";
import { useAuthStore } from "@/stores/authStore";
```

- [ ] **Step 2: Agregar `"card"` al tipo `Step`**

Buscar:
```tsx
type Step = "select" | "method" | "bank" | "cash" | "upload" | "done";
```
Reemplazar por:
```tsx
type Step = "select" | "method" | "bank" | "cash" | "card" | "upload" | "done";
```

- [ ] **Step 3: Incluir `"card"` en el orden de pasos de `StepBar`**

Buscar (dentro de `const StepBar = ...`):
```tsx
  const order: Step[] = ["select", "method", "bank", "cash", "upload", "done"];
  const currentIdx = order.indexOf(current);
```
Reemplazar por:
```tsx
  const order: Step[] = ["select", "method", "bank", "cash", "card", "upload", "done"];
  const currentIdx = order.indexOf(current);
```

Buscar la línea del cálculo de `active` dentro del mismo componente:
```tsx
        const active = s.id === current || (current === "bank" && s.id === "method") || (current === "cash" && s.id === "method");
```
Reemplazar por:
```tsx
        const active = s.id === current || (current === "bank" && s.id === "method") || (current === "cash" && s.id === "method") || (current === "card" && s.id === "method");
```

- [ ] **Step 4: Agregar estado del Brick y del usuario autenticado**

Dentro de `const Checkout = () => {`, junto a los demás `useState` (cerca de `const [bankDetails, setBankDetails] = useState<any>(null);`), agregar:

```tsx
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardBrickKey, setCardBrickKey] = useState(0);
  const [cardPending, setCardPending] = useState(false);
  const user = useAuthStore((s) => s.user);
```

- [ ] **Step 5: Simplificar `createOrderMutation.onSuccess`**

Buscar:
```tsx
    onSuccess: (res) => {
      const data = res.data?.data ?? res.data;
      setOrderUuid(data.id);
      setOrderId(data.order_number ?? data.orderNumber ?? data.orderId ?? data.id);
      setBankDetails(data.bankDetails ?? data.bank_details);
      const checkoutUrl = data.mp_checkout_url ?? data.mpCheckoutUrl;
      if (paymentMethod === "card") {
        if (checkoutUrl) {
          window.location.href = checkoutUrl; // → página de pago de MercadoPago
          return;
        }
        // MercadoPago no respondió: la orden quedó pendiente, se reintenta desde "Mis órdenes".
        toast({
          title: "No pudimos iniciar el pago en línea",
          description: "Tu orden quedó guardada. Reintenta el pago desde \"Mis órdenes\".",
          variant: "destructive",
        });
        window.location.href = "/app/orders";
        return;
      }
      if (paymentMethod === "transfer") setStep("bank");
      else setStep("cash");
    },
```
Reemplazar por:
```tsx
    onSuccess: (res) => {
      const data = res.data?.data ?? res.data;
      setOrderUuid(data.id);
      setOrderId(data.order_number ?? data.orderNumber ?? data.orderId ?? data.id);
      setBankDetails(data.bankDetails ?? data.bank_details);
      if (paymentMethod === "card") {
        setCardError(null);
        setCardPending(false);
        setStep("card");
        return;
      }
      if (paymentMethod === "transfer") setStep("bank");
      else setStep("cash");
    },
```

- [ ] **Step 6: Renderizar el paso `"card"`**

Buscar el final del bloque `{/* ── Step 2: Payment method ── */}` — específicamente el cierre `)}` que sigue al botón "Seleccionar/Pagar" (justo antes del comentario `{/* ── Step 3a: Bank details (transfer) ── */}`). Insertar el nuevo bloque ahí, antes de `{/* ── Step 3a: Bank details (transfer) ── */}`:

```tsx
          {/* ── Step 2b: Card Payment Brick in-app ── */}
          {step === "card" && (
            <div className="space-y-4">
              <button
                onClick={() => setStep("method")}
                className="flex items-center gap-1.5 text-xs text-[#1A060B]/40 hover:text-[#1A060B]/70 transition-colors"
              >
                <ArrowLeft size={13} /> Cambiar método de pago
              </button>

              <div className="rounded-2xl border border-[#3B0E1A]/20 bg-[#3B0E1A]/5 px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-[#1A060B]/70">{selectedPlan?.name}</span>
                <span className="text-lg font-bold text-[#1A060B]">${finalAmount.toLocaleString("es-MX")} MXN</span>
              </div>

              {cardError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{cardError}</p>
              )}

              {orderUuid && (
                <CardPaymentBrick
                  key={cardBrickKey}
                  orderId={orderUuid}
                  amount={finalAmount}
                  payerEmail={user?.email}
                  onApproved={() => { setCardPending(false); setStep("done"); }}
                  onPending={() => { setCardPending(true); setStep("done"); }}
                  onRejected={(msg) => { setCardError(msg); setCardBrickKey((k) => k + 1); }}
                />
              )}
            </div>
          )}

```

- [ ] **Step 7: Ajustar el copy del paso `"done"` para el caso pendiente**

Buscar:
```tsx
          {/* ── Step 5: Done ── */}
          {step === "done" && (
            <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/5 p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#4ade80]/12 border border-[#4ade80]/30 flex items-center justify-center mx-auto">
                <CheckCircle size={30} className="text-[#4ade80]" />
              </div>
              <p className="text-base font-semibold text-[#1A060B]">¡Tu membresía está activa!</p>
              <p className="text-sm text-[#320C16]">
                Ya puedes reservar tus clases. La admin verificará el comprobante en las próximas 24 horas — te avisamos si encuentra algún detalle.
              </p>
              <button onClick={() => window.location.replace("/app")} className="mt-2 px-6 py-2.5 rounded-xl text-sm font-semibold border border-[#3B0E1A]/20 text-[#1A060B]/70 hover:text-[#1A060B] hover:border-[#3B0E1A]/30 transition-all">
                Ir a mi panel
              </button>
            </div>
          )}
```
Reemplazar por:
```tsx
          {/* ── Step 5: Done ── */}
          {step === "done" && (
            <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/5 p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#4ade80]/12 border border-[#4ade80]/30 flex items-center justify-center mx-auto">
                <CheckCircle size={30} className="text-[#4ade80]" />
              </div>
              <p className="text-base font-semibold text-[#1A060B]">
                {cardPending ? "Tu pago está en revisión" : "¡Tu membresía está activa!"}
              </p>
              <p className="text-sm text-[#320C16]">
                {cardPending
                  ? "Estamos confirmando tu pago con MercadoPago. Te avisamos por correo en cuanto se apruebe."
                  : "Ya puedes reservar tus clases. La admin verificará el comprobante en las próximas 24 horas — te avisamos si encuentra algún detalle."}
              </p>
              <button onClick={() => window.location.replace("/app")} className="mt-2 px-6 py-2.5 rounded-xl text-sm font-semibold border border-[#3B0E1A]/20 text-[#1A060B]/70 hover:text-[#1A060B] hover:border-[#3B0E1A]/30 transition-all">
                Ir a mi panel
              </button>
            </div>
          )}
```

- [ ] **Step 8: Verificar tipos**

Run: `cd frontend && npx tsc -b`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/client/Checkout.tsx
git commit -m "feat(checkout): paso de pago con tarjeta in-app (Card Payment Brick)"
```

---

### Task 6: Frontend — integrar el Brick en `MyOrders.tsx` (reintento de pago)

**Files:**
- Modify: `frontend/src/pages/client/MyOrders.tsx`

- [ ] **Step 1: Agregar imports**

Buscar:
```tsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
```
Reemplazar por:
```tsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import CardPaymentBrick from "@/components/payments/CardPaymentBrick";
import { useAuthStore } from "@/stores/authStore";
```

- [ ] **Step 2: Reemplazar `retryCardPayment` por el estado del modal del Brick**

Buscar:
```tsx
  const [cancelOrder, setCancelOrder] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);
```
Reemplazar por:
```tsx
  const [cancelOrder, setCancelOrder] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cardPayOrder, setCardPayOrder] = useState<any | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardBrickKey, setCardBrickKey] = useState(0);
  const user = useAuthStore((s) => s.user);
```

Buscar:
```tsx
  const retryCardPayment = async (orderId: string) => {
    try {
      const res = await api.post(`/orders/${orderId}/pay-with-card`);
      const url = res.data?.data?.mp_checkout_url ?? res.data?.mp_checkout_url;
      if (url) window.location.href = url;
    } catch (_e) {
      // silencioso — el usuario puede reintentar
    }
  };
```
Reemplazar por:
```tsx
  const openCardRetry = (order: any) => {
    setCardError(null);
    setCardBrickKey((k) => k + 1);
    setCardPayOrder(order);
  };
```

- [ ] **Step 3: Actualizar el botón "Pagar con tarjeta"**

Buscar:
```tsx
                    {o.status === "pending_payment" && isCard && (
                      <Button onClick={() => retryCardPayment(o.id)} size="sm" className="mt-3 w-full sm:w-auto">
                        <CreditCard size={14} className="mr-2" />Pagar con tarjeta
                      </Button>
                    )}
```
Reemplazar por:
```tsx
                    {o.status === "pending_payment" && isCard && (
                      <Button onClick={() => openCardRetry(o)} size="sm" className="mt-3 w-full sm:w-auto">
                        <CreditCard size={14} className="mr-2" />Pagar con tarjeta
                      </Button>
                    )}
```

- [ ] **Step 4: Agregar el modal del Brick**

Buscar el cierre de `</AlertDialog>` (justo antes de `</ClientLayout>`):
```tsx
        </AlertDialog>
      </ClientLayout>
```
Reemplazar por:
```tsx
        </AlertDialog>

        <Dialog open={!!cardPayOrder} onOpenChange={(open) => !open && setCardPayOrder(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pagar con tarjeta</DialogTitle>
            </DialogHeader>
            {cardError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{cardError}</p>
            )}
            {cardPayOrder && (
              <CardPaymentBrick
                key={cardBrickKey}
                orderId={cardPayOrder.id}
                amount={Number(cardPayOrder.total_amount)}
                payerEmail={user?.email}
                onApproved={() => {
                  qc.invalidateQueries({ queryKey: ["my-orders"] });
                  toast({ title: "¡Pago aprobado!", description: "Tu membresía ya está activa." });
                  setCardPayOrder(null);
                }}
                onPending={() => {
                  qc.invalidateQueries({ queryKey: ["my-orders"] });
                  toast({ title: "Tu pago está en revisión", description: "Te avisamos cuando se confirme." });
                  setCardPayOrder(null);
                }}
                onRejected={(msg) => {
                  setCardError(msg);
                  setCardBrickKey((k) => k + 1);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </ClientLayout>
```

- [ ] **Step 5: Verificar tipos**

Run: `cd frontend && npx tsc -b`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/client/MyOrders.tsx
git commit -m "feat(orders): reintento de pago con tarjeta usa el Brick in-app"
```

---

### Task 7: Verificación manual end-to-end

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar el proyecto en local con credenciales de TEST de MercadoPago**

En el panel de desarrolladores de MercadoPago, usar una aplicación de prueba y sus credenciales `TEST-...` (no las de producción) para `MP_ACCESS_TOKEN` y `MP_PUBLIC_KEY` en `backend/.env` local, temporalmente. Luego:

```bash
npm run dev
```

Expected: `frontend` y `backend` arrancan sin errores (ver logs `dev:frontend`/`dev:backend` en la terminal).

- [ ] **Step 2: Probar pago aprobado**

En `/app/checkout`, seleccionar un plan → método "Tarjeta" → confirmar. En el Brick, usar una [tarjeta de prueba de MercadoPago](https://www.mercadopago.com.mx/developers/es/docs/checkout-api/additional-content/your-integrations/test/cards) con nombre de titular `APRO` (aprueba el pago).

Expected: el paso pasa a `"done"` con el mensaje "¡Tu membresía está activa!"; en el admin, la orden aparece `approved` y la membresía se creó.

- [ ] **Step 3: Probar pago rechazado**

Repetir con nombre de titular `OTHE` (rechazo genérico) o `FUND` (fondos insuficientes).

Expected: se muestra el mensaje de rechazo en español (rojo, arriba del Brick), la orden en el admin sigue `pending_payment`, y se puede reintentar sin salir del paso ni crear una orden nueva.

- [ ] **Step 4: Probar pago pendiente**

Repetir con nombre de titular `CONT` (queda in_process/pending).

Expected: el paso pasa a `"done"` con el mensaje "Tu pago está en revisión"; la orden en el admin queda `pending_verification`.

- [ ] **Step 5: Probar el reintento desde "Mis órdenes"**

Crear una orden con tarjeta y dejarla `pending_payment` (cerrar el navegador antes de tokenizar, o cancelar el Brick). Ir a `/app/orders`, click en "Pagar con tarjeta" sobre esa orden, completar el Brick en el modal con `APRO`.

Expected: el modal muestra el Brick, al aprobar se cierra solo, aparece el toast "¡Pago aprobado!" y la orden pasa a `approved` en la lista sin recargar la página.

- [ ] **Step 6: Confirmar que el webhook no duplica nada**

Revisar los logs del backend tras el Step 2 — si el webhook de MP llega después de la aprobación síncrona, debe verse algo como `[MP webhook] ...` procesando el mismo `payment_id` sin error ni duplicar la membresía (la orden ya estaba `approved`, así que `approveOrderFromMP` solo actualiza campos de sync y retorna).

- [ ] **Step 7: Restaurar credenciales**

Devolver `MP_ACCESS_TOKEN`/`MP_PUBLIC_KEY` en `backend/.env` local a los valores que tenías antes de la prueba (o dejarlas vacías si no las usas en local). **No** commitear el archivo `.env`.
