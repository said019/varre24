# Reporte de auditoría — VARRE24
**Fecha:** 2026-07-02 · **Skill:** pilates-studio-auditor · **Input:** código fuente completo (backend Express+pg ~16.6k líneas + frontend React) · **Método:** 136 escenarios (matriz A–L + 25 edge cases) auditados por 14 agentes con evidencia archivo:línea; los 26 escenarios críticos pasaron verificación adversarial independiente.

---

## 1. Resumen ejecutivo

**Veredicto:** VARRE24 tiene un **núcleo transaccional sólido** (reservas atómicas con lock, descuento de crédito exactamente una vez y auditado, idempotencia de webhook, firma HMAC, activación manual de mostrador) pero **la mitad de la vida real alrededor de ese núcleo está a medias o falta**: cobertura global **54%**.

Los 3 hoyos más caros:
1. **Cancelar una clase deja huérfanas a las alumnas**: no se les devuelve el crédito, no se les avisa nada, y el auto-checkin les "consume" la asistencia de una clase que nunca ocurrió. Cada clase cancelada = clientas que pagaron por nada y se enteran al llegar al estudio.
2. **Un pago con tarjeta puede cobrarse sin entregar nada**: si MercadoPago manda primero "pendiente" y luego "aprobado" (pasa con pagos en efectivo/transferencia vía MP y con revisiones antifraude), la aprobación se descarta por un bug de idempotencia — y no existe reconciliación automática que lo rescate.
3. **El check-in no valida nada**: se puede marcar asistencia a una reserva en lista de espera (clase consumida con CERO descuento = clase regalada), y el doble clic duplica puntos de lealtad.

Los 3 quick wins (juntos ≈ 1–2 días): arreglar la clave de idempotencia del webhook (30 min), cancelación de clase en cascada con devolución+aviso (1 día), y endurecer el endpoint de check-in (2 h).

*Nota de contexto: MercadoPago, Resend (email), WhatsApp y Wallet tienen el código completo pero **sin credenciales en producción** — hoy el estudio opera solo con transferencia/efectivo y sin notificaciones reales. Varios hallazgos se activan el día que enciendan esas integraciones.*

---

## 2. Scorecard por dominio

| Dominio | ✅ | ⚠️ | ❌ | ➖ | ❓ | Cobertura | Semáforo |
|---|---|---|---|---|---|---|---|
| A — Registro e identidad | 3 | 6 | 1 | 0 | 0 | 60% | 🟡 |
| B — Horarios y reservas | 4 | 3 | 5 | 1 | 0 | 46% | 🔴 |
| C — Cancelaciones y waitlist | 2 | 2 | 4 | 0 | 0 | 38% | 🔴 |
| D — Paquetes y membresías | 4 | 6 | 3 | 0 | 0 | 54% | 🔴 |
| E — Pagos | 1 | 4 | 4 | 1 | 0 | 33% | 🔴 |
| F — Check-in y asistencia | 2 | 4 | 2 | 1 | 0 | 50% | 🔴 |
| G — Wallet passes | 1 | 6 | 0 | 0 | 0 | 57% | 🔴 |
| H — Notificaciones | 2 | 5 | 3 | 0 | 0 | 45% | 🔴 |
| I — Panel admin | 5 | 5 | 0 | 1 | 0 | 75% | 🟡 |
| J — Instructoras | 2 | 3 | 0 | 0 | 0 | 70% | 🟡 |
| K — Reportes | 0 | 5 | 1 | 1 | 0 | 42% | 🔴 |
| L — Seguridad y datos | 2 | 4 | 0 | 1 | 1 | 57% | 🔴 |
| EC — Edge cases 1–12 | 6 | 3 | 3 | 0 | 0 | 62% | 🟡 |
| EC — Edge cases 13–25 | 3 | 7 | 1 | 2 | 0 | 59% | 🔴 |
| **Global (136 escenarios)** | **37** | **63** | **27** | **8** | **1** | **54%** | 🔴 |

**Lo que SÍ está bien (verificado adversarialmente):** reserva atómica con `FOR UPDATE` + índice único anti-doble-reserva (EC1/EC2 ✅), descuento de crédito una sola vez con log de auditoría (`membership_credit_log`), firma HMAC del webhook con `timingSafeEqual` + defensa en profundidad (siempre consulta el estado real a la API de MP) (L6 ✅), secretos solo en env (L8 ✅), venta manual de mostrador en 3 pasos (I4 ✅), CRUD completo de operación (I1 ✅), regla determinista de qué membresía descuenta (D9/EC13 ✅).

---

## 3. Gaps priorizados

### P0 — Sangra dinero o confianza YA

