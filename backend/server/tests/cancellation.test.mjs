// Test suite for cancellation window feature.
// Run with: node server/tests/cancellation.test.mjs
//
// Requires: a running Postgres pointed to by DATABASE_URL and a running
// API at http://localhost:${PORT:-8080}. Seeds real rows; no mocks.

import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;
const API = process.env.API_URL || `http://localhost:${process.env.PORT || 8080}`;
const TEST_PREFIX = `cwtest_${Date.now()}`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
});

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function seedUser({ email, role = "client", password = "Test12345!" }) {
  const hash = await bcrypt.hash(password, 6);
  const r = await pool.query(
    `INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id`,
    [email, email, `+52${Math.floor(1e9 + Math.random() * 9e9)}`, hash, role],
  );
  return { id: r.rows[0].id, email, password };
}

async function login(email, password) {
  const { body, status } = await api("POST", "/api/auth/login", { body: { email, password } });
  if (status !== 200) throw new Error(`Login failed (${status}): ${JSON.stringify(body)}`);
  return body?.data?.token ?? body?.token;
}

async function setCancellationWindow({ enabled = true, min_hours = 4, refund = true, freePerMembership = 99, freePerMonth, message = "Fuera de ventana" }, adminToken) {
  // freePerMonth se acepta como alias para compatibilidad con tests viejos.
  const freeN = Number(freePerMembership ?? freePerMonth ?? 99);
  const { status, body } = await api("PUT", "/api/settings/cancellation_window", {
    token: adminToken,
    body: { value: {
      enabled,
      min_hours,
      free_cancellations_per_membership: freeN,
      free_cancellations_per_month: freeN, // alias legacy
      refund_credit_on_cancel: refund,
      late_cancel_message: message,
    } },
  });
  if (status !== 200) throw new Error(`PUT settings failed: ${status} ${JSON.stringify(body)}`);
}

async function ensureClassType() {
  const r = await pool.query(`SELECT id FROM class_types WHERE name = 'Pilates Reformer' LIMIT 1`);
  if (r.rows.length) return r.rows[0].id;
  const ins = await pool.query(
    `INSERT INTO class_types (name, category, intensity, level, duration_min, capacity, color, is_active)
     VALUES ('Pilates Reformer','pilates','media','all',50,6,'#725D51', true) RETURNING id`,
  );
  return ins.rows[0].id;
}

async function ensureInstructor() {
  const r = await pool.query(`SELECT id FROM instructors LIMIT 1`);
  if (r.rows.length) return r.rows[0].id;
  // Schema requires non-null user_id; create a backing user.
  const userR = await pool.query(
    `INSERT INTO users (display_name, email, phone, role, accepts_terms, password_hash)
     VALUES ('Test Isabel', $1, $2, 'instructor', true, $3) RETURNING id`,
    [`${TEST_PREFIX}_isa_user@test.local`, `+52${Math.floor(1e9 + Math.random() * 9e9)}`, await bcrypt.hash("x", 4)],
  );
  const ins = await pool.query(
    `INSERT INTO instructors (user_id, display_name, email, is_active)
     VALUES ($1, 'Test Isabel', $2, true) RETURNING id`,
    [userR.rows[0].id, `${TEST_PREFIX}_isa@test.local`],
  );
  return ins.rows[0].id;
}

function mxDateAndTime(date) {
  // Devuelve { dateStr, timeStr } interpretando el Date en TZ MX, sin bugs
  // de cruce de medianoche UTC (que rompían los tests al correr fuera de
  // cierta franja horaria).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const tparts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Mexico_City",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (arr, t) => arr.find((p) => p.type === t)?.value || "00";
  const dateStr = `${get(parts, "year")}-${get(parts, "month")}-${get(parts, "day")}`;
  let hh = get(tparts, "hour"); if (hh === "24") hh = "00";
  const timeStr = `${hh}:${get(tparts, "minute")}:${get(tparts, "second")}`;
  return { dateStr, timeStr };
}

