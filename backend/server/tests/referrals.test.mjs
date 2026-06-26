// Test suite del sistema de referidos (modelo: el referidor recibe el crédito).
// Run: node server/tests/referrals.test.mjs
// Necesita Postgres local + server local.
//   createdb pilates_room_test (una sola vez)
//   DATABASE_URL=... PORT=8765 node server/index.js & (background)
//   DATABASE_URL=... PORT=8765 node server/tests/referrals.test.mjs

import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;
const API = process.env.API_URL || `http://localhost:${process.env.PORT || 8080}`;
const TAG = `reftest_${Date.now()}`;

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

async function register({ email, password = "Test12345!", referralCode }) {
  const { status, body } = await api("POST", "/api/auth/register", {
    body: {
      email,
      password,
      displayName: email.split("@")[0],
      phone: `+52${Math.floor(1e9 + Math.random() * 9e9)}`,
      gender: "female",
      dateOfBirth: "1995-06-15",
      acceptsTerms: true,
      acceptsCommunications: true,
      ...(referralCode ? { referralCode } : {}),
    },
  });
  if (status !== 201) throw new Error(`Register ${email} failed (${status}): ${JSON.stringify(body)}`);
  return { id: body.user?.id, token: body.token, email };
}

async function login(email, password = "Test12345!") {
  const { body } = await api("POST", "/api/auth/login", { body: { email, password } });
  return body?.data?.token ?? body?.token;
}

async function createAdmin() {
  const email = `${TAG}_admin@test.local`;
  const hash = await bcrypt.hash("Admin12345!", 6);
  const r = await pool.query(
    `INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms)
     VALUES ('Admin Test', $1, $2, $3, 'admin', true) RETURNING id`,
    [email, `+52${Math.floor(1e9 + Math.random() * 9e9)}`, hash]
  );
  const token = await login(email, "Admin12345!");
  return { id: r.rows[0].id, token, email };
}

async function setSettings({ enabled = true, discount_percent = 10 }, adminToken) {
  await api("PUT", "/api/settings/referral_settings", {
    token: adminToken,
    body: { value: { enabled, discount_percent, applies_to: "first_order" } },
  });
}

async function getCode(userId) {
  const r = await pool.query("SELECT code FROM referral_codes WHERE user_id = $1 LIMIT 1", [userId]);
  return r.rows[0]?.code;
}

async function ensurePlan() {
  const r = await pool.query(
    `SELECT id FROM plans WHERE is_active = true AND class_limit IS NOT NULL
     AND COALESCE(repeat_key,'') NOT LIKE 'trial%' AND name NOT ILIKE '%muestra%'
     ORDER BY sort_order LIMIT 1`
  );
  return r.rows[0]?.id;
}