#### P0-1 · [C5+H3] Cancelar una clase deja huérfanas a las reservadas 🔴🔴
- **Qué pasa hoy:** `PUT /api/classes/:id/cancel` (index.js:8663) es un solo `UPDATE classes SET status='cancelled'`. Las reservas siguen `confirmed`, nadie recupera crédito, nadie recibe aviso — y `runAutoCheckin` (index.js:14947) **no filtra por status de la clase**, así que al pasar la hora marca `checked_in` a todas: asistencia consumida en una clase que no existió.
- **Qué debería pasar:** cancelación en cascada dentro de una transacción: cancelar bookings, devolver créditos (con log), notificar email/WhatsApp y sugerir alternativas; y el auto-checkin debe excluir clases canceladas.
- **Por qué es P0 para ESTE estudio:** con una sola instructora por clase, una gripa = clase cancelada; hoy eso quema créditos pagados de hasta 7 clientas por clase, en silencio.
- **Dónde vive el fix:** `PUT /api/classes/:id/cancel` + `runAutoCheckin` (backend/server/index.js).
- **Esfuerzo:** 1 día (incluye plantilla de aviso). → *Quick win #2*

#### P0-2 · [E3+E4+EC10+D2] Tarjeta: la aprobación tardía se descarta y no hay reconciliación 🔴🔴🔴
- **Qué pasa hoy:** la clave de idempotencia es `payment:<mpPaymentId>` **sin el status** (index.js:4405). MP notifica el mismo `payment_id` en cada transición (`pending` → `approved`): la primera notificación consume la clave y la aprobación posterior muere en el `23505 → return`. Además no existe cron/botón de reconciliación contra `payments/search` (E4 ❌) y el `back_url` solo hace polling del estado **local** (MyOrders.tsx:43-52). Única red de seguridad: verificación manual del admin cuando la clienta reclama.
- **Qué debería pasar:** clave de idempotencia por `payment:<id>:<status>` (o reprocesar si el status cambió) + job de reconciliación cada N minutos que consulte pagos aprobados sin activar.
- **Por qué es P0:** es el escenario literal de "la clienta pagó y no recibió su paquete". Hoy MP está apagado; **esto explota el día que lo enciendan**.
- **Dónde vive el fix:** webhook handler (index.js:4404-4417) + nuevo cron `reconcileMpPayments`.
- **Esfuerzo:** 30 min (clave) + medio día (reconciliación). → *Quick win #1*

#### P0-3 · [F2+F3+F8+F1] Check-in sin validaciones 🔴×4
- **Qué pasa hoy:** `PUT /api/bookings/:id/check-in` (index.js:12106) hace el UPDATE sin exigir estado previo: (a) una reserva en **waitlist** se puede marcar asistida — como el crédito se descuenta al reservar y waitlist no descuenta, es una **clase gratis** invisible; (b) el doble clic/retry **duplica puntos de lealtad** y re-sync del wallet; (c) no fija `checkin_method`; (d) no existe check-in por QR de clase (el QR del wallet solo sirve para eventos) — F1 ❌ por matriz, aunque con cupo 7 el roster manual es operable.
- **Qué debería pasar:** `UPDATE ... WHERE id=$1 AND status='confirmed' RETURNING *`; si venía de waitlist, promover explícitamente (descontar crédito + cupo en transacción) o rechazar; loyalty con clave única por booking; endpoint de check-in por QR que resuelva pass → reserva del día.
- **Dónde vive el fix:** index.js:12106-12133 (+ BookingsList.tsx `canCheckin`).
- **Esfuerzo:** 2 h el endurecimiento; el QR de clase, 2–3 días. → *Quick win #3*

#### P0-4 · [D8+E2+EC8] Activación manual sin fecha retroactiva ni referencia 🔴🔴🟠
- **Qué pasa hoy:** la venta de mostrador funciona (I4 ✅) pero `POST /api/memberships` siempre inicia **hoy** (no acepta start_date retroactivo si la clienta pagó el lunes y la registran el jueves → pierde días pagados) y el pago manual no captura referencia/folio de transferencia ni quién lo registró en un registro contable propio.
- **Qué debería pasar:** `startDate` editable (retroactivo) con vigencia calculada desde ahí, y campos referencia + `registered_by` en el registro del pago.
- **Dónde vive el fix:** `POST /api/memberships` (index.js:10931) + PaymentsPage wizard.
- **Esfuerzo:** medio día.

