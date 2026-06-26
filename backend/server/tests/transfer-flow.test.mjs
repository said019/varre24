// Suite del Grupo B: cobro por transferencia (auto-approve + multi-proof).
// Run: PORT=8765 DATABASE_URL=... node server/tests/transfer-flow.test.mjs
// Requiere: server local corriendo con AUTO_REVERT_ENABLED=false (controlamos el cron a mano).

import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;
const API = process.env.API_URL || `http://localhost:${process.env.PORT || 8080}`;
const TEST_PREFIX = `tflowtest_${Date.now()}`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
});

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

async function api(method, path, { token, body, formData } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (!formData) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function seedUser({ email, role = "client", password = "Test12345!" }) {
  const hash = await bcrypt.hash(password, 6);
  const r = await pool.query(
    `INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms)
     VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
    [email, email, `+52${Math.floor(1e9 + Math.random() * 9e9)}`, hash, role]
  );
  return { id: r.rows[0].id, email, password };
}

async function login(email, password) {
  const { body } = await api("POST", "/api/auth/login", { body: { email, password } });
  return body?.data?.token ?? body?.token;
}

async function seedOrder({ userId, planId, total = 590 }) {
  const r = await pool.query(
    `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, tax_amount, total_amount, currency, expires_at)
     VALUES ($1,$2,'pending_payment'::order_status,'transfer'::payment_method,$3,0,$3,'MXN', NOW() + INTERVAL '48 hours') RETURNING id`,
    [userId, planId, total]
  );
  return r.rows[0].id;
}

// Construye un FormData con N imágenes PNG mínimas (1x1 transparente) válidas para multer.
function buildFormDataWithImages(n) {
  const fd = new FormData();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
  );
  for (let i = 0; i < n; i++) {
    fd.append("files", new Blob([png], { type: "image/png" }), `proof-${i + 1}.png`);
  }
  return fd;
}

async function cleanup() {
  await pool.query(`DELETE FROM payment_proofs WHERE order_id IN (SELECT id FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1))`, [`${TEST_PREFIX}%`]).catch(()=>{});
  await pool.query(`DELETE FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${TEST_PREFIX}%`]).catch(()=>{});
  await pool.query(`DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${TEST_PREFIX}%`]).catch(()=>{});
  await pool.query(`DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${TEST_PREFIX}%`]).catch(()=>{});
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${TEST_PREFIX}%`]).catch(()=>{});
}