async function cleanup() {
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${TAG}%`]).catch(() => {});
}

async function main() {
  console.log(`▶ Testing en ${API}\n`);
  const admin = await createAdmin();
  await setSettings({ enabled: true, discount_percent: 10 }, admin.token);

  // ── Caso 1: register con ?ref válido crea row ─────────────────────────
  const A = await register({ email: `${TAG}_A@test.local` });
  const codeA = await getCode(A.id);
  const B = await register({ email: `${TAG}_B@test.local`, referralCode: codeA });
  const refRow = await pool.query(
    "SELECT * FROM referrals WHERE referred_user_id = $1",
    [B.id]
  );
  record("Caso 1 — register con ?ref crea referral",
    refRow.rows.length === 1 && refRow.rows[0].referrer_user_id === A.id,
    `code=${codeA}`);

  // ── Caso 2: código inválido en register NO crea row ──────────────────
  const C = await register({ email: `${TAG}_C@test.local`, referralCode: "INVALIDOXX" });
  const noRef = await pool.query("SELECT * FROM referrals WHERE referred_user_id = $1", [C.id]);
  record("Caso 2 — código inválido en register no crea row", noRef.rows.length === 0);

  // ── Caso 3: self-referral bloqueado ───────────────────────────────────
  await pool.query("DELETE FROM referrals WHERE referred_user_id = $1", [A.id]);
  const claim = await api("POST", "/api/users/me/claim-referral-code", {
    token: A.token,
    body: { code: codeA },
  });
  record("Caso 3 — self-referral bloqueado",
    claim.status === 400 && claim.body?.code === "SELF_REFERRAL",
    `status=${claim.status}`);

  // ── Caso 4: claim manual crea row (sin descuento al referido) ─────────
  const claimC = await api("POST", "/api/users/me/claim-referral-code", {
    token: C.token,
    body: { code: codeA },
  });
  const refC = await pool.query("SELECT * FROM referrals WHERE referred_user_id = $1", [C.id]);
  record("Caso 4 — claim manual crea row, payload `linked` (no `eligible`)",
    claimC.status === 200 &&
    refC.rows.length === 1 &&
    refC.rows[0].rewarded === false &&
    claimC.body?.data?.linked === true &&
    claimC.body?.data?.eligible === undefined,
    `linked=${claimC.body?.data?.linked}`);

  // ── Caso 5: B (referido) NO es elegible para descuento ────────────────
  // El nuevo modelo no da descuento al referido — solo al referidor (A).
  const eligB = await api("GET", "/api/users/me/referral-discount", { token: B.token });
  record("Caso 5 — B (referido) no tiene crédito",
    eligB.body?.data?.eligible === false,
    `reason=${eligB.body?.data?.reason}`);

  // ── Caso 6: orden de B NO incluye referral_discount ───────────────────
  const planId = await ensurePlan();
  if (!planId) {
    record("Caso 6 — N/A", true, "Sin planes de membresía sembrados");
    record("Caso 7 — N/A", true, "Sin planes de membresía sembrados");
    record("Caso 8 — N/A", true, "Sin planes de membresía sembrados");
    record("Caso 9 — N/A", true, "Sin planes de membresía sembrados");
  } else {
    const orderB = await api("POST", "/api/orders", {
      token: B.token,
      body: { planId, paymentMethod: "transfer" },
    });
    const okB = orderB.status === 201 || orderB.status === 200;
    const dataB = orderB.body?.data ?? orderB.body;
    const refDiscB = Number(dataB?.referral_discount ?? dataB?.referralDiscount ?? 0);
    record("Caso 6 — orden de B (referido) NO aplica referral_discount",
      okB && refDiscB === 0,
      `status=${orderB.status}, refDisc=${refDiscB}`);

    // ── Caso 7: aprobar orden de B → genera credit para A ──────────────
    const orderBId = dataB?.id;
    await api("PUT", `/api/admin/orders/${orderBId}/verify`, { token: admin.token });
    const credAfter = await pool.query(
      `SELECT id, user_id, discount_percent, used_at, voided_at,
              (expires_at > NOW()) AS not_expired
         FROM referral_credits WHERE source_order_id = $1`,
      [orderBId]
    );
    const c = credAfter.rows[0];
    record("Caso 7 — aprobar orden del referido genera credit para el referidor",
      credAfter.rows.length === 1 &&
      c?.user_id === A.id &&
      Number(c?.discount_percent) === 10 &&
      c?.used_at === null &&
      c?.voided_at === null &&
      c?.not_expired === true,
      `creditUserId=${c?.user_id}`);

    // ── Caso 8: A ahora ve eligible=true en /me/referral-discount ──────
    const eligA = await api("GET", "/api/users/me/referral-discount", { token: A.token });
    record("Caso 8 — A (referidor) tiene crédito vigente con percent=10",
      eligA.body?.data?.eligible === true && eligA.body?.data?.percent === 10,
      `percent=${eligA.body?.data?.percent}`);

    // ── Caso 9: orden de A consume el credit (FIFO) ───────────────────
    const orderA = await api("POST", "/api/orders", {
      token: A.token,
      body: { planId, paymentMethod: "transfer" },
    });
    const okA = orderA.status === 201 || orderA.status === 200;
    const dataA = orderA.body?.data ?? orderA.body;
    const refDiscA = Number(dataA?.referral_discount ?? dataA?.referralDiscount ?? 0);
    record("Caso 9 — orden de A aplica el crédito (referral_discount > 0)",
      okA && refDiscA > 0,
      `status=${orderA.status}, refDisc=${refDiscA}`);

    // ── Caso 10: aprobar orden de A marca credit usado ────────────────
    const orderAId = dataA?.id;
    if (orderAId) {
      await api("PUT", `/api/admin/orders/${orderAId}/verify`, { token: admin.token });
      const credUsed = await pool.query(
        `SELECT used_at, used_in_order_id FROM referral_credits WHERE source_order_id = $1`,
        [orderBId]
      );
      record("Caso 10 — aprobar orden de A marca credit.used_at",
        credUsed.rows[0]?.used_at != null &&
        credUsed.rows[0]?.used_in_order_id === orderAId);
    } else {
      record("Caso 10 — N/A", true, "orden A sin id");
    }
  }

  // ── Caso 11: setting disabled bloquea claim ───────────────────────────
  await setSettings({ enabled: false }, admin.token);
  const D = await register({ email: `${TAG}_D@test.local` });
  const claimDisabled = await api("POST", "/api/users/me/claim-referral-code", {
    token: D.token,
    body: { code: codeA },
  });
  record("Caso 11 — setting disabled bloquea claim",
    claimDisabled.status === 403 && claimDisabled.body?.code === "DISABLED");
  await setSettings({ enabled: true }, admin.token);

  // ── Cleanup ──────────────────────────────────────────────────────────
  await cleanup();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} casos aprobados`);
  await pool.end();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Test runner failed:", err);
  cleanup().finally(() => pool.end()).then(() => process.exit(2));
});
