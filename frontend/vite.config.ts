import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
// Dev: el frontend corre en :5173 y proxya /api al backend Express (:8080).
// Prod: el backend sirve el build (frontend/dist), mismo origen, no se usa este proxy.
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET || "http://localhost:8080",
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
