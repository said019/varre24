export const STAFF_ROLES = ["admin", "super_admin", "instructor", "reception"];

export function getAdminBillingStatus(env = process.env) {
  return {
    locked: /^(true|1|yes|on)$/i.test(String(env.ADMIN_BILLING_LOCKED || "").trim()),
    message: String(env.ADMIN_BILLING_MESSAGE || "Tienes un pago pendiente de la mensualidad de tu plataforma. Regulariza tu pago para recuperar el acceso a las funciones administrativas.").trim(),
  };
}

// Lecturas estrictamente necesarias para el dashboard. No se permiten otras
// consultas ni mutaciones, ni siquiera para super_admin o por URL directa.
export function isDashboardRead(req) {
  if (req.method !== "GET") return false;
  const url = new URL(req.originalUrl, "http://localhost");
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  if (["/api/auth/me", "/api/admin/billing-status", "/api/admin/stats", "/api/app-version", "/api/health"].includes(path)) {
    return url.search === "";
  }
  const expected = {
    "/api/memberships": { limit: "5" },
    "/api/admin/orders": { status: "pending_verification,pending_payment", limit: "20" },
    "/api/admin/birthdays": { window: "45" },
  }[path];
  return !!expected && [...url.searchParams].length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
}

export function createAdminBillingGate({ resolveRole, getStatus = getAdminBillingStatus }) {
  return async (req, res, next) => {
    if (!getStatus().locked || !/^\/api\//i.test(req.path) || isDashboardRead(req)) return next();
    try {
      const role = await resolveRole(req);
      if (!STAFF_ROLES.includes(role)) return next();
      return res.status(423).json({ code: "ADMIN_BILLING_LOCKED", ...getStatus() });
    } catch {
      // No autorizar acciones si no se pudo comprobar el rol.
      return res.status(503).json({ message: "No se pudo verificar el acceso. Intenta de nuevo." });
    }
  };
}
