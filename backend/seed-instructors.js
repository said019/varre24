/**
 * seed-instructors.js — crea/actualiza las instructoras del estudio (+ su user).
 *
 * Uso:
 *   node seed-instructors.js "postgresql://usuario:pass@host:puerto/db"
 *   # o:  DATABASE_URL=... node seed-instructors.js
 *
 * Idempotente: se puede correr varias veces sin duplicar.
 * Los nombres son placeholders ("Instructora 1..5"); cámbialos (y las fotos)
 * desde Admin → Clases → pestaña "Instructoras".
 *
 * Cada instructora necesita un registro en `users` (role='instructor') por la
 * FK instructors.user_id. Esos usuarios se crean sin contraseña (password_hash
 * nulo) — sirven solo como vínculo; si quieres que entren a la app, genera el
 * magic-link desde el admin.
 *
 * Las fotos viven en /public/instructors/*.jpg (las sirve la propia app), por
 * eso photo_url es una ruta relativa: /instructors/instructora-N.jpg
 */
import pg from "pg";
const { Client } = pg;

const CONN = process.argv[2] || process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;
if (!CONN) {
  console.error("Falta la cadena de conexión. Uso: node seed-instructors.js <DATABASE_URL>");
  process.exit(1);
}

// id de la instructora "Isabel" del seed inicial — la conservamos (y la
// renombramos) para no romper schedules/classes que referencian su instructor_id.
const EXISTING_ISABEL_INSTRUCTOR_ID = "d4000001-0001-4000-8000-000000000001";

const BIO = "Instructora certificada en Pilates Reformer.";
const SPECIALTIES = JSON.stringify(["Pilates Reformer"]);

const INSTRUCTORS = [
  { n: 1, name: "Instructora 1", email: "instructora1@varre24.com", phone: "0000000001", coach: "01", photo: "/instructors/instructora-1.jpg", focus: [50, 28], existingInstructorId: EXISTING_ISABEL_INSTRUCTOR_ID },
  { n: 2, name: "Instructora 2", email: "instructora2@varre24.com", phone: "0000000002", coach: "02", photo: "/instructors/instructora-2.jpg", focus: [50, 40] },
  { n: 3, name: "Instructora 3", email: "instructora3@varre24.com", phone: "0000000003", coach: "03", photo: "/instructors/instructora-3.jpg", focus: [55, 32] },
  { n: 4, name: "Instructora 4", email: "instructora4@varre24.com", phone: "0000000004", coach: "04", photo: "/instructors/instructora-4.jpg", focus: [48, 34] },
  { n: 5, name: "Instructora 5", email: "instructora5@varre24.com", phone: "0000000005", coach: "05", photo: "/instructors/instructora-5.jpg", focus: [42, 28] },
];

async function getCols(client, table) {
  const r = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
    [table]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

(async () => {
  const client = new Client({
    connectionString: CONN,
    ssl: /railway|rlwy\.net/.test(CONN) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  const insCols = await getCols(client, "instructors");
  const hasVisiblePublic = insCols.has("visible_public");

  for (const it of INSTRUCTORS) {
    // ── 1. user ──────────────────────────────────────────────────────────
    let userId = null;

    if (it.existingInstructorId) {
      const r = await client.query("SELECT user_id FROM instructors WHERE id = $1", [it.existingInstructorId]);
      userId = r.rows[0]?.user_id ?? null;
    }
    if (!userId) {
      const u = await client.query("SELECT id FROM users WHERE email = $1", [it.email]);
      userId = u.rows[0]?.id ?? null;
    }
    if (!userId) {
      const u = await client.query(
        `INSERT INTO users (email, phone, display_name, role, is_active)
         VALUES ($1, $2, $3, 'instructor', TRUE) RETURNING id`,
        [it.email, it.phone, it.name]
      );
      userId = u.rows[0].id;
      console.log(`  + user ${it.email}`);
    } else {
      await client.query(
        "UPDATE users SET display_name = $1, role = 'instructor', is_active = TRUE, updated_at = NOW() WHERE id = $2",
        [it.name, userId]
      );
    }

    // ── 2. instructor ────────────────────────────────────────────────────
    let instructorId = it.existingInstructorId || null;
    if (!instructorId) {
      const r = await client.query("SELECT id FROM instructors WHERE user_id = $1 OR display_name = $2 LIMIT 1", [userId, it.name]);
      instructorId = r.rows[0]?.id ?? null;
    }

    const visSet = hasVisiblePublic ? ", visible_public = TRUE" : "";
    if (instructorId) {
      await client.query(
        `UPDATE instructors SET
            user_id = $1, display_name = $2,
            bio = COALESCE(NULLIF(bio, ''), $3),
            specialties = $4::jsonb,
            photo_url = $5, photo_focus_x = $6, photo_focus_y = $7,
            coach_number = COALESCE(coach_number, $8),
            is_active = TRUE${visSet}, updated_at = NOW()
         WHERE id = $9`,
        [userId, it.name, BIO, SPECIALTIES, it.photo, it.focus[0], it.focus[1], it.coach, instructorId]
      );
      console.log(`✓ ${it.name}  (instructor ${instructorId})`);
    } else {
      const cols = ["user_id", "display_name", "bio", "specialties", "photo_url", "photo_focus_x", "photo_focus_y", "coach_number", "is_active"];
      const vals = [userId, it.name, BIO, SPECIALTIES, it.photo, it.focus[0], it.focus[1], it.coach, true];
      if (hasVisiblePublic) { cols.push("visible_public"); vals.push(true); }
      const ph = vals.map((_, i) => (cols[i] === "specialties" ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(", ");
      const r = await client.query(`INSERT INTO instructors (${cols.join(", ")}) VALUES (${ph}) RETURNING id`, vals);
      console.log(`+ ${it.name}  (instructor ${r.rows[0].id})`);
    }
  }

  const total = await client.query("SELECT COUNT(*)::int AS n FROM instructors WHERE is_active = TRUE");
  console.log(`\nInstructoras activas: ${total.rows[0].n}`);
  await client.end();
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
