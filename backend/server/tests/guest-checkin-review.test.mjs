// Regresión: el trigger create_review_request() insertaba NEW.user_id en
// review_requests.user_id (NOT NULL). Un walk-in (bookings.user_id NULL) que
// llegaba a 'checked_in' abortaba la sentencia completa, así que runAutoCheckin
// fallaba cada 10 minutos y ninguna reserva confirmada se marcaba asistida.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const MIGRATION = "backend/supabase/migrations/202610260001_guest_checkin_reviews.sql";
const server = readFileSync("backend/server/index.js", "utf8");
const schemaComplete = readFileSync("backend/supabase/migrations/schema_complete.sql", "utf8");

function triggerFunctionFrom(sql) {
  const match = sql.match(/CREATE OR REPLACE FUNCTION create_review_request\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/);
  assert.ok(match, "create_review_request() definition not found");
  return match[0];
}

test("el arranque aplica el trigger corregido en bases ya provisionadas", () => {
  assert.ok(existsSync(MIGRATION));
  const boot = server.slice(server.indexOf("async function ensureSchema()"));
  const walkIns = boot.indexOf("ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL");
  const migration = boot.indexOf('"../supabase/migrations/202610260001_guest_checkin_reviews.sql"');
  assert.ok(walkIns > -1 && migration > walkIns, "la migración debe correr después de habilitar walk-ins");
});

for (const [label, sql] of [
  ["schema_complete.sql (bases nuevas)", schemaComplete],
  ["migración de arranque (bases en producción)", readFileSync(MIGRATION, "utf8")],
]) {
  test(`${label}: no crea solicitud de reseña para reservas sin usuaria`, () => {
    assert.match(triggerFunctionFrom(sql), /IF NEW\.user_id IS NOT NULL AND NEW\.status = 'checked_in'/);
  });
}