#### P0-5 · [C1+B5+H4+C8] La waitlist es un callejón sin salida 🔴🟠🟠⚪
- **Qué pasa hoy:** cancelar libera el cupo (C1 ⚠️: crédito devuelto según cupo de cancelaciones gratis — política válida) **pero nadie promueve ni avisa a la lista de espera**: las alumnas en waitlist se quedan ahí para siempre, no pueden salirse solas (C8 ❌), y el lugar liberado se lo lleva quien refresque primero.
- **Qué debería pasar:** al liberar cupo → promover a la primera de waitlist (descontando su crédito en transacción) + aviso con ventana de confirmación, o al menos notificación de "se liberó un lugar".
- **Dónde vive el fix:** `DELETE /api/bookings/:id` (post-liberación) + job de promoción + plantilla de aviso.
- **Esfuerzo:** 1–2 días.

#### P0-6 · [B8+B1] Callejones de reserva (UX que cuesta ventas) 🔴🔴
- **Qué pasa hoy:** sin membresía o sin créditos, la clienta ve el motivo pero **sin CTA** a comprar (B8 ⚠️); y el calendario de reserva no muestra lugares disponibles ni instructora en la tarjeta (B1 ⚠️ — el dato ya viaja en `GET /api/classes`, la UI lo ignora).
- **Esfuerzo:** 1–2 h ambos. → *Quick wins #4 y #5*

#### P0-7 · [I3] Sin notas internas del staff; notas de salud expuestas 🔴
- **Qué pasa hoy:** el único campo de notas es `health_notes`, que la clienta ve y edita; no hay notas solo-staff (deudas, incidentes, acuerdos).
- **Dónde vive el fix:** columna `users.admin_notes` (o tabla `client_notes`) nunca expuesta en `mapUser`.
- **Esfuerzo:** 2 h.

### P1 — Cuesta clientas de forma medible

| Gap | Detalle | Dónde |
|---|---|---|
| C7 ❌ | Mover una clase de horario no notifica ni da opción de cancelar sin castigo | PUT /api/admin/classes/:id |
| C4 ❌ | No hay reagendar atómico (cancelar+reservar puede comerse una cancelación gratis) | nuevo endpoint |
| E6+EC11 ❌ | Sin flujo de reembolso (total/parcial); el workaround (reject) no calcula proporcional | admin orders |
| H2 ⚠️ | No hay recordatorio 24h/2h antes de la clase (solo resumen semanal) | cron + plantillas |
| H10+EC21 ❌ | Fallos de entrega de WhatsApp/email no se registran → clientas "no avisadas" invisibles | tabla message_log |
| A3 ⚠️ | El email es inmutable (ni admin puede corregirlo); recuperación de contraseña depende de él | PUT /api/users/:id |
| A4+J2 ⚠️ | health_notes no aparece en el roster de clase → la instructora no ve lesiones/embarazos | GET /api/classes/:id/roster |
| D4/D5/D6 ⚠️ | Renovación: recordatorio existe (email semanal) pero sin CTA de renovar 1-tap ni política clara de vencidos | frontend + settings |
| D7+EC5 ❌ | No existe congelar/pausar membresía | memberships + admin |
| B6/B7 ❌ | Ventana de reserva y límites anti-acaparamiento no configurables | settings + POST /api/bookings |
| B11 ❌ | No-shows repetidos sin política automática (strikes) | cron |
| G1–G7 ⚠️ | Wallet passes: código completo pero sin certs en prod; falta re-descarga fácil y estado vencido | env + perfil |
| K4 ⚠️ | "Paquetes por vencer" existe como dato pero no como lista accionable para recepción | ReportsPage |
| L4/L5 ⚠️ | Sin rate limiting en endpoints públicos; validación server-side dispareja (sin Zod) | middleware |
| EC6 ⚠️ | Ventanas de cancelación calculadas con hora del server (UTC en Railway) vs hora CDMX — auto-checkin ya usa TZ correcta, el resto no consistente | helpers de fecha |

### P2 — Operación y pulido

A5 (waiver sin versión/fecha) · A6 (menores sin tutor) · A9/EC15 (ARCO/borrado) · A10 (merge duplicados) · A8 (conversión de trials) · B10 (reserva recurrente) · D10 (gift cards) · D13 (upgrade prorrateado) · E7/EC12 (chargebacks) · E9 (CFDI) · EC14 (trial→compra métrica) · EC18 (QR compartido) · EC22 (instructora-clienta) · H7/H8/H9 (win-back, cumpleaños vía WhatsApp, opt-out fino) · J5 (nómina por clases) · K7 (export CSV) · K1–K5 (desgloses de reportes) · L2/L3 (aviso de privacidad para datos de salud, ARCO documentado)

---

## 4. Quick wins (impacto alto / esfuerzo bajo)