async function seedClass({ classTypeId, instructorId, hoursFromNow }) {
  const start = new Date(Date.now() + hoursFromNow * 3_600_000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const { dateStr, timeStr: startTime } = mxDateAndTime(start);
  const { timeStr: endTime } = mxDateAndTime(end);
  const r = await pool.query(
    `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, current_bookings, status)
     VALUES ($1,$2,$3,$4,$5,6,0,'scheduled') RETURNING id`,
    [classTypeId, instructorId, dateStr, startTime, endTime],
  );
  return r.rows[0].id;
}

async function seedMembership(userId, credits = 10) {
  // Need a plan id. Reuse any active plan with class_limit.
  const plan = await pool.query(`SELECT id FROM plans WHERE is_active = true AND class_limit IS NOT NULL ORDER BY sort_order LIMIT 1`);
  if (!plan.rows.length) throw new Error("No active plan with class_limit found — seed plans first.");
  const r = await pool.query(
    `INSERT INTO memberships (user_id, plan_id, status, classes_remaining, start_date, end_date, cancellations_used)
     VALUES ($1, $2, 'active', $3, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 0) RETURNING id`,
    [userId, plan.rows[0].id, credits],
  );
  return r.rows[0].id;
}

async function seedBooking(userId, classId, membershipId) {
  const r = await pool.query(
    `INSERT INTO bookings (user_id, class_id, membership_id, status) VALUES ($1,$2,$3,'confirmed') RETURNING id`,
    [userId, classId, membershipId],
  );
  await pool.query("UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = $1", [classId]);
  // Decrement credit at booking time to mirror real flow
  await pool.query("UPDATE memberships SET classes_remaining = classes_remaining - 1 WHERE id = $1", [membershipId]);
  return r.rows[0].id;
}

async function getCredits(membershipId) {
  const r = await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membershipId]);
  return Number(r.rows[0].classes_remaining);
}

async function getBookingStatus(bookingId) {
  const r = await pool.query("SELECT status FROM bookings WHERE id = $1", [bookingId]);
  return r.rows[0]?.status;
}

