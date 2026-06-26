/**
 * Reinicio total de sesión / app, sin que la usuaria tenga que cerrar la
 * página o reinstalar la PWA. Limpia:
 *  - el token y el estado de sesión persistido (zustand)
 *  - el service worker (para que tome el bundle nuevo)
 *  - todas las cachés del navegador (Cache Storage)
 * y recarga en la pantalla de login limpia.
 *
 * Resuelve los casos de: sesión vencida atorada, loop de pantallas, o app
 * cacheada con una versión vieja.
 */
export async function hardResetSession(): Promise<void> {
  // 1) Credenciales / estado de sesión
  try { localStorage.removeItem("auth_token"); } catch { /* ignore */ }
  try { localStorage.removeItem("auth-storage"); } catch { /* ignore */ }

  // 2) Service workers (forzar que se reemplace por la versión nueva)
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }

  // 3) Cache Storage (bundles viejos)
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }

  // 4) Recargar limpio en login (replace para no dejar la ruta atorada en el historial)
  window.location.replace("/auth/login");
}