### QW1 — Idempotencia por status en el webhook (30 min) — mata P0-2a
```js
// backend/server/index.js — handler /webhooks/mercadopago
// ANTES: const eventKey = `payment:${mpPaymentId}`;
const payment = await mpSyncPayment(mpPaymentId);          // mover ANTES del insert
const eventKey = `payment:${mpPaymentId}:${payment.status}`; // pending y approved ya no chocan
try {
  await pool.query(
    `INSERT INTO payment_webhook_events (provider, event_key, event_type, payload)
     VALUES ('mercadopago', $1, 'payment', $2)`,
    [eventKey, JSON.stringify(req.body || {})]
  );
} catch (e) { if (e.code === "23505") return; throw e; }
await handleMpPaymentNotification(mpPaymentId, payment);   // pasarle el payment ya consultado
```

### QW2 — Cancelación de clase en cascada (1 día) — mata P0-1
```js
// PUT /api/classes/:id/cancel — reemplazo del UPDATE suelto
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const cls = await client.query(
    `UPDATE classes SET status='cancelled', updated_at=NOW()
      WHERE id=$1 AND status!='cancelled' RETURNING *`, [req.params.id]);
  if (!cls.rows.length) { await client.query("ROLLBACK"); return res.status(409).json({ message: "Ya estaba cancelada" }); }

  const bookings = await client.query(
    `UPDATE bookings SET status='cancelled', updated_at=NOW()
      WHERE class_id=$1 AND status IN ('confirmed','waitlist')
      RETURNING id, user_id, membership_id, status`, [req.params.id]);

  for (const b of bookings.rows.filter(x => x.membership_id)) {
    await client.query(
      `UPDATE memberships SET classes_remaining = classes_remaining + 1, updated_at=NOW()
        WHERE id=$1 AND classes_remaining IS NOT NULL`, [b.membership_id]);
    await logCreditChange({ client, membershipId: b.membership_id, delta: +1,
      reason: "class_cancelled_by_studio", bookingId: b.id });
  }
  await client.query("COMMIT");
  notifyClassCancelled(cls.rows[0], bookings.rows).catch(console.error); // email+WA post-commit
  res.json({ ok: true, refunded: bookings.rows.length });
} catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
```
```sql
-- runAutoCheckin: agregar el filtro que falta
AND c.status != 'cancelled'
```

### QW3 — Endurecer check-in (2 h) — mata P0-3a/b
```js
// PUT /api/bookings/:id/check-in
const r = await pool.query(
  `UPDATE bookings SET status='checked_in', checkin_method='manual_reception',
          checked_in_at=NOW(), checked_in_by=$2
    WHERE id=$1 AND status='confirmed' RETURNING *`, [req.params.id, req.userId]);
if (!r.rows.length) {
  const cur = await pool.query("SELECT status FROM bookings WHERE id=$1", [req.params.id]);
  if (cur.rows[0]?.status === "checked_in") return res.json({ ok: true, already: true, message: "Ya tenía check-in" });
  if (cur.rows[0]?.status === "waitlist")  return res.status(409).json({ message: "Está en lista de espera: promuévela primero (descuenta crédito y cupo)" });
  return res.status(404).json({ message: "Reserva no encontrada o cancelada" });
}
// lealtad idempotente: índice único parcial
// CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_checkin_once ON loyalty_transactions(booking_id) WHERE type='earn_checkin';
```

### QW4 — Cupos e instructora en la tarjeta del calendario (1 h) — mata B1
```tsx
{/* BookClasses.tsx, dentro de la tarjeta de clase — el dato YA viene en la API */}
<p className="mt-1 font-alilato text-[0.66rem] uppercase tracking-[0.1em] text-[#9C8A8B]">
  {cls.instructor_name} · {Math.max(0, (cls.max_capacity ?? 7) - (cls.current_bookings ?? 0))} lugares
</p>
```

### QW5 — CTA de compra en el bloqueo de reserva (30 min) — mata B8
```tsx
{noCredits && (
  <Link to="/app/checkout" className="press mt-3 inline-flex rounded-full bg-[#3B0E1A] px-5 py-2.5
    font-alilato text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#FFD6E6]">
    Comprar plan para reservar
  </Link>
)}
```

---

## 5. Anexo — escenarios no verificables (❓)

| ID | Qué falta para confirmarlo |
|---|---|
| L7 (backups) | Acceso al dashboard de Railway: confirmar que el Postgres tiene backups automáticos activos y probar una restauración. El código no puede demostrarlo. |

**Verificaciones pendientes de segunda ronda** (falló el verificador por límite de sesión; verificadas manualmente por el auditor principal en esta corrida): EC1 ✅, EC2 ✅, EC9 ✅, EC10 ⚠️, F2 ⚠️, F3 ⚠️, F8 ⚠️, I1 ✅, I3 ⚠️, I4 ✅, L6 ✅ (con nota: configurar `MP_WEBHOOK_SECRET` al habilitar MP), L8 ✅.
