// Servidor de demostración aislado: sin base de datos ni credenciales reales.
import express from "express";
import { createAdminBillingGate, getAdminBillingStatus } from "./adminBillingLock.js";
if (process.env.NODE_ENV === "production") throw new Error("La vista previa solo se permite en desarrollo");
const app = express();
app.use(express.json());
const user = { id: "demo-admin", role: "admin", displayName: "Admin · Demostración", email: "demo@varre24.local", photoUrl: null };
const token = "local-preview-only";
app.use(createAdminBillingGate({ resolveRole: async (req) => req.headers.authorization === `Bearer ${token}` ? "admin" : null }));
app.post("/api/auth/login", (req, res) => {
  if (req.body.email !== user.email || req.body.password !== "Demo12345!") return res.status(401).json({ message: "Usa las credenciales de demostración" });
  res.json({ user, token });
});
app.get("/api/public/settings/:key", (_req, res) => res.json({ data: { studio_name: "VARRE24", maintenance_mode: false } }));
app.get("/api/app-version", (_req, res) => res.json({ version: "billing-preview" }));
app.use("/api", (req, res, next) => req.headers.authorization === `Bearer ${token}` ? next() : res.status(401).json({ message: "Inicia sesión en la demostración" }));
app.get("/api/auth/me", (_req, res) => res.json({ user }));
app.get("/api/admin/billing-status", (_req, res) => res.json({ data: getAdminBillingStatus() }));
app.get("/api/admin/stats", (_req, res) => res.json({ classesToday: 4, activeMembers: 20, monthlyRevenue: 29142, pendingAlerts: 2 }));
app.get("/api/memberships", (_req, res) => res.json({ data: [
  { id: "demo-1", userName: "Ana · Ejemplo", planName: "Pilates · 8 clases", status: "active" },
  { id: "demo-2", userName: "María · Ejemplo", planName: "Barre · 12 clases", status: "active" },
] }));
app.get("/api/admin/orders", (_req, res) => res.json({ data: [{ id: "demo-order", userName: "Sofía · Ejemplo", totalAmount: 990, status: "pending_verification" }] }));
app.get("/api/admin/birthdays", (_req, res) => res.json({ data: [
  { id: "demo-b1", displayName: "Ana · Ejemplo", nextBirthday: "2026-09-23", daysUntil: 1, currentAge: 28, photoUrl: null },
  { id: "demo-b2", displayName: "María · Ejemplo", nextBirthday: "2026-09-25", daysUntil: 3, currentAge: 32, photoUrl: null },
] }));
app.use((_req, res) => res.status(404).json({ message: "Esta ruta no forma parte de la demostración" }));
app.listen(8089, "127.0.0.1", () => console.log("Vista previa local: http://127.0.0.1:8089 — bloqueo", getAdminBillingStatus().locked));
