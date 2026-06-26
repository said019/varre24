/**
 * tools/verify-reports.mjs — valida que los datos de /api/reports/* sean correctos
 * comparando cada query del endpoint contra agregados independientes en la BD.
 *
 *   node tools/verify-reports.mjs "postgresql://..."
 *   # o:  DATABASE_URL=... node tools/verify-reports.mjs
 *
 * Sale con código 0 si todos los invariantes pasan, 1 si alguno falla.
 */
import pg from "pg";

const CONN = process.argv[2] || process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;
if (!CONN) {
  console.error("Falta connection string. Uso: node tools/verify-reports.mjs <DATABASE_URL>");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: CONN,
  ssl: /railway|rlwy\.net/.test(CONN) ? { rejectUnauthorized: false } : undefined,
});

const checks = [];
const record = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  const mark = ok ? "✓" : "✗";
  const color = ok ? "\x1b[32m" : "\x1b[31m";
  console.log(`${color}${mark}\x1b[0m ${name}${detail ? "  " + detail : ""}`);
};

const REAL = "b.status IN ('confirmed','checked_in','no_show')";
const DONE = "(c.status = 'completed' OR (c.status = 'scheduled' AND c.date < CURRENT_DATE))";

(async () => {
  await c.connect();

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  /* ─── revenue series ─── */
  const rev = (
    await c.query(
      `WITH months AS (
         SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.n) AS m
         FROM generate_series(0, 11) AS gs(n)
       ),
       obm AS (
         SELECT DATE_TRUNC('month', created_at) AS m,
                COALESCE(SUM(total_amount),0) AS total,
                COUNT(*) AS cnt
           FROM orders WHERE status='approved' GROUP BY 1
       )
       SELECT m.m AS month, COALESCE(obm.total, 0)::numeric AS amount, COALESCE(obm.cnt, 0)::int AS cnt
         FROM months m LEFT JOIN obm ON obm.m = m.m ORDER BY 1`
    )
  ).rows;
  const seriesTotal = rev.reduce((s, r) => s + Number(r.amount), 0);
  const seriesCount = rev.reduce((s, r) => s + r.cnt, 0);

  // independent: sum of approved orders in last 12 calendar months
  const indep = (
    await c.query(
      `SELECT COALESCE(SUM(total_amount),0)::numeric AS total, COUNT(*)::int AS cnt
         FROM orders
        WHERE status='approved'
          AND created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'`
    )
  ).rows[0];
  record(
    "revenue series 12m total == sum approved orders (12 últimos meses)",
    Math.abs(Number(indep.total) - seriesTotal) < 0.005 && Number(indep.cnt) === seriesCount,
    `serie=${seriesTotal.toFixed(2)} (${seriesCount}) · directo=${Number(indep.total).toFixed(2)} (${indep.cnt})`
  );
  record(
    "revenue series produce exactamente 12 filas",
    rev.length === 12,
    `${rev.length}/12`
  );

  /* ─── overview.monthlyRevenue == última fila de la serie ─── */
  const last = rev[rev.length - 1];
  const monthlyRev = (
    await c.query(
      `SELECT COALESCE(SUM(total_amount),0)::numeric AS total
         FROM orders
        WHERE status='approved' AND created_at >= $1`,
      [monthStart]
    )
  ).rows[0];
  record(
    "overview.monthlyRevenue == última fila de la serie",
    Math.abs(Number(monthlyRev.total) - Number(last.amount)) < 0.005,
    `overview=${Number(monthlyRev.total).toFixed(2)} · serie[-1]=${Number(last.amount).toFixed(2)}`
  );

  /* ─── overview bookings de este mes ─── */
  const bk = (
    await c.query(
      `SELECT
          COUNT(b.id) FILTER (WHERE ${REAL})                              AS total,
          COUNT(b.id) FILTER (WHERE b.status='checked_in')                AS attended,
          COUNT(b.id) FILTER (WHERE b.status='no_show')                   AS no_shows,
          COUNT(b.id) FILTER (WHERE b.status='checked_in' AND ${DONE})    AS attended_past,
          COUNT(b.id) FILTER (WHERE ${REAL} AND ${DONE})                  AS booked_past
         FROM bookings b JOIN classes c ON c.id=b.class_id
        WHERE c.date >= $1::date AND c.date < ($1::date + INTERVAL '1 month')`,
      [monthStart]
    )
  ).rows[0];
  const total = Number(bk.total);
  const att = Number(bk.attended);
  const ns = Number(bk.no_shows);
  const ap = Number(bk.attended_past);
  const bp = Number(bk.booked_past);
  record("monthlyAttended <= monthlyBookings", att <= total, `${att} <= ${total}`);
  record("monthlyNoShows <= monthlyBookings", ns <= total, `${ns} <= ${total}`);
  record("attendedPast <= bookedPast", ap <= bp, `${ap} <= ${bp}`);
  record("bookedPast <= monthlyBookings", bp <= total, `${bp} <= ${total}`);

  /* ─── classes report invariants ─── */
  const cls = (
    await c.query(
      `SELECT ct.name,
              COUNT(DISTINCT c.id)::int classes_total,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status='scheduled' AND c.date >= CURRENT_DATE)::int upcoming,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status='completed' OR (c.status='scheduled' AND c.date < CURRENT_DATE))::int done,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status='cancelled')::int cancelled_classes,
              COUNT(b.id) FILTER (WHERE ${REAL})::int bookings,
              COUNT(b.id) FILTER (WHERE b.status='checked_in')::int attended,
              COUNT(b.id) FILTER (WHERE b.status='no_show')::int no_shows,
              COUNT(b.id) FILTER (WHERE b.status='cancelled')::int cancelled_bookings
         FROM classes c JOIN class_types ct ON c.class_type_id=ct.id
         LEFT JOIN bookings b ON b.class_id=c.id
        GROUP BY ct.name`
    )
  ).rows;
  for (const r of cls) {
    record(
      `[${r.name}] done + upcoming + cancelled_classes == classes_total`,
      r.done + r.upcoming + r.cancelled_classes === r.classes_total,
      `${r.done}+${r.upcoming}+${r.cancelled_classes} == ${r.classes_total}`
    );
    record(
      `[${r.name}] attended + no_shows <= bookings (real, sin cancel)`,
      r.attended + r.no_shows <= r.bookings,
      `${r.attended}+${r.no_shows} <= ${r.bookings}`
    );
  }

  /* ─── instructors report invariants ─── */
  const ins = (
    await c.query(
      `SELECT i.display_name name,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status='scheduled' AND c.date >= CURRENT_DATE)::int upcoming,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status='completed' OR (c.status='scheduled' AND c.date < CURRENT_DATE))::int done,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status='cancelled')::int cancelled_classes,
              COUNT(DISTINCT c.id) FILTER (WHERE c.instructor_id IS NOT NULL)::int total,
              COUNT(DISTINCT b.user_id) FILTER (WHERE ${REAL})::int unique_students,
              COUNT(b.id) FILTER (WHERE b.status='checked_in')::int attended,
              COUNT(b.id) FILTER (WHERE ${REAL})::int real_bookings
         FROM instructors i
         LEFT JOIN classes c ON c.instructor_id=i.id
         LEFT JOIN bookings b ON b.class_id=c.id
        WHERE i.is_active = true
        GROUP BY i.id, i.display_name`
    )
  ).rows;
  for (const r of ins) {
    record(
      `[${r.name}] done + upcoming + cancelled_classes == total`,
      r.done + r.upcoming + r.cancelled_classes === r.total,
      `${r.done}+${r.upcoming}+${r.cancelled_classes} == ${r.total}`
    );
    record(
      `[${r.name}] unique_students <= real_bookings`,
      r.unique_students <= r.real_bookings,
      `${r.unique_students} <= ${r.real_bookings}`
    );
    record(
      `[${r.name}] attended <= real_bookings`,
      r.attended <= r.real_bookings,
      `${r.attended} <= ${r.real_bookings}`
    );
  }

  /* ─── retention: newThisMonth <= total ─── */
  const ret = (
    await c.query(
      `SELECT COUNT(*)::int total,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int new_30
         FROM users WHERE role='client'`
    )
  ).rows[0];
  record(
    "retention: newThisMonth <= total",
    ret.new_30 <= ret.total,
    `${ret.new_30} <= ${ret.total}`
  );

  await c.end();

  const failed = checks.filter((x) => !x.ok);
  console.log(`\n${checks.length} verificaciones · ${failed.length} fallos`);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
