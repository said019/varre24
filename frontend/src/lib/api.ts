import axios from "axios";

const rawBaseURL = String(import.meta.env.VITE_API_URL || "/api").replace(/["']+/g, "").replace(/\/+$/, "");
const api = axios.create({
  baseURL: rawBaseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("auth_token");
      // CRÍTICO: limpiar también el estado persistido de zustand (auth-storage).
      // Si solo borramos auth_token pero dejamos isAuthenticated=true en el store
      // persistido, la pantalla de login cree que la alumna sigue autenticada y
      // la rebota a /app, donde las queries vuelven a dar 401 → "una pantalla y
      // otra sin parar". Al limpiar el store, tras el redirect el login se queda
      // quieto y puede iniciar sesión de nuevo.
      try {
        const raw = localStorage.getItem("auth-storage");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.state) {
            parsed.state.user = null;
            parsed.state.token = null;
            parsed.state.isAuthenticated = false;
            localStorage.setItem("auth-storage", JSON.stringify(parsed));
          }
        }
      } catch { /* localStorage no disponible / JSON inválido: ignorar */ }
      const path = window.location.pathname;
      if (path.startsWith("/app") || path.startsWith("/admin")) {
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