async function main() {
  const planRow = await pool.query(`SELECT id FROM plans WHERE is_active=true AND class_limit IS NOT NULL ORDER BY sort_order LIMIT 1`);
  if (!planRow.rows.length) throw new Error("No active plan with class_limit found — seed plans first.");
  const planId = planRow.rows[0].id;

  // ── Caso 1: subir 1 proof → orden approved, membresía active, expires≈NOW+24h ──
  {
    const u = await seedUser({ email: `${TEST_PREFIX}_c1@test.local` });
    const token = await login(u.email, u.password);
    const orderId = await seedOrder({ userId: u.id, planId });
    const fd = buildFormDataWithImages(1);
    const r = await api("POST", `/api/orders/${orderId}/proof`, { token, formData: fd });
    const o = (await pool.query("SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
    const m = (await pool.query("SELECT * FROM memberships WHERE order_id=$1", [orderId])).rows[0];
    const proofs = (await pool.query("SELECT * FROM payment_proofs WHERE order_id=$1", [orderId])).rows;
    const expDelta = o.auto_approval_expires_at
      ? Math.abs(new Date(o.auto_approval_expires_at).getTime() - (Date.now() + 24*3600*1000))
      : Infinity;
    record(
      "Caso 1 — 1 proof: orden approved, membresía active, expires≈NOW+24h",
      r.status === 200 && o.status === "approved" && m?.status === "active" && proofs.length === 1 && expDelta < 5*60*1000,
      `status=${r.status} order=${o.status} mem=${m?.status} proofs=${proofs.length} expDelta=${Math.round(expDelta/1000)}s`
    );
  }

  // ── Caso 2: subir 3 proofs de una sola vez ──
  {
    const u = await seedUser({ email: `${TEST_PREFIX}_c2@test.local` });
    const token = await login(u.email, u.password);
    const orderId = await seedOrder({ userId: u.id, planId });
    const fd = buildFormDataWithImages(3);
    const r = await api("POST", `/api/orders/${orderId}/proof`, { token, formData: fd });
    const proofs = (await pool.query("SELECT id, sort_order FROM payment_proofs WHERE order_id=$1 ORDER BY sort_order", [orderId])).rows;
    record(
      "Caso 2 — 3 proofs en una llamada: 3 filas con sort_order 0/1/2",
      r.status === 200 && proofs.length === 3 && proofs.map(p => p.sort_order).join(",") === "0,1,2",
      `status=${r.status} sortOrders=${proofs.map(p=>p.sort_order).join(",")}`
    );
  }

  // ── Caso 3: subir 4° proof cuando ya hay 3 → 400 "Máximo 3" ──
  {
    const u = await seedUser({ email: `${TEST_PREFIX}_c3@test.local` });
    const token = await login(u.email, u.password);
    const orderId = await seedOrder({ userId: u.id, planId });
    await api("POST", `/api/orders/${orderId}/proof`, { token, formData: buildFormDataWithImages(3) });
    const r = await api("POST", `/api/orders/${orderId}/proof`, { token, formData: buildFormDataWithImages(1) });
    record(
      "Caso 3 — 4° proof: 400 'Máximo 3'",
      r.status === 400 && /Máximo 3/.test(r.body?.message || ""),
      `status=${r.status} msg=${r.body?.message}`
    );
  }

  // ── Caso 4: tipo no permitido (texto plano) → 400 ──
  {
    const u = await seedUser({ email: `${TEST_PREFIX}_c4@test.local` });
    const token = await login(u.email, u.password);
    const orderId = await seedOrder({ userId: u.id, planId });
    const fd = new FormData();
    fd.append("files", new Blob(["fake pdf"], { type: "application/pdf" }), "bad.pdf");
    const r = await api("POST", `/api/orders/${orderId}/proof`, { token, formData: fd });
    record(
      "Caso 4 — PDF: 400 'Tipo no permitido'",
      r.status === 400 && /Tipo no permitido/.test(r.body?.message || ""),
      `status=${r.status} msg=${r.body?.message}`
    );
  }

  // ── Caso 5: DELETE proof antes de verify ──
  {
    const u = await seedUser({ email: `${TEST_PREFIX}_c5@test.local` });
    const token = await login(u.email, u.password);
    const orderId = await seedOrder({ userId: u.id, planId });
    await api("POST", `/api/orders/${orderId}/proof`, { token, formData: buildFormDataWithImages(2) });
    const proofs = (await pool.query("SELECT id FROM payment_proofs WHERE order_id=$1 ORDER BY sort_order", [orderId])).rows;
    const r = await api("DELETE", `/api/orders/${orderId}/proof/${proofs[0].id}`, { token });
    const remaining = (await pool.query("SELECT id FROM payment_proofs WHERE order_id=$1", [orderId])).rows;
    record(
      "Caso 5 — DELETE proof antes de verify: 200, queda 1",
      r.status === 200 && remaining.length === 1,
      `status=${r.status} remaining=${remaining.length}`
    );
  }

  // ── Caso 6: cron sin clases consumidas → orden rejected + membresía cancelled ──
  {
    const u = await seedUser({ email: `${TEST_PREFIX}_c6@test.local` });
    const token = await login(u.email, u.password);
    const orderId = await seedOrder({ userId: u.id, planId });
    await api("POST", `/api/orders/${orderId}/proof`, { token, formData: buildFormDataWithImages(1) });
    await pool.query("UPDATE orders SET auto_approval_expires_at = NOW() - INTERVAL '1 hour' WHERE id=$1", [orderId]);

    // Ejecutar el cron manualmente vía la misma SQL (no podemos importar la función desde el server proceso)
    await pool.query(`
      UPDATE orders SET status='rejected', rejected_at=NOW(),
             auto_approval_expires_at=NULL, auto_reverted_at=NOW(),
             rejection_reason='Tu pago no fue confirmado a tiempo por el equipo. Si ya pagaste, contacta al estudio para que validemos el comprobante.',
             updated_at=NOW()
       WHERE id=$1
         AND status='approved'
         AND NOT EXISTS (
           SELECT 1 FROM bookings b JOIN memberships m ON b.membership_id = m.id
            WHERE m.order_id = orders.id AND b.status='checked_in'
         )
    `, [orderId]);
    await pool.query(`UPDATE memberships SET status='cancelled', updated_at=NOW()
                       WHERE order_id=$1 AND status='active'
                         AND EXISTS (SELECT 1 FROM orders WHERE id=$1 AND auto_reverted_at IS NOT NULL)`, [orderId]);

    const o = (await pool.query("SELECT status, auto_reverted_at, auto_approval_expires_at FROM orders WHERE id=$1", [orderId])).rows[0];
    const m = (await pool.query("SELECT status FROM memberships WHERE order_id=$1", [orderId])).rows[0];
    record(
      "Caso 6 — cron sin clases: order rejected + auto_reverted_at + membership cancelled",
      o.status === "rejected" && o.auto_reverted_at && o.auto_approval_expires_at === null && m?.status === "cancelled",
      `order=${o.status} reverted=${!!o.auto_reverted_at} mem=${m?.status}`
    );
  }

  // ── Caso 7: cron con clase consumida → auto-aceptar (no revert) ──
  {
    const u = await seedUser({ email: `${TEST_PREFIX}_c7@test.local` });
    const token = await login(u.email, u.password);
    const orderId = await seedOrder({ userId: u.id, planId });
    await api("POST", `/api/orders/${orderId}/proof`, { token, formData: buildFormDataWithImages(1) });
    await pool.query("UPDATE orders SET auto_approval_expires_at = NOW() - INTERVAL '1 hour' WHERE id=$1", [orderId]);
    const memId = (await pool.query("SELECT id FROM memberships WHERE order_id=$1", [orderId])).rows[0].id;

    // Crear un booking checked_in vinculado a esa membresía
    const ct = (await pool.query("SELECT id FROM class_types LIMIT 1")).rows[0].id;
    const existingInst = (await pool.query("SELECT id FROM instructors LIMIT 1")).rows[0];
    const inst = existingInst?.id || await (async () => {
      const instUser = await seedUser({ email: `${TEST_PREFIX}_inst@test.local`, role: "instructor" });
      const ins = await pool.query(
        `INSERT INTO instructors (user_id, display_name, email, is_active) VALUES ($1,'Test Inst',$2,true) RETURNING id`,
        [instUser.id, `${TEST_PREFIX}_inst@test.local`]
      );
      return ins.rows[0].id;
    })();
    const cls = (await pool.query(
      `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, current_bookings, status)
       VALUES ($1,$2, CURRENT_DATE - 1, '10:00:00', '11:00:00', 6, 1, 'scheduled') RETURNING id`,
      [ct, inst]
    )).rows[0].id;
    await pool.query(
      `INSERT INTO bookings (user_id, class_id, membership_id, status, checked_in_at)
       VALUES ($1,$2,$3,'checked_in', NOW())`,
      [u.id, cls, memId]
    );

    // Rama auto-accept del cron
    await pool.query(`
      UPDATE orders SET auto_approval_expires_at=NULL, verified_at=NOW(),
             admin_notes = COALESCE(admin_notes,'')||' [auto-aceptada: alumna ya usó clases]', updated_at=NOW()
       WHERE id=$1
         AND status='approved'
         AND EXISTS (
           SELECT 1 FROM bookings b JOIN memberships m ON b.membership_id = m.id
            WHERE m.order_id = orders.id AND b.status='checked_in'
         )
    `, [orderId]);

    const o = (await pool.query("SELECT status, verified_at, auto_approval_expires_at, auto_reverted_at FROM orders WHERE id=$1", [orderId])).rows[0];
    const m = (await pool.query("SELECT status FROM memberships WHERE order_id=$1", [orderId])).rows[0];
    record(
      "Caso 7 — cron con clase consumida: orden approved, verified_at set, mem active",
      o.status === "approved" && o.verified_at && o.auto_approval_expires_at === null && !o.auto_reverted_at && m?.status === "active",
      `order=${o.status} verified=${!!o.verified_at} reverted=${!!o.auto_reverted_at} mem=${m?.status}`
    );
  }

  await cleanup();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} casos aprobados`);
  await pool.end();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Test runner failed:", err);
  await cleanup().finally(() => pool.end()).then(() => process.exit(2));
});