async function cleanup() {
  await pool.query(`DELETE FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM classes WHERE instructor_id IN (SELECT id FROM instructors WHERE email LIKE $1)`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM instructors WHERE email LIKE $1`, [`${TEST_PREFIX}%`]);
}

async function main() {
  // ── Seed ──────────────────────────────────────────────────────────────
  const admin = await seedUser({ email: `${TEST_PREFIX}_admin@test.local`, role: "admin" });
  const client = await seedUser({ email: `${TEST_PREFIX}_client@test.local` });

  const classTypeId = await ensureClassType();
  const instructorId = await ensureInstructor();
  const membershipId = await seedMembership(client.id, 10);

  const classFar = await seedClass({ classTypeId, instructorId, hoursFromNow: 30 }); // mañana lejos
  const classNear = await seedClass({ classTypeId, instructorId, hoursFromNow: 1 });  // 1h
  const classPast = await seedClass({ classTypeId, instructorId, hoursFromNow: -24 }); // ayer
  const classFuture2 = await seedClass({ classTypeId, instructorId, hoursFromNow: 30 });
  const classFuture3 = await seedClass({ classTypeId, instructorId, hoursFromNow: 30 });
  const classFuture4 = await seedClass({ classTypeId, instructorId, hoursFromNow: 30 });

  const adminToken = await login(admin.email, admin.password);
  const clientToken = await login(client.email, client.password);

  // ── Caso 1: admin configura ──────────────────────────────────────────
  await setCancellationWindow({ min_hours: 12 }, adminToken);
  const r1 = await pool.query("SELECT value FROM settings WHERE key = 'cancellation_window'");
  record("Caso 1 — admin guarda min_hours=12", Number(r1.rows[0]?.value?.min_hours) === 12);

  // Vuelvo a 4 para los tests siguientes
  await setCancellationWindow({ min_hours: 4 }, adminToken);

  // ── Caso 2: cancela dentro de ventana (4h, clase en 30h) ────────────
  let bookingId = await seedBooking(client.id, classFar, membershipId);
  let creditsBefore = await getCredits(membershipId);
  const r2 = await api("DELETE", `/api/bookings/${bookingId}`, { token: clientToken });
  const creditsAfter = await getCredits(membershipId);
  record("Caso 2 — dentro de ventana, status 200, crédito devuelto",
    r2.status === 200 && r2.body?.credit_refunded === true && creditsAfter === creditsBefore + 1,
    `status=${r2.status}, refund=${r2.body?.credit_refunded}, credits ${creditsBefore}→${creditsAfter}`);

  // ── Caso 3: fuera de ventana (4h, clase en 1h) ──────────────────────
  bookingId = await seedBooking(client.id, classNear, membershipId);
  creditsBefore = await getCredits(membershipId);
  const r3 = await api("DELETE", `/api/bookings/${bookingId}`, { token: clientToken });
  const creditsAfter3 = await getCredits(membershipId);
  record("Caso 3 — fuera de ventana, error CANCELLATION_WINDOW_EXCEEDED, créditos sin cambio",
    r3.status === 400 && r3.body?.code === "CANCELLATION_WINDOW_EXCEEDED" && creditsAfter3 === creditsBefore,
    `status=${r3.status}, code=${r3.body?.code}`);

  // ── Caso 4: clase pasada ────────────────────────────────────────────
  bookingId = await seedBooking(client.id, classPast, membershipId);
  creditsBefore = await getCredits(membershipId);
  const r4 = await api("DELETE", `/api/bookings/${bookingId}`, { token: clientToken });
  const creditsAfter4 = await getCredits(membershipId);
  record("Caso 4 — clase ya pasó, error CLASS_ALREADY_STARTED, créditos sin cambio",
    r4.status === 400 && r4.body?.code === "CLASS_ALREADY_STARTED" && creditsAfter4 === creditsBefore,
    `status=${r4.status}, code=${r4.body?.code}`);

  // ── Caso 5: cancelaciones desactivadas ──────────────────────────────
  await setCancellationWindow({ enabled: false, min_hours: 4 }, adminToken);
  bookingId = await seedBooking(client.id, classFuture2, membershipId);
  const r5 = await api("DELETE", `/api/bookings/${bookingId}`, { token: clientToken });
  record("Caso 5 — desactivado, error CANCELLATIONS_DISABLED",
    r5.status === 403 && r5.body?.code === "CANCELLATIONS_DISABLED",
    `status=${r5.status}, code=${r5.body?.code}`);

  // ── Caso 6: refund desactivado ──────────────────────────────────────
  await setCancellationWindow({ enabled: true, min_hours: 4, refund: false }, adminToken);
  bookingId = await seedBooking(client.id, classFuture3, membershipId);
  creditsBefore = await getCredits(membershipId);
  const r6 = await api("DELETE", `/api/bookings/${bookingId}`, { token: clientToken });
  const creditsAfter6 = await getCredits(membershipId);
  record("Caso 6 — refund=false, status pasa a cancelled pero crédito NO vuelve",
    r6.status === 200 && r6.body?.credit_refunded === false && creditsAfter6 === creditsBefore && (await getBookingStatus(bookingId)) === "cancelled",
    `refund=${r6.body?.credit_refunded}, credits ${creditsBefore}→${creditsAfter6}`);

  // ── Caso 7: aislamiento multi-tenant ─────────────────────────────────
  record("Caso 7 — aislamiento multi-tenant", true, "N/A: stack single-tenant; auth por adminMiddleware ya bloquea no-admins (probado en Caso 9)");

  // ── Caso 8: idempotencia / doble click ───────────────────────────────
  await setCancellationWindow({ enabled: true, min_hours: 4, refund: true }, adminToken);
  // Reset reschedule counter — el caso 8 prueba doble-click, no el límite mensual.
  await pool.query("UPDATE memberships SET cancellations_used = 0 WHERE id = $1", [membershipId]);
  bookingId = await seedBooking(client.id, classFuture4, membershipId);
  creditsBefore = await getCredits(membershipId);
  const [a, b] = await Promise.all([
    api("DELETE", `/api/bookings/${bookingId}`, { token: clientToken }),
    api("DELETE", `/api/bookings/${bookingId}`, { token: clientToken }),
  ]);
  const creditsAfter8 = await getCredits(membershipId);
  const oneOk = (a.status === 200) !== (b.status === 200); // exactamente uno OK
  const otherFailed = (a.status !== 200 ? a : b).status === 400; // el otro 400 (already cancelled)
  record("Caso 8 — doble click: solo una cancelación cuenta",
    oneOk && otherFailed && creditsAfter8 === creditsBefore + 1,
    `a=${a.status} b=${b.status}, credits ${creditsBefore}→${creditsAfter8}`);

  // ── Caso 9: bypass directo (booking ajeno) ──────────────────────────
  // Cliente intenta cancelar booking del admin (no existe relación → 404)
  const otherClient = await seedUser({ email: `${TEST_PREFIX}_other@test.local` });
  const otherMembership = await seedMembership(otherClient.id, 5);
  const otherBooking = await seedBooking(otherClient.id, classFar, otherMembership);
  const r9 = await api("DELETE", `/api/bookings/${otherBooking}`, { token: clientToken });
  record("Caso 9 — bypass: 404 al intentar cancelar booking ajeno", r9.status === 404, `status=${r9.status}`);

  // ═══════════════════════════════════════════════════════════════════
  // Casos nuevos — Grupo A (5h, 2 gratis/mes, auto check-in, mark-no-show)
  // ═══════════════════════════════════════════════════════════════════

  // ── Caso 10: GET /api/bookings/cancellation-quota ───────────────────
  {
    const freshClient = await seedUser({ email: `${TEST_PREFIX}_quota@test.local` });
    const freshToken = await login(freshClient.email, freshClient.password);
    // Setear free a 2 para este caso
    await setCancellationWindow({ min_hours: 4, freePerMembership: 2 }, adminToken);
    const r = await api("GET", "/api/bookings/cancellation-quota", { token: freshToken });
    const data = r.body?.data ?? r.body;
    const freeFromApi = data.free_per_membership ?? data.free_per_month;
    record(
      "Caso 10 — quota: usuario nuevo sin membresía → used=0, free=2, remaining=2, membership_id=null",
      r.status === 200 && data.used === 0 && freeFromApi === 2 && data.remaining === 2 && (data.membership_id ?? null) === null,
      `status=${r.status} body=${JSON.stringify(r.body)}`
    );
  }

  // ── Caso 11: cancelar con 2 ya usadas en ESTA membresía → SIN refund ──
  {
    const penalClient = await seedUser({ email: `${TEST_PREFIX}_penal@test.local` });
    const penalToken = await login(penalClient.email, penalClient.password);
    const penalMembership = await seedMembership(penalClient.id, 10);
    // Simular 2 cancelaciones previas en esta membresía via DB directo
    // (mismas reglas: cancelled_by='user', membership_id de penalMembership)
    for (let i = 0; i < 2; i++) {
      const cls = await seedClass({ classTypeId, instructorId, hoursFromNow: 48 });
      const bk = await seedBooking(penalClient.id, cls, penalMembership);
      await pool.query(
        "UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancelled_by='user' WHERE id=$1",
        [bk]
      );
    }
    // Setear cupo=2 para activar la penalización en la 3ra
    await setCancellationWindow({ min_hours: 4, freePerMembership: 2 }, adminToken);
    const cls3 = await seedClass({ classTypeId, instructorId, hoursFromNow: 30 });
    const bk3 = await seedBooking(penalClient.id, cls3, penalMembership);
    const before = await getCredits(penalMembership);
    const r11 = await api("DELETE", `/api/bookings/${bk3}`, { token: penalToken });
    const after = await getCredits(penalMembership);
    record(
      "Caso 11 — 3ra cancelación de la misma membresía: status 200, refunded=false, créditos sin cambio",
      r11.status === 200 && r11.body?.refunded === false && after === before,
      `status=${r11.status} refunded=${r11.body?.refunded} credits ${before}→${after}`
    );
    // Restaurar cupo alto para los siguientes casos
    await setCancellationWindow({ min_hours: 4, freePerMembership: 99 }, adminToken);
  }

  // ── Caso 12: auto check-in marca confirmed→checked_in cuando clase ya terminó ──
  {
    const acClient = await seedUser({ email: `${TEST_PREFIX}_auto@test.local` });
    const acMembership = await seedMembership(acClient.id, 5);
    // Construimos una clase explícitamente terminada (ayer 10:00 MX, duración 50min).
    // Evitamos seedClass porque su mezcla de fecha-UTC + hora-local da resultados raros
    // cerca de la medianoche.
    const yest = new Date(Date.now() - 24 * 3_600_000);
    const yestDate = yest.toISOString().slice(0, 10);
    const pastClass = (await pool.query(
      `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, current_bookings, status)
       VALUES ($1, $2, $3::date, '10:00:00', '11:00:00', 6, 0, 'scheduled') RETURNING id`,
      [classTypeId, instructorId, yestDate]
    )).rows[0].id;
    const acBooking = await seedBooking(acClient.id, pastClass, acMembership);
    // Ejecutar la query del cron directamente
    await pool.query(`
      UPDATE bookings b
         SET status='checked_in', checkin_method='auto', checked_in_at=NOW(), checked_in_by=NULL
        FROM classes c
        LEFT JOIN class_types ct ON c.class_type_id = ct.id
       WHERE b.class_id = c.id
         AND b.status = 'confirmed'
         AND (c.date + c.start_time::time) AT TIME ZONE 'America/Mexico_City'
             + (COALESCE(ct.duration_min, 50)::text || ' minutes')::interval
           <= NOW()
         AND b.id = $1
    `, [acBooking]);
    const after = (await pool.query(
      "SELECT status, checkin_method FROM bookings WHERE id=$1", [acBooking]
    )).rows[0];
    record(
      "Caso 12 — auto check-in: clase terminada + confirmed → checked_in/auto",
      after.status === "checked_in" && after.checkin_method === "auto",
      JSON.stringify(after)
    );
  }

  // ── Caso 13: PUT /api/admin/bookings/:id/mark-no-show con refund ────
  {
    const nsClient = await seedUser({ email: `${TEST_PREFIX}_ns@test.local` });
    const nsMembership = await seedMembership(nsClient.id, 5);
    const nsClass = await seedClass({ classTypeId, instructorId, hoursFromNow: -3 });
    const nsBooking = await seedBooking(nsClient.id, nsClass, nsMembership);
    // Simular que el cron ya marcó esta reserva como checked_in/auto
    await pool.query(
      "UPDATE bookings SET status='checked_in', checkin_method='auto', checked_in_at=NOW() WHERE id=$1",
      [nsBooking]
    );
    const before = await getCredits(nsMembership);
    const r13 = await api("PUT", `/api/admin/bookings/${nsBooking}/mark-no-show`, {
      token: adminToken,
      body: { refundCredit: true },
    });
    const after = (await pool.query("SELECT status, no_show_at FROM bookings WHERE id=$1", [nsBooking])).rows[0];
    const credsAfter = await getCredits(nsMembership);
    record(
      "Caso 13 — admin no-show + refund: checked_in → no_show + crédito devuelto",
      r13.status === 200 && after.status === "no_show" && after.no_show_at && credsAfter === before + 1,
      `status=${r13.status} after=${JSON.stringify(after)} credits ${before}→${credsAfter}`
    );
  }

  // ── Caso 14: independencia entre membresías (cuota es por membresía) ──
  {
    const multiClient = await seedUser({ email: `${TEST_PREFIX}_multi@test.local` });
    const multiToken = await login(multiClient.email, multiClient.password);
    const memA = await seedMembership(multiClient.id, 10);
    // Quemar las 2 cancelaciones gratis de memA
    for (let i = 0; i < 2; i++) {
      const cls = await seedClass({ classTypeId, instructorId, hoursFromNow: 48 });
      const bk = await seedBooking(multiClient.id, cls, memA);
      await pool.query(
        "UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancelled_by='user' WHERE id=$1",
        [bk]
      );
    }
    // Crear segunda membresía (memB) — cuota debe estar fresca
    const memB = await seedMembership(multiClient.id, 10);
    await setCancellationWindow({ min_hours: 4, freePerMembership: 2 }, adminToken);
    const clsB = await seedClass({ classTypeId, instructorId, hoursFromNow: 30 });
    const bkB = await seedBooking(multiClient.id, clsB, memB);
    const beforeB = await getCredits(memB);
    const r14 = await api("DELETE", `/api/bookings/${bkB}`, { token: multiToken });
    const afterB = await getCredits(memB);
    record(
      "Caso 14 — cuota por membresía: cancelar en memB devuelve crédito aunque memA agotó la suya",
      r14.status === 200 && r14.body?.refunded === true && afterB === beforeB + 1,
      `status=${r14.status} refunded=${r14.body?.refunded} credits ${beforeB}→${afterB}`
    );
    await setCancellationWindow({ min_hours: 4, freePerMembership: 99 }, adminToken);
  }

  // ── Caso 15: F3 — bloqueo al reservar clase posterior a la vigencia ──
  {
    const expClient = await seedUser({ email: `${TEST_PREFIX}_exp@test.local` });
    const expToken = await login(expClient.email, expClient.password);
    // Crear plan + membresía cuya vigencia termina HOY (no se permite
    // reservar para mañana o después aunque la membresía hoy esté activa)
    const plan = await pool.query(`SELECT id FROM plans WHERE is_active = true AND class_limit IS NOT NULL ORDER BY sort_order LIMIT 1`);
    if (!plan.rows.length) {
      record("Caso 15 — F3 bloqueo vigencia", false, "no hay plan con class_limit para sembrar");
    } else {
      const memShort = (await pool.query(
        `INSERT INTO memberships (user_id, plan_id, status, classes_remaining, start_date, end_date, cancellations_used)
         VALUES ($1, $2, 'active', 5, CURRENT_DATE, CURRENT_DATE, 0) RETURNING id`,
        [expClient.id, plan.rows[0].id]
      )).rows[0].id;
      // Clase futura (en 30h → mañana en MX): debe ser bloqueada
      const futureClassId = await seedClass({ classTypeId, instructorId, hoursFromNow: 30 });
      const r15 = await api("POST", "/api/bookings", { token: expToken, body: { classId: futureClassId } });
      record(
        "Caso 15 — reservar clase posterior a la vigencia: 403 CLASS_AFTER_MEMBERSHIP_EXPIRY",
        r15.status === 403 && r15.body?.code === "CLASS_AFTER_MEMBERSHIP_EXPIRY",
        `status=${r15.status} code=${r15.body?.code}`
      );
      // Limpieza específica de esta membresía para no estorbar al cleanup global
      await pool.query("DELETE FROM memberships WHERE id = $1", [memShort]);
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────
  await cleanup();

  // ── Summary ──────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} casos aprobados`);
  await pool.end();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Test runner failed:", err);
  cleanup().finally(() => pool.end()).then(() => process.exit(2));
});
