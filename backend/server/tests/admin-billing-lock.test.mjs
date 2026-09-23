import test from "node:test";
import assert from "node:assert/strict";
import { createAdminBillingGate, getAdminBillingStatus, isDashboardRead, STAFF_ROLES } from "../adminBillingLock.js";

const request = (method, originalUrl) => ({ method, originalUrl, path: originalUrl.split("?")[0] });
async function check(method, url, role, locked = true) {
  const result = { passed: false, status: null, body: null };
  const res = { status(s) { result.status = s; return this; }, json(body) { result.body = body; return this; } };
  await createAdminBillingGate({ resolveRole: async () => role, getStatus: () => ({ locked, message: "Mensualidad pendiente" }) })(request(method, url), res, () => { result.passed = true; });
  return result;
}

test("Railway switch is off by default and supports explicit on/off values", () => {
  for (const value of [undefined, "false", "0", "off", ""]) assert.equal(getAdminBillingStatus({ ADMIN_BILLING_LOCKED: value }).locked, false);
  for (const value of ["true", " TRUE ", "1", "on"]) assert.equal(getAdminBillingStatus({ ADMIN_BILLING_LOCKED: value }).locked, true);
});
test("all staff roles are blocked from writes, other screens and client API shortcuts", async () => {
  for (const role of STAFF_ROLES) {
    for (const [method, url] of [["POST", "/api/memberships"], ["PUT", "/api/settings/general_settings"], ["DELETE", "/api/classes/a"], ["POST", "/api/admin/birthdays/a/greet"], ["GET", "/api/reports/revenue"], ["POST", "/api/bookings"], ["POST", "/api/admin/stats"], ["GET", "/api/evolution/connect"]]) {
      const r = await check(method, url, role);
      assert.equal(r.status, 423, `${role}: ${method} ${url}`);
      assert.equal(r.body.code, "ADMIN_BILLING_LOCKED");
      assert.equal(r.passed, false);
    }
  }
});
test("dashboard reads remain available with constrained query parameters", async () => {
  for (const url of ["/api/auth/me", "/api/admin/billing-status", "/api/admin/stats", "/api/memberships?limit=5", "/api/admin/orders?status=pending_verification,pending_payment&limit=20", "/api/admin/birthdays?window=45"]) {
    assert.equal((await check("GET", url, "admin")).passed, true, url);
  }
  for (const url of ["/api/memberships?limit=500", "/api/memberships?limit=5&userId=other", "/api/memberships?limit=5&limit=500", "/api/admin/stats/anything", "/api/admin/billing-status?bypass=true"]) {
    assert.equal(isDashboardRead(request("GET", url)), false, url);
  }
});
test("switch off restores actions; client accounts and unauthenticated webhooks are unchanged", async () => {
  assert.equal((await check("POST", "/api/memberships", "admin", false)).passed, true);
  assert.equal((await check("POST", "/api/bookings", "client")).passed, true);
  assert.equal((await check("POST", "/api/webhook/mercadopago", null)).passed, true);
  assert.equal((await check("POST", "/api/auth/login", null)).passed, true);
});
test("role lookup failure cannot unlock administrative actions", async () => {
  let status;
  await createAdminBillingGate({ resolveRole: async () => { throw new Error("DB unavailable"); }, getStatus: () => ({ locked: true }) })(request("POST", "/api/memberships"), { status(s) { status = s; return this; }, json() {} }, () => assert.fail("must not proceed"));
  assert.equal(status, 503);
});
