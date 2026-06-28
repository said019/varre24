import "dotenv/config";
import express from "express";
import cors from "cors";
import compression from "compression";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import multer from "multer";
import axios from "axios";
import crypto from "crypto";
import http2 from "http2";
import archiver from "archiver";
import { execSync } from "child_process";
import {
  sendMembershipActivated,
  sendBookingConfirmed,
  sendBookingCancelled,
  sendWeeklyReminder,
  sendRenewalReminder,
  sendPasswordResetEmail,
  sendCustomBroadcast,
  sendBirthdayGreeting,
  sendAdminNewOrderToVerify,
} from "./emailService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "varre24_dev_only_change_me";
if (!process.env.JWT_SECRET) {
  console.warn("[seguridad] JWT_SECRET no definido — usando un default SOLO para desarrollo. Define JWT_SECRET en producción.");
}
const APP_PUBLIC_URL = String(process.env.APP_URL || process.env.SITE_URL || "https://varre24fit.com").replace(/\/+$/, "");

// ─── MercadoPago (Checkout Pro) config ──────────────────────────────────────
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "";
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || "";
// Public Key — segura para exponerla al frontend. Hoy el flujo es Checkout Pro
// (redirección), así que no se consume. Queda lista para Bricks/SDK embebido.
const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY || "";
const MP_BACKEND_URL = String(process.env.BACKEND_URL || process.env.PUBLIC_BACKEND_URL || APP_PUBLIC_URL).replace(/\/+$/, "");
const MP_FRONTEND_URL = String(process.env.FRONTEND_URL || APP_PUBLIC_URL).replace(/\/+$/, "");
const MP_CURRENCY = (process.env.MP_CURRENCY || "MXN").toUpperCase();
const MP_STATEMENT_DESCRIPTOR = (process.env.MP_STATEMENT_DESCRIPTOR || "VARRE24").slice(0, 22);
const MP_MAX_INSTALLMENTS = Math.max(1, parseInt(process.env.MP_MAX_INSTALLMENTS || "12", 10) || 12);
// Política VARRE24: sin comisión por pago con tarjeta. El estudio absorbe
// la comisión de MercadoPago para que el cliente vea el mismo precio sin importar
// el método de pago. Esto está forzado a 0 sin importar la env var.
const CARD_FEE_PCT = 0;
const isMercadoPagoEnabled = () => Boolean(MP_ACCESS_TOKEN);

// ─── Evolution API (WhatsApp) config ────────────────────────────────────────
// VARRE24 — usa variables de entorno propias, sin defaults heredados de
// otros proyectos. Si EVOLUTION_API_URL/KEY no están definidas, los endpoints
// de WhatsApp responderán con un error claro pidiendo configurar la instancia.
const EVOLUTION_API_URL = String(process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || "varre24";
const EVOLUTION_CONFIGURED = Boolean(EVOLUTION_API_URL && EVOLUTION_API_KEY);
if (!EVOLUTION_CONFIGURED) {
  console.warn("[EVOLUTION] No configurado: define EVOLUTION_API_URL y EVOLUTION_API_KEY para habilitar WhatsApp.");
}
const evolutionApi = axios.create({
  baseURL: EVOLUTION_API_URL || "http://evolution-not-configured.invalid",
  headers: { apikey: EVOLUTION_API_KEY },
  timeout: 20000,
});

const DEFAULT_GENERAL_SETTINGS = {
  studio_name: "VARRE24",
  address: "Arizona 14, Piso 3, Col. Nápoles, Benito Juárez, 03810, Ciudad de México",
  phone: "",
  instagram: "",
  facebook: "",
  timezone: "America/Mexico_City",
  currency: "MXN",
  maintenance_mode: false,
  venue_media_url: "",
  venue_media_type: "",
  venue_media_drive_id: "",
  venue_media_name: "",
  venue_media_updated_at: "",
};

const DEFAULT_BANK_INFO = Object.freeze({
  bank: "Banco Test",
  account_holder: "VARRE24 TEST",
  account_number: "000 000 0000",
  clabe: "000 000 00000000000 0",
  card_number: "0000 0000 0000 0000",
});

// Map Spanish payment method labels to DB enum values
function normalizePaymentMethod(v) {
  const map = { efectivo: "cash", transferencia: "transfer", tarjeta: "card" };
  return map[String(v || "").toLowerCase()] || v || "cash";
}

// Complement type lookup
// Feature de complementos (retirada). Especialistas se configuran desde el
// admin; sin nombres de terceros hardcodeados.
const COMPLEMENT_MAP = {
  "nutricion-hormonal": { name: "Nutrición — Salud Hormonal", specialist: "" },
  "nutricion-rendimiento": { name: "Nutrición — Rendimiento Físico", specialist: "" },
  "descarga-muscular": { name: "Descarga Muscular", specialist: "" },
};

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatClabe(value) {
  const digits = digitsOnly(value);
  if (digits.length !== 18) return String(value || "").trim();
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 17)} ${digits.slice(17)}`;
}

function formatAccountNumber(value) {
  const digits = digitsOnly(value);
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return String(value || "").trim();
}

function normalizeBankInfo(rawValue) {
  const raw = rawValue && typeof rawValue === "object" ? rawValue : {};
  const candidate = {
    bank: String(raw.bank || raw.bank_name || raw.banco || "").trim(),
    account_holder: String(raw.account_holder || raw.accountHolder || raw.titular || raw.holder || "").trim(),
    account_number: String(raw.account_number || raw.accountNumber || raw.cuenta || raw.account || "").trim(),
    clabe: String(raw.clabe || raw.clabe_interbancaria || "").trim(),
  };

  const holderLower = candidate.account_holder.toLowerCase();
  const clabeDigits = digitsOnly(candidate.clabe);
  const accountDigits = digitsOnly(candidate.account_number);
  // Caemos a los valores TEST si:
  //  - los datos están estructuralmente incompletos (sin banco/titular,
  //    CLABE ≠ 18 dígitos, cuenta < 10 dígitos), O
  //  - son los datos de SEED de la migración (`system_settings`) que pertenecen
  //    a OTRO negocio ("Balance Studio SA de CV", CLABE 012180001234567890).
  //    Ese seed NO es del estudio y NO debe mostrarse al cliente; mejor mostrar
  //    los valores TEST evidentes hasta que el admin guarde sus datos reales.
  const shouldUseDefault =
    !candidate.bank ||
    !candidate.account_holder ||
    clabeDigits.length !== 18 ||
    (accountDigits && accountDigits.length < 10) ||
    clabeDigits === "012180001234567890" ||
    clabeDigits === "012180012345678901" ||
    clabeDigits === "710180000068980" ||
    holderLower.includes("balance studio");

  const base = shouldUseDefault ? DEFAULT_BANK_INFO : candidate;
  // El número de cuenta es opcional para SPEI (basta el CLABE). Si el admin no
  // lo configuró y los datos NO son los TEST, dejarlo vacío en vez de mostrar
  // "000 000 0000" al cliente. Solo se rellena con el default cuando estamos
  // mostrando los valores TEST completos (datos sin configurar).
  const formattedAccount = shouldUseDefault
    ? formatAccountNumber(DEFAULT_BANK_INFO.account_number)
    : (base.account_number ? formatAccountNumber(base.account_number) : "");
  const formattedClabe = formatClabe(base.clabe || DEFAULT_BANK_INFO.clabe);
  const holder = String(base.account_holder || DEFAULT_BANK_INFO.account_holder).trim();
  const bank = String(base.bank || DEFAULT_BANK_INFO.bank).trim();

  return {
    bank,
    bank_name: bank,
    account_holder: holder,
    accountHolder: holder,
    account_number: formattedAccount,
    accountNumber: formattedAccount,
    clabe: formattedClabe,
  };
}

async function getConfiguredBankInfo(dbClient = pool) {
  // Use pool (not transaction client) to avoid aborting active transactions on error
  const safeClient = pool;
  // IMPORTANTE: leer `settings` PRIMERO. El admin guarda los datos bancarios en
  // `settings` (PUT /api/settings/bank_info). `system_settings` solo contiene un
  // seed viejo de la migración (datos de "Balance Studio") que NO debe ganarle a
  // lo que configure el admin. Orden: settings → system_settings → default.
  for (const table of ["settings", "system_settings"]) {
    try {
      const settingsRes = await safeClient.query(
        `SELECT value FROM ${table} WHERE key = 'bank_info' LIMIT 1`
      );
      if (settingsRes.rows.length > 0) {
        return normalizeBankInfo(settingsRes.rows[0].value);
      }
    } catch (_) {
      // Table may not exist, try the next one
    }
  }
  return normalizeBankInfo(DEFAULT_BANK_INFO);
}

const DEFAULT_POLICIES_SETTINGS = {
  cancellation_policy: "Puedes cancelar tu reserva a tiempo y tu clase regresa a tu paquete. A partir de tu segunda cancelación tardía o falta se aplica una penalización de $70 MXN. Una vez activada y pagada tu membresía, no hay devoluciones.",
  terms_of_service: "Al reservar o comprar en VARRE24 aceptas el reglamento interno, las políticas de puntualidad y cancelación, y el uso personal e intransferible de tus clases y membresías.",
  privacy_policy: "Tus datos se usan únicamente para gestionar reservas, pagos y comunicación operativa del estudio. No compartimos tu información personal con terceros sin autorización.",
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  email_reminders: true,
  whatsapp_reminders: true,
  reminder_hours_before: 12,
};

const DEFAULT_NOTIFICATION_TEMPLATES = {
  booking_confirmed: {
    subject: "Reserva confirmada",
    body: "Hola {name}, tu reserva para {class} el {date} a las {time} está confirmada.",
  },
  booking_cancelled: {
    subject: "Reserva cancelada",
    body: "Hola {name}, tu reserva de {class} del {date} fue cancelada. Crédito devuelto: {creditRestored}.",
  },
  membership_activated: {
    subject: "Membresía activada",
    body: "Hola {name}, tu membresía {plan} ya está activa. Vigencia: {startDate} al {endDate}.",
  },
  transfer_rejected: {
    subject: "Transferencia rechazada",
    body: "Hola {name}, no pudimos aprobar tu comprobante. Motivo: {reason}.",
  },
  class_reminder: {
    subject: "Recordatorio de clase",
    body: "Hola {name}, te recordamos tu clase {class} a las {time}.",
  },
  instructor_changed: {
    subject: "Cambio de instructora — {class}",
    body: "Hola {name}, te avisamos que tu clase de {class} el {date} a las {time} ahora la dará {newInstructor} (en lugar de {oldInstructor}). Tu reservación sigue confirmada. Nos vemos en el estudio.",
  },
  renewal_reminder: {
    subject: "Recordatorio de renovación",
    body: "Hola {name}, tu plan {plan} está por vencer el {expiresAt}.",
  },
  welcome: {
    subject: "Bienvenida a VARRE24",
    body: "Hola {name}, bienvenida a VARRE24. ¡Nos encanta tenerte aquí!",
  },
  password_reset: {
    subject: "Recuperación de contraseña",
    body: "Hola {name}, usa este enlace para restablecer tu contraseña: {link}",
  },
};

const DEFAULT_CANCELLATION_WINDOW = Object.freeze({
  enabled: true,
  min_hours: 4,
  // Política por membresía: primeras N cancelaciones devuelven crédito,
  // a partir de la N+1 se descuenta sin devolver (penalización). VARRE24: la 1ª
  // cancelación a tiempo es libre; a partir de la 2ª se penaliza ($70). Se
  // conserva `free_cancellations_per_month` como alias legacy.
  free_cancellations_per_membership: 1,
  free_cancellations_per_month: 1,
  refund_credit_on_cancel: true,
  late_cancel_message: "Solo puedes cancelar hasta 4 horas antes de tu clase. A partir de tu segunda cancelación tardía o falta se aplica una penalización de $70 MXN.",
});

// Validación manual de pagos por TRANSFERENCIA. Cuando enabled=true, subir el
// comprobante NO activa la membresía: la orden queda 'pending_verification'
// hasta que el admin la apruebe en Pagos. (La tarjeta/MercadoPago no se ve
// afectada: ese pago lo confirma MP.)
// notify_whatsapp: número (WhatsApp) de la administradora para avisarle cuando
// entra una transferencia por validar. Si está vacío, solo se avisa en el panel.
const DEFAULT_PAYMENT_VALIDATION = { manual_transfer: true, notify_whatsapp: "" };

const DEFAULT_SETTINGS_BY_KEY = {
  general_settings: DEFAULT_GENERAL_SETTINGS,
  policies_settings: DEFAULT_POLICIES_SETTINGS,
  notification_settings: DEFAULT_NOTIFICATION_SETTINGS,
  notification_templates: DEFAULT_NOTIFICATION_TEMPLATES,
  bank_info: DEFAULT_BANK_INFO,
  cancellation_window: DEFAULT_CANCELLATION_WINDOW,
  payment_validation: DEFAULT_PAYMENT_VALIDATION,
};

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(baseValue, overrideValue) {
  if (!isPlainObject(baseValue)) {
    return overrideValue === undefined ? baseValue : overrideValue;
  }
  if (!isPlainObject(overrideValue)) {
    return baseValue;
  }
  const output = { ...baseValue };
  for (const [key, val] of Object.entries(overrideValue)) {
    const baseEntry = output[key];
    output[key] = isPlainObject(baseEntry) && isPlainObject(val)
      ? deepMerge(baseEntry, val)
      : val;
  }
  return output;
}

function mergeSettingsWithDefaults(key, rawValue) {
  const defaults = DEFAULT_SETTINGS_BY_KEY[key];
  if (!defaults) return rawValue ?? null;
  if (!isPlainObject(rawValue)) return JSON.parse(JSON.stringify(defaults));
  const merged = deepMerge(defaults, rawValue);
  if (key === "policies_settings") {
    for (const [fieldKey, defaultValue] of Object.entries(defaults)) {
      const current = merged[fieldKey];
      if (typeof defaultValue === "string" && (!current || !String(current).trim())) {
        merged[fieldKey] = defaultValue;
      }
    }
  }
  return merged;
}

// ─── File upload (memory storage, max 10 MB) ────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ─── File upload for videos (disk storage, max 500 MB) ─────────────────────
// Use disk storage so large videos don't fill Node.js RAM
const VIDEO_MAX_MB = 500;
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `pn_vid_${Date.now()}_${file.originalname}`),
  }),
  limits: { fileSize: VIDEO_MAX_MB * 1024 * 1024 },
});

// ─── Google Drive helpers ────────────────────────────────────────────────────
async function getGoogleDriveAccessToken() {
  const resp = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN || "",
    grant_type: "refresh_token",
  }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return resp.data.access_token;
}

async function makeGoogleDriveFilePublic(fileId, accessToken) {
  await axios.post(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    { role: "reader", type: "anyone" },
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
  ).catch(() => { }); // best-effort
}

/** Upload a Buffer to Google Drive using simple multipart (for small files like thumbnails) */
async function uploadBufferToDrive(buffer, fileName, mimeType, accessToken) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  const metadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };
  // Build multipart body manually
  const boundary = "pn_boundary_" + Date.now();
  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  );
  const filePart = Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const endPart = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([metaPart, filePart, buffer, endPart]);

  const resp = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    body,
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary="${boundary}"` }, maxBodyLength: Infinity, maxContentLength: Infinity }
  );
  return resp.data; // { id, webViewLink }
}

/**
 * Upload a file from disk to Google Drive using Resumable Upload (streams in 5 MB chunks).
 * Works for files of any size without loading them entirely into memory.
 * @param {string} filePath  - absolute path to the temp file on disk
 * @param {string} fileName  - desired file name in Drive
 * @param {string} mimeType  - e.g. "video/mp4"
 * @param {string} accessToken - Google OAuth2 access token
 * @returns {{ id: string, webViewLink?: string }}
 */
async function uploadFileToDriveResumable(filePath, fileName, mimeType, accessToken) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  const metadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };
  const fileSize = fs.statSync(filePath).size;

  // Step 1: Initiate resumable upload session
  const initResp = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
    metadata,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileSize),
      },
    }
  );
  const uploadUri = initResp.headers.location; // resumable session URI

  // Step 2: Upload file in chunks of 5 MB (must be multiples of 256 KB)
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
  let offset = 0;
  const fd = fs.openSync(filePath, "r");

  try {
    while (offset < fileSize) {
      const bytesToRead = Math.min(CHUNK_SIZE, fileSize - offset);
      const chunk = Buffer.alloc(bytesToRead);
      fs.readSync(fd, chunk, 0, bytesToRead, offset);

      const endByte = offset + bytesToRead - 1;
      const contentRange = `bytes ${offset}-${endByte}/${fileSize}`;

      const resp = await axios.put(uploadUri, chunk, {
        headers: {
          "Content-Length": String(bytesToRead),
          "Content-Range": contentRange,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        // 308 Resume Incomplete is expected for intermediate chunks
        validateStatus: (status) => status === 200 || status === 201 || status === 308,
      });

      if (resp.status === 200 || resp.status === 201) {
        // Final chunk — upload complete
        return resp.data; // { id, webViewLink }
      }

      // 308: read next range from Range header
      const rangeHeader = resp.headers.range; // e.g. "bytes=0-5242879"
      if (rangeHeader) {
        offset = parseInt(rangeHeader.split("-")[1], 10) + 1;
      } else {
        offset += bytesToRead;
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  throw new Error("Resumable upload ended without a final 200/201 response");
}


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
  // keepAlive evita pagar handshake TCP/TLS en cada query (causaba latencia
  // que escalaba con el nº de queries). max amplía el pool (default 10) para
  // no bloquear pool.query() esperando conexión bajo carga concurrente.
  max: 20,
  keepAlive: true,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Ensure users table has password_hash column (idempotent migration)
async function ensureSchema() {
  try {
    // ── Ensure required Postgres extensions (idempotente) ─────────────────
    // uuid-ossp para uuid_generate_v4(), pgcrypto para gen_random_uuid().
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).catch((e) => console.error("[ext uuid-ossp]", e.message));
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).catch((e) => console.error("[ext pgcrypto]", e.message));

    // ── Bootstrap del esquema base en DBs vírgenes ────────────────────────
    // Las tablas core (plans, bookings, orders, memberships, classes, payments,
    // schedules, facilities…) NO se crean en este archivo: viven en
    // supabase/migrations/schema_complete.sql. En una DB nueva (sin la tabla
    // `plans`) lo aplicamos UNA sola vez para que el sistema arranque solo
    // —clave para un deploy limpio en Railway—. En DBs ya provisionadas se omite.
    try {
      const corePresent = await pool.query(`SELECT to_regclass('public.plans') AS t`);
      if (!corePresent.rows[0].t) {
        const schemaPath = [
          path.join(__dirname, "../supabase/migrations/schema_complete.sql"),
          path.join(process.cwd(), "backend/supabase/migrations/schema_complete.sql"),
          path.join(process.cwd(), "supabase/migrations/schema_complete.sql"),
        ].find((p) => { try { return fs.existsSync(p); } catch { return false; } });
        if (schemaPath) {
          console.log("[schema] DB virgen detectada — aplicando schema_complete.sql…");
          await pool.query(fs.readFileSync(schemaPath, "utf8"));
          console.log("[schema] schema_complete.sql aplicado ✅");
        } else {
          console.warn("[schema] schema_complete.sql no encontrado; faltarán tablas core.");
        }
      }
    } catch (e) {
      console.error("[schema] bootstrap schema_complete.sql:", e.message);
    }

    // ── Users table base si no existe (en DBs vírgenes sin schema_complete.sql aplicado)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        display_name VARCHAR(255),
        phone VARCHAR(20),
        role VARCHAR(20) DEFAULT 'client',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch((e) => console.error("[users base table]", e.message));
    // ── Ensure all users columns the app needs ────────────────────────────
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepts_terms BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepts_communications BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS health_notes TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_reminders BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_promotions BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_weekly_summary BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`).catch(() => { });
    // ── Password reset tokens ───────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token       VARCHAR(255) NOT NULL UNIQUE,
        expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
        used        BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    await pool.query(`ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT false`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at)`).catch(() => { });
    // Cleanup best-effort to keep table compact.
    await pool.query(`
      DELETE FROM password_reset_tokens
      WHERE used = true OR expires_at < NOW() - INTERVAL '7 days'
    `).catch(() => { });
    // Ensure referrals table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(20) NOT NULL UNIQUE,
        uses_count INTEGER DEFAULT 0,
        reward_points INTEGER DEFAULT 200,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code)`).catch(() => { });
    // Ensure discount_codes table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(50) NOT NULL UNIQUE,
        discount_type VARCHAR(20) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
        discount_value DECIMAL(10,2) NOT NULL,
        max_uses INTEGER,
        uses_count INTEGER DEFAULT 0,
        class_category VARCHAR(20),
        channel VARCHAR(20) NOT NULL DEFAULT 'all',
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── class_types (tipos de clase editables desde admin) ──────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS class_types (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name         VARCHAR(100) NOT NULL,
        subtitle     VARCHAR(150),
        description  TEXT,
        category     VARCHAR(20)  NOT NULL DEFAULT 'pilates' CHECK (category IN ('pilates','bienestar','funcional','barre','especial','mixto','all')),
        intensity    VARCHAR(20)  DEFAULT 'media' CHECK (intensity IN ('ligera','media','pesada','todas')),
        level        VARCHAR(50)  DEFAULT 'Todos los niveles',
        duration_min INTEGER      DEFAULT 50,
        capacity     INTEGER      DEFAULT 10,
        color        VARCHAR(50)  DEFAULT '#C9A5A8',
        emoji        VARCHAR(10)  DEFAULT '🏃',
        is_active    BOOLEAN      DEFAULT true,
        sort_order   INTEGER      DEFAULT 0,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS subtitle VARCHAR(150)`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'pilates'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS intensity VARCHAR(20) DEFAULT 'media'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS level VARCHAR(50) DEFAULT 'Todos los niveles'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS duration_min INTEGER DEFAULT 50`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 10`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ALTER COLUMN capacity SET DEFAULT 10`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT '#C9A5A8'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS emoji VARCHAR(10) DEFAULT '🏃'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    // ── schedule_slots (horario semanal editable desde admin) ───────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_slots (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        time_slot       VARCHAR(20) NOT NULL,
        day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        class_type_id   UUID REFERENCES class_types(id) ON DELETE SET NULL,
        class_type_name VARCHAR(100),
        instructor_name VARCHAR(100),
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_schedule_slots_day ON schedule_slots(day_of_week)`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS class_type_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS class_type_name VARCHAR(100)`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS instructor_name VARCHAR(100)`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS capacity INT DEFAULT 7`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_slots_slot ON schedule_slots(time_slot, day_of_week) WHERE is_active = true`).catch(() => { });
    // ── schedule_templates (plantilla simple con class_label) ───────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_templates (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        time_slot   VARCHAR(10)  NOT NULL,
        day_of_week SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
        class_label VARCHAR(50)  NOT NULL,
        shift       VARCHAR(10)  NOT NULL DEFAULT 'morning' CHECK (shift IN ('morning','evening')),
        is_active   BOOLEAN      DEFAULT true,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (time_slot, day_of_week)
      );
    `);
    // ── packages (paquetes de precios) ────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS packages (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name          VARCHAR(100) NOT NULL,
        num_classes   VARCHAR(20)  NOT NULL,
        price         DECIMAL(10,2) NOT NULL,
        category      VARCHAR(20)  NOT NULL DEFAULT 'all' CHECK (category IN ('pilates','bienestar','funcional','barre','especial','mixto','all')),
        validity_days INTEGER      DEFAULT 30,
        is_active     BOOLEAN      DEFAULT true,
        sort_order    INTEGER      DEFAULT 0,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_packages_category ON packages(category)`).catch(() => { });
    // ── Seed packages si la tabla está vacía ──────────────────────────────
    const pkgCount = await pool.query("SELECT COUNT(*) FROM packages");
    if (parseInt(pkgCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO packages (name, num_classes, price, category, validity_days, is_active, sort_order) VALUES
          ('Clase Suelta',  '1',  120,  'pilates', 7,  true, 0),
          ('4 Clases',      '4',  400,  'pilates', 30, true, 1),
          ('8 Clases',      '8',  680,  'pilates', 30, true, 2),
          ('12 Clases',     '12', 900,  'pilates', 30, true, 3),
          ('16 Clases',     '16', 1100, 'pilates', 30, true, 4)
        ON CONFLICT DO NOTHING;
      `);
      console.log("✅ Seeded VARRE24 packages");
    }
    // ── Limpiar tipos heredados y dejar solo Pilates Reformer ────────────
    await pool.query(`DELETE FROM class_types WHERE name IN ('Pilates Reformer','Barre Studio','Yoga Sculpt','Pilates Matt Clásico','Pilates Terapéutico','Flex & Flow','Body Strong')`).catch(() => { });

    // ── Deduplicar 'Pilates Reformer' (bug histórico: seed insertaba duplicados) ──
    try {
      const dups = await pool.query(`
        SELECT id FROM class_types WHERE name = 'Pilates Reformer'
        ORDER BY created_at ASC NULLS LAST, id ASC
      `);
      if (dups.rows.length > 1) {
        const canonicalId = dups.rows[0].id;
        const duplicateIds = dups.rows.slice(1).map((r) => r.id);
        // Reapuntar todas las clases (FKs) al canónico
        await pool.query(
          `UPDATE classes SET class_type_id = $1 WHERE class_type_id = ANY($2::uuid[])`,
          [canonicalId, duplicateIds]
        );
        // Reapuntar schedule_slots si referencian por id
        await pool.query(
          `UPDATE schedule_slots SET class_type_id = $1 WHERE class_type_id = ANY($2::uuid[])`,
          [canonicalId, duplicateIds]
        ).catch(() => { });
        // Borrar los duplicados
        await pool.query(
          `DELETE FROM class_types WHERE id = ANY($1::uuid[])`,
          [duplicateIds]
        );
        console.log(`✅ Class types dedup: removed ${duplicateIds.length} duplicate(s) of 'Pilates Reformer'`);
      }
    } catch (dedupErr) {
      console.warn("[dedup class_types]", dedupErr.message);
    }

    // ── UNIQUE en class_types.name (necesario para el upsert idempotente) ──
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_types_name_key') THEN
          ALTER TABLE class_types ADD CONSTRAINT class_types_name_key UNIQUE (name);
        END IF;
      END$$;
    `).catch((e) => console.warn("[uniq class_types.name]", e.message));

    // ── Sembrar/asegurar los 3 tipos de clase VARRE24 (idempotente por name) ──
    await pool.query(`
      INSERT INTO class_types (name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order, is_active) VALUES
        ('Pilates Mat',      'Mat',        'Pilates en colchoneta: fuerza, control y respiración consciente. Máximo 7 lugares por sesión.', 'pilates',  'media', 'all', 60,  7, '#bc4500', '', 1, true),
        ('Barre',            'Barre',      'Entrenamiento inspirado en ballet: fuerza, postura y tono. Máximo 7 lugares por sesión.',       'barre',    'media', 'all', 60,  7, '#c2410c', '', 2, true),
        ('Experience Class', 'Experience', 'Experiencia especial mensual con dinámica variable según el evento.',                            'especial', 'media', 'all', 120, 12, '#752223', '', 3, true)
      ON CONFLICT (name) DO UPDATE SET
        subtitle     = EXCLUDED.subtitle,
        description  = EXCLUDED.description,
        category     = EXCLUDED.category,
        duration_min = EXCLUDED.duration_min,
        capacity     = EXCLUDED.capacity,
        color        = EXCLUDED.color,
        sort_order   = EXCLUDED.sort_order,
        is_active    = true
    `).catch((e) => console.error("[schema] seed VARRE24 class_types:", e.message));

    // Sincronizar capacidad (7) de las clases ya generadas de Pilates Mat / Barre
    await pool.query(
      `UPDATE classes SET max_capacity = 7
         WHERE max_capacity <> 7 AND class_type_id IN (SELECT id FROM class_types WHERE name IN ('Pilates Mat','Barre'))`
    ).catch(() => { });

    // ── UNIQUE constraint en class_types.name para que NUNCA se dupliquen ──
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'class_types_name_key'
        ) THEN
          ALTER TABLE class_types ADD CONSTRAINT class_types_name_key UNIQUE (name);
        END IF;
      END$$;
    `).catch((e) => console.warn("[uniq class_types.name]", e.message));

    console.log("✅ Class types VARRE24: Pilates Mat, Barre, Experience Class");
    // ── Seed class_types – bloque legacy (nunca se ejecuta) ─────────────
    const hasPNTypes = { rows: [1] };
    if (hasPNTypes.rows.length === 0) {
      await pool.query(`
        INSERT INTO class_types (name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order, is_active) VALUES
          ('Pilates Matt Clásico', 'Método Clásico',        'Fortalece la musculatura que le da sostén a tu cuerpo respetando las bases del método clásico. Es una clase que te exige presencia, control, fluidez y una respiración consiente. ¡Utiliza el movimiento como forma de autoconocimiento!',        'pilates',   'media',   'all',          55, 10, '#C9A295', '🌊', 1, true),
          ('Pilates Terapéutico',  'Fines terapéuticos',    'Una clase con efectos terapéuticos en el cuerpo como la disminución de dolor, mejora en movilidad y fortalecimiento general. Ideal para quienes buscan ejercitarse por alguna condición médica, lesión o bien están buscando regresar a ejercitarse. ¡Recupera la confianza en tu movimiento!', 'pilates',   'ligera',  'all',          55, 10, '#F7EFE5', '💚', 2, true),
          ('Flex & Flow',          'Movimiento libre',      'Una clase que te invita a conectar mente y cuerpo por medio de movimientos naturales, fluidos y consientes ayudando a sentirte más libre, ágil, flexible y sin limitación. ¡Recupera el placer de un movimiento libre!',                           'pilates',   'media',   'all',          55, 10, '#C9A295', '�', 3, true),
          ('Body Strong',          'Dinámica y retadora',   'Una clase de intensidad moderada, dinámica y retadora, que busca lograr un funcionamiento integral y funcional del cuerpo sin dejar ejecución y cuidado de los movimientos. ¡Conoce y desafía tus propios límites!',                              'pilates',   'pesada',  'intermediate', 50, 10, '#8B6B5E', '🔥', 4, true)
        ON CONFLICT DO NOTHING;
      `);
      console.log("✅ Seeded 4 VARRE24 class types");
    }
    // ── Seed schedule_slots – horario base VARRE24 ────────────────────────
    await pool.query(`DELETE FROM schedule_slots WHERE class_type_name IN ('Pilates Reformer','Barre Studio','Yoga Sculpt','Body Strong','Pilates Matt Clásico','Pilates Terapéutico','Flex & Flow')`).catch(() => { });
    // Aceptar 0=Domingo (convención JS) y 7=Domingo (legacy).
    await pool.query(`ALTER TABLE schedule_slots DROP CONSTRAINT IF EXISTS schedule_slots_day_of_week_check`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD CONSTRAINT schedule_slots_day_of_week_check CHECK (day_of_week BETWEEN 0 AND 7)`).catch(() => { });
    // ── Horario base VARRE24 (editable desde el admin) ───────────────────
    // Solo corre una vez por DB según schedule_slots_version. El studio lo ajusta
    // luego desde el panel. Lunes a viernes: Pilates Mat y Barre, mañana y tarde.
    // Fines de semana quedan libres (cumpleaños / eventos privados).
    {
      const ver = await pool.query("SELECT value FROM settings WHERE key='schedule_slots_version'").catch(()=>({rows:[]}));
      const current = ver.rows[0]?.value;
      const target = "varre24-v2";
      if (current !== target && current?.version !== target) {
        await pool.query(`DELETE FROM schedule_slots`).catch(()=>{});
        // Horario real VARRE24 (instructoras: Grisel, Kar, Ara, Ivanna).
        await pool.query(`
          INSERT INTO schedule_slots (time_slot, day_of_week, class_type_name, instructor_name) VALUES
            -- 7:00 am
            ('7:00 am', 1, 'Barre', 'Grisel'), ('7:00 am', 2, 'Barre', 'Kar'),
            ('7:00 am', 3, 'Barre', 'Grisel'), ('7:00 am', 4, 'Barre', 'Ara'),
            ('7:00 am', 5, 'Barre', 'Grisel'),
            -- 8:00 am
            ('8:00 am', 1, 'Barre', 'Kar'), ('8:00 am', 2, 'Pilates', 'Kar'),
            ('8:00 am', 3, 'Barre', 'Grisel'), ('8:00 am', 4, 'Pilates', 'Ara'),
            ('8:00 am', 5, 'Barre', 'Grisel'),
            -- 6:00 pm
            ('6:00 pm', 1, 'Pilates', 'Ivanna'), ('6:00 pm', 2, 'Pilates', 'Ara'),
            ('6:00 pm', 3, 'Pilates', 'Ivanna'), ('6:00 pm', 4, 'Pilates', 'Ivanna'),
            ('6:00 pm', 5, 'Pilates', 'Ara'),
            -- 7:00 pm
            ('7:00 pm', 1, 'Pilates', 'Ivanna'), ('7:00 pm', 2, 'Barre', 'Ara'),
            ('7:00 pm', 3, 'Pilates', 'Ivanna'), ('7:00 pm', 4, 'Pilates', 'Ivanna'),
            ('7:00 pm', 5, 'Barre', 'Ara')
          ON CONFLICT DO NOTHING;
        `).catch((e) => console.error("[schema] schedule_slots VARRE24 seed:", e.message));
        await pool.query(
          `INSERT INTO settings (key, value) VALUES ('schedule_slots_version', $1::jsonb)
            ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
          [JSON.stringify(target)]
        ).catch(()=>{});
        console.log("✅ Schedule slots: horario base VARRE24 aplicado");
      }
    }
    // ── Ensure plans columns exist ───────────────────────────────────────
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN'`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_limit INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_category VARCHAR(20) DEFAULT 'all'`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_non_transferable BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_non_repeatable BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS repeat_key VARCHAR(80)`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS discount_price NUMERIC(10,2)`).catch(() => { });
    // Seed discount_price for existing plans that don't have one yet
    await pool.query(`
      UPDATE plans SET discount_price = CASE
        WHEN price = 120 THEN 110
        WHEN price = 400 THEN 380
        WHEN price = 680 THEN 640
        WHEN price = 900 THEN 840
        ELSE NULL
      END
      WHERE discount_price IS NULL AND price IN (120, 400, 680, 900)
    `).catch(() => { });
    // ── Migrate class_types: normalize categories for VARRE24 ──
    await pool.query(`
      UPDATE class_types SET category = 'pilates' WHERE category NOT IN ('pilates','bienestar','funcional','barre','especial');
    `).catch(() => { });
    // ── Migrate plans: 'mixto' class_category means both, keep as 'mixto' for logic ──
    // (mixto plans are still valid — the booking endpoint allows them on both categories)
    // ── Seed plans: deactivate old schema_complete.sql plans & ensure only correct ones ──
    // Soft-delete (deactivate) old plans that came from the migration seed (wrong data)
    // Using UPDATE instead of DELETE to avoid FK constraint from orders table
    await pool.query(`
      UPDATE plans SET is_active = false WHERE name IN (
        'Inscripción (Pago Anual)',
        'Sesión Muestra o Individual',
        'Sesión Extra (Socias o Inscritas)',
        'Una Sesión (4 al Mes)',
        'Dos Sesiones (8 al Mes)',
        'Tres Sesiones (12 al Mes)',
        'Cuatro Sesiones (16 al Mes)',
        'Cinco Sesiones (20 al Mes)',
        'Seis Sesiones (24 al Mes)',
        'Siete Sesiones (28 al Mes)'
      );
    `).catch(() => { });
    // Deactivate old combo "Paquete +" plans — replaced by complement add-on selector
    await pool.query(`
      UPDATE plans SET is_active = false WHERE name ILIKE '%+%Nutri%' OR name ILIKE '%+%Descarga%' OR name ILIKE '%+%Hormonal%' OR name ILIKE 'Paquete +%' OR name ILIKE '%Clases +%';
    `).catch(() => { });
    // Remove legacy plan "Sesión Extra (Socias o Inscritas)" and all related data.
    // This keeps admin clean and avoids accidental reuse of an obsolete plan.
    try {
      const legacyPlanName = "Sesión Extra (Socias o Inscritas)";
      const legacyRes = await pool.query(`SELECT id FROM plans WHERE name = $1`, [legacyPlanName]);
      if (legacyRes.rows.length) {
        const legacyIds = legacyRes.rows.map((row) => row.id);
        const cleanupClient = await pool.connect();
        try {
          await cleanupClient.query("BEGIN");
          await cleanupClient.query(
            `UPDATE memberships
                SET order_id = NULL
              WHERE order_id IN (SELECT id FROM orders WHERE plan_id = ANY($1::uuid[]))`,
            [legacyIds]
          ).catch(() => { });
          await cleanupClient.query(`DELETE FROM discount_codes WHERE plan_id = ANY($1::uuid[])`, [legacyIds]).catch(() => { });
          await cleanupClient.query(`DELETE FROM memberships WHERE plan_id = ANY($1::uuid[])`, [legacyIds]).catch(() => { });
          await cleanupClient.query(`DELETE FROM orders WHERE plan_id = ANY($1::uuid[])`, [legacyIds]).catch(() => { });
          await cleanupClient.query(`DELETE FROM plans WHERE id = ANY($1::uuid[])`, [legacyIds]);
          await cleanupClient.query("COMMIT");
        } catch (legacyErr) {
          await cleanupClient.query("ROLLBACK").catch(() => { });
          console.warn("[schema] Legacy session cleanup skipped:", legacyErr?.message || legacyErr);
        } finally {
          cleanupClient.release();
        }
      }
    } catch (legacyTopErr) {
      console.warn("[schema] Legacy session lookup failed:", legacyTopErr?.message || legacyTopErr);
    }
    // ── Desactivar planes heredados (VARRE24 / Catarsis) ─────────────
    await pool.query(`UPDATE plans SET is_active = false WHERE name IN (
      'Clase Suelta','Clase Muestra','Socias Fundadoras',
      '4 Clases','8 Clases','10 Clases','12 Clases','16 Clases','20 Clases'
    )`).catch(() => { });
    // ── Sembrar planes VARRE24 (solo si no hay planes "reales" activos) ────
    const plCount = await pool.query("SELECT COUNT(*) FROM plans WHERE is_active = true AND COALESCE(repeat_key,'') NOT LIKE 'trial%'");
    if (parseInt(plCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, features, is_active, sort_order, repeat_key, is_non_repeatable) VALUES
          ('Clase de prueba',        'Tu primera clase para conocer VARRE24.', 120,   'MXN', 7,   1,    'all', '["1 clase de prueba","Vigencia 7 días","Solo para tu primera vez"]'::jsonb,   true, 1, 'trial_single_session', true),
          ('Clase individual',       'Una clase suelta, cuando quieras.',      270,   'MXN', 30,  1,    'all', '["1 clase","Vigencia 30 días"]'::jsonb,                                       true, 2, NULL, false),
          ('Paquete 4 clases',       'Paquete de 4 clases al mes.',            500,   'MXN', 30,  4,    'all', '["4 clases","Vigencia 30 días"]'::jsonb,                                      true, 3, NULL, false),
          ('Membresía mensual',      'Hasta 3 clases por semana (12 al mes).', 990,   'MXN', 30,  12,   'all', '["Hasta 3 clases por semana","12 clases al mes","Reserva anticipada"]'::jsonb, true, 4, NULL, false),
          ('Plan ilimitado 6 meses', 'Clases ilimitadas durante 6 meses.',     16000, 'MXN', 180, NULL, 'all', '["Clases ilimitadas","Vigencia 6 meses"]'::jsonb,                             true, 5, NULL, false)
        ON CONFLICT DO NOTHING;
      `).catch((e) => console.error("[schema] seed VARRE24 plans:", e.message));
      console.log("✅ Plans VARRE24 sembrados (prueba, individual, 4 clases, mensual, ilimitado 6m)");
    }
    // NOTA: el seed auto-curativo de "Clase Muestra" ($110) fue eliminado a
    // propósito (2026-05-17). Regeneraba/reactivaba el plan en cada deploy, así
    // que no se podía borrar de forma permanente desde el admin. Los planes de
    // prueba ahora se gestionan manualmente (p. ej. "Clase de prueba" $200).
    // ── Backfill class_category on existing plans ──
    await pool.query(`UPDATE plans SET class_category = 'all' WHERE class_category IS NULL`).catch(() => { });
    // ── Products table ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name       VARCHAR(150) NOT NULL,
        price      DECIMAL(10,2) DEFAULT 0,
        category   VARCHAR(50) DEFAULT 'accesorios',
        stock      INTEGER DEFAULT 0,
        sku        VARCHAR(100),
        is_active  BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── Order items table ───────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        quantity   INTEGER NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    `);
    // ── Payment proofs table ────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_proofs (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        file_url    TEXT NOT NULL,
        file_name   VARCHAR(255),
        mime_type   VARCHAR(100),
        status      VARCHAR(30) NOT NULL DEFAULT 'pending',
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT uq_payment_proofs_order UNIQUE (order_id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON payment_proofs(order_id);
    `);
    // ── Instructors table ──────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS instructors (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        display_name VARCHAR(150) NOT NULL,
        email        VARCHAR(255),
        phone        VARCHAR(30),
        bio          TEXT,
        specialties  TEXT,
        photo_url    TEXT,
        is_active    BOOLEAN DEFAULT true,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS photo_focus_x SMALLINT DEFAULT 50`).catch(() => { });
    await pool.query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS photo_focus_y SMALLINT DEFAULT 50`).catch(() => { });
    // ── Reviews table ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
        rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment     TEXT,
        class_id    UUID,
        is_approved BOOLEAN DEFAULT false,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
    `);
    // Ensure all review columns exist even if table was created by an older schema
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating SMALLINT`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS overall_rating SMALLINT`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS comment TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS class_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    await pool.query(`UPDATE reviews SET rating = COALESCE(rating, overall_rating, 5) WHERE rating IS NULL`).catch(() => { });
    await pool.query(`UPDATE reviews SET overall_rating = COALESCE(overall_rating, rating, 5) WHERE overall_rating IS NULL`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ALTER COLUMN rating SET DEFAULT 5`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ALTER COLUMN overall_rating SET DEFAULT 5`).catch(() => { });
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'reviews_rating_check'
            AND conrelid = 'reviews'::regclass
        ) THEN
          ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5);
        END IF;
      END $$;
    `).catch(() => { });
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='reviews' AND column_name='overall_rating'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'reviews_overall_rating_check'
            AND conrelid = 'reviews'::regclass
        ) THEN
          ALTER TABLE reviews ADD CONSTRAINT reviews_overall_rating_check CHECK (overall_rating BETWEEN 1 AND 5);
        END IF;
      END $$;
    `).catch(() => { });
    await pool.query(`ALTER TABLE reviews ALTER COLUMN rating SET NOT NULL`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ALTER COLUMN overall_rating SET NOT NULL`).catch(() => { });
    await pool.query(`
      CREATE OR REPLACE FUNCTION reviews_sync_overall_rating()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.overall_rating := COALESCE(NEW.overall_rating, NEW.rating, 5);
        NEW.rating := COALESCE(NEW.rating, NEW.overall_rating, 5);
        RETURN NEW;
      END;
      $$;
    `).catch(() => { });
    await pool.query(`DROP TRIGGER IF EXISTS trg_reviews_sync_overall_rating ON reviews`).catch(() => { });
    await pool.query(`
      CREATE TRIGGER trg_reviews_sync_overall_rating
      BEFORE INSERT OR UPDATE ON reviews
      FOR EACH ROW
      EXECUTE FUNCTION reviews_sync_overall_rating();
    `).catch(() => { });
    // Add booking_id, instructor_id, tag_ids columns to reviews if missing
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS booking_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS instructor_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tag_ids UUID[] DEFAULT '{}'`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews(booking_id)`).catch(() => { });
    await pool.query(`
      DELETE FROM reviews a
      USING reviews b
      WHERE a.booking_id IS NOT NULL
        AND a.booking_id = b.booking_id
        AND a.created_at < b.created_at
    `).catch(() => { });
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_booking_unique
      ON reviews(booking_id)
      WHERE booking_id IS NOT NULL
    `).catch((err) => {
      console.warn("[DB] Could not create unique review index on booking_id:", err?.message || err);
    });
    // ── Review-tag links (many-to-many) ────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_tag_links (
        review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
        tag_id    UUID REFERENCES review_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (review_id, tag_id)
      );
    `).catch(() => { });
    // ── Loyalty transactions table ─────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        VARCHAR(10) NOT NULL CHECK (type IN ('earn','redeem','adjust')),
        points      INTEGER NOT NULL,
        description TEXT,
        created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user ON loyalty_transactions(user_id)`).catch(() => { });
    // ── referrals table (tracks which users were referred) ─────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        referral_code_id UUID REFERENCES referral_codes(id) ON DELETE CASCADE,
        referred_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        rewarded         BOOLEAN DEFAULT false,
        created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code_id)`).catch(() => { });
    // ── referrals: ampliar columnas para auditoria y descuento ─────────────
    await pool.query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_user_id UUID REFERENCES users(id) ON DELETE SET NULL`).catch((e) => console.error("[migration referrals.referrer_user_id]", e.message));
    await pool.query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2)`).catch((e) => console.error("[migration referrals.discount_percent]", e.message));
    await pool.query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS reward_order_id UUID REFERENCES orders(id) ON DELETE SET NULL`).catch((e) => console.error("[migration referrals.reward_order_id]", e.message));
    await pool.query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS rewarded_at TIMESTAMPTZ`).catch((e) => console.error("[migration referrals.rewarded_at]", e.message));
    // Backfill referrer_user_id desde referral_codes
    await pool.query(`
      UPDATE referrals r SET referrer_user_id = rc.user_id
      FROM referral_codes rc
      WHERE r.referral_code_id = rc.id AND r.referrer_user_id IS NULL
    `).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_referrals_referred_user ON referrals(referred_user_id)`).catch(() => { });
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'no_self_referral') THEN
          ALTER TABLE referrals ADD CONSTRAINT no_self_referral
            CHECK (referrer_user_id IS NULL OR referrer_user_id <> referred_user_id);
        END IF;
      END$$;
    `).catch((e) => console.warn("[referral self-check]", e.message));
    // orders: columnas para descuento de referido (legacy referral_id) + credit (nuevo)
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_discount NUMERIC(10,2) DEFAULT 0`).catch(() => { });
    // ── referral_credits: el referidor (Said) gana un crédito cuando el referido (Pedro) compra ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_credits (
        id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
        source_order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        discount_percent   NUMERIC(5,2) NOT NULL,
        expires_at         TIMESTAMPTZ NOT NULL,
        used_in_order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
        used_at            TIMESTAMPTZ,
        voided_at          TIMESTAMPTZ,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).catch((e) => console.error("[migration referral_credits CREATE]", e.message));
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_credits_source ON referral_credits(source_referral_id)`).catch((e) => console.error("[migration referral_credits source idx]", e.message));
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_credits_user_active ON referral_credits(user_id, created_at) WHERE used_at IS NULL AND voided_at IS NULL`).catch((e) => console.error("[migration referral_credits active idx]", e.message));
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS applied_credit_id UUID REFERENCES referral_credits(id) ON DELETE SET NULL`).catch((e) => console.error("[migration orders.applied_credit_id]", e.message));
    // ── Aprobación manual del crédito de referido ──────────────────────────
    // Antes el crédito se aplicaba SOLO al comprar (automático) y confundía a
    // la dueña. Ahora cada crédito nace PENDIENTE (approved_at NULL) y solo se
    // puede usar en checkout cuando el admin lo aprueba. rejected_at = rechazado.
    await pool.query(`ALTER TABLE referral_credits ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`).catch(() => {});
    await pool.query(`ALTER TABLE referral_credits ADD COLUMN IF NOT EXISTS approved_by UUID`).catch(() => {});
    await pool.query(`ALTER TABLE referral_credits ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ`).catch(() => {});
    await pool.query(`ALTER TABLE referral_credits ADD COLUMN IF NOT EXISTS rejected_reason TEXT`).catch(() => {});
    // Histórico: los créditos YA usados se marcan aprobados (no romper el pasado).
    await pool.query(`UPDATE referral_credits SET approved_at = COALESCE(approved_at, used_at) WHERE used_at IS NOT NULL AND approved_at IS NULL`).catch(() => {});
    // ── orders: add missing columns if needed ─────────────────────────────
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code_id UUID REFERENCES discount_codes(id) ON DELETE SET NULL`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(30) DEFAULT 'web'`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS plan_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS verified_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS complement_type VARCHAR(100)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_discount_code_id ON orders(discount_code_id)`).catch(() => { });
    // Make plan_id nullable (POS orders don't always have a plan)
    await pool.query(`ALTER TABLE orders ALTER COLUMN plan_id DROP NOT NULL`).catch(() => { });
    // Make user_id nullable (walk-in POS sales may not have a user)
    await pool.query(`ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL`).catch(() => { });
    // ── MercadoPago: columnas de pago en orders + tabla de idempotencia de webhooks ──
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50)`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_checkout_url TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_id VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_status VARCHAR(50)`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_status_detail VARCHAR(100)`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_synced_at TIMESTAMP WITH TIME ZONE`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_fee_amount DECIMAL(10,2) DEFAULT 0`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_mp_payment_id ON orders(mp_payment_id)`).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        provider     VARCHAR(50) NOT NULL,
        event_key    VARCHAR(255) NOT NULL,
        event_type   VARCHAR(50),
        payload      JSONB DEFAULT '{}',
        processed_at TIMESTAMP WITH TIME ZONE,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(provider, event_key)
      )
    `).catch((e) => console.error("[migration payment_webhook_events]", e.message));
    // ── memberships: add order_id column ─────────────────────────────────
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS order_id UUID`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_order ON memberships(order_id) WHERE order_id IS NOT NULL`).catch(() => { });
    // ── memberships: add fallback name/limit override columns ─────────────
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS plan_name_override VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS class_limit_override INTEGER`).catch(() => { });
    // Fix existing 9999 unlimited sentinel values → NULL
    await pool.query(`
      UPDATE memberships SET classes_remaining = NULL WHERE classes_remaining >= 9999;
    `).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => { });
    // ── consultations table: track complement consultations ──────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        membership_id   UUID REFERENCES memberships(id) ON DELETE SET NULL,
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        complement_type VARCHAR(100) NOT NULL,
        complement_name VARCHAR(255),
        specialist      VARCHAR(255),
        status          VARCHAR(30) DEFAULT 'pending',
        scheduled_date  TIMESTAMP WITH TIME ZONE,
        notes           TEXT,
        completed_at    TIMESTAMP WITH TIME ZONE,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    // ── memberships: track how many times a user has cancelled ────────────
    await pool.query(`
      ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancellations_used INTEGER NOT NULL DEFAULT 0;
    `).catch(() => { });
    // ── bookings: track who cancelled (user | admin | system) ─────────────
    // This prevents startup reconciliation from counting admin-initiated
    // cancellations against the client's cancellation limit.
    await pool.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(10) DEFAULT NULL;
    `).catch(() => { });
    // ── Reconcile cancellations_used — only count USER-initiated cancels ──
    // Admin cancellations (cancelled_by = 'admin') restore credits and should
    // NOT count against the client's limit of 2 cancellations per membership.
    await pool.query(`
      UPDATE memberships m
      SET cancellations_used = sub.cnt
      FROM (
        SELECT b.membership_id, COUNT(*) AS cnt
        FROM bookings b
        WHERE b.status = 'cancelled'
          AND b.membership_id IS NOT NULL
          AND (b.cancelled_by IS NULL OR b.cancelled_by = 'user')
        GROUP BY b.membership_id
      ) sub
      WHERE m.id = sub.membership_id AND m.cancellations_used != sub.cnt;
    `).catch(() => { });
    // ── Drop legacy Postgres triggers that duplicate what the app already does ──
    // `trigger_decrement_classes` subtracted 1 from classes_remaining on every
    // transition to checked_in, but index.js already deducts at booking creation.
    // Result: every checked-in booking consumed 2 credits instead of 1.
    // `trigger_update_booking_count` did the same with classes.current_bookings.
    await pool.query(`DROP TRIGGER IF EXISTS trigger_decrement_classes ON bookings`).catch(() => { });
    await pool.query(`DROP FUNCTION IF EXISTS decrement_membership_classes() CASCADE`).catch(() => { });
    await pool.query(`DROP TRIGGER IF EXISTS trigger_update_booking_count ON bookings`).catch(() => { });
    await pool.query(`DROP FUNCTION IF EXISTS update_class_booking_count() CASCADE`).catch(() => { });
    // ── membership_credit_log: audit trail for every classes_remaining change ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS membership_credit_log (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
        old_value     INTEGER,
        new_value     INTEGER,
        delta         INTEGER,
        reason        VARCHAR(40) NOT NULL,
        actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        booking_id    UUID REFERENCES bookings(id) ON DELETE SET NULL,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_credit_log_membership ON membership_credit_log(membership_id, created_at DESC)`).catch(() => { });
    // ── Reconcile current_bookings counter with actual confirmed bookings ──
    // OJO: cada lugar cuenta 1, EXCEPTO una alumna (user_id presente) que lleva
    // invitada → 2. Un walk-in (user_id NULL, guest_name presente) es 1 sola
    // persona. Antes este reconcile hacía COUNT(*) de filas y, al correr en cada
    // arranque, revertía a las clases con invitada (la alumna+invitada volvía a
    // contar 1 en vez de 2). Debe usar la MISMA fórmula que /api/classes.
    await pool.query(`
      UPDATE classes c
      SET current_bookings = sub.cnt
      FROM (
        SELECT b.class_id,
               SUM(CASE WHEN b.user_id IS NOT NULL AND b.guest_name IS NOT NULL AND b.guest_name <> '' THEN 2 ELSE 1 END)
                 FILTER (WHERE b.status IN ('confirmed','checked_in'))::int AS cnt
        FROM bookings b
        GROUP BY b.class_id
      ) sub
      WHERE c.id = sub.class_id AND c.current_bookings != sub.cnt;
    `).catch(() => { });
    // ── homepage_video_cards: editable 3-card section on landing page ──────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS homepage_video_cards (
        id          SERIAL PRIMARY KEY,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        title       VARCHAR(120) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        emoji       VARCHAR(10)  NOT NULL DEFAULT '🎬',
        video_url   TEXT,
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    // Add video_url column if table already existed
    await pool.query(`ALTER TABLE homepage_video_cards ADD COLUMN IF NOT EXISTS video_url TEXT`).catch(() => { });
    // Add thumbnail_url column for custom poster images
    await pool.query(`ALTER TABLE homepage_video_cards ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`).catch(() => { });
    // seed default cards only when table is empty
    await pool.query(`
      INSERT INTO homepage_video_cards (sort_order, title, description, emoji)
      SELECT * FROM (VALUES
        (1, 'Pilates Matt Clásico', 'Fortalece tu core y mejora tu postura con movimientos controlados.', 'dumbbell'),
        (2, 'Flex & Flow',   'Secuencias fluidas para ganar flexibilidad y conciencia corporal.',     'waves'),
        (3, 'Body Strong',    'Entrenamiento funcional para fortalecer todo tu cuerpo.',        'activity')
      ) AS v(sort_order, title, description, emoji)
      WHERE NOT EXISTS (SELECT 1 FROM homepage_video_cards LIMIT 1);
    `).catch(() => { });
    // Migrate old emoji values to icon keys
    await pool.query(`
      UPDATE homepage_video_cards SET emoji = CASE emoji
        WHEN '🏋️' THEN 'dumbbell' WHEN '🏋' THEN 'dumbbell'
        WHEN '💃' THEN 'music' WHEN '🧘' THEN 'waves'
        WHEN '🔥' THEN 'flame' WHEN '⚡' THEN 'zap'
        WHEN '❤️' THEN 'heart' WHEN '💪' THEN 'activity'
        WHEN '✨' THEN 'sparkles' WHEN '🎬' THEN 'activity'
        ELSE emoji END
      WHERE emoji NOT IN ('dumbbell','music','waves','flame','zap','heart','activity','sparkles');
    `).catch(() => { });
    // ── discount_codes: normalise discount_type values ────────────────────
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS min_order_amount DECIMAL(10,2) DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE SET NULL`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS class_category VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'all'`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_discount_codes_plan ON discount_codes(plan_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_discount_codes_category ON discount_codes(class_category)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_discount_codes_channel ON discount_codes(channel)`).catch(() => { });
    await pool.query(`UPDATE discount_codes SET discount_type = 'percent' WHERE discount_type IN ('percentage', 'porcentaje', '%')`).catch(() => { });
    await pool.query(`UPDATE discount_codes SET channel = 'all' WHERE channel IS NULL OR channel = ''`).catch(() => { });
    await pool.query(`UPDATE discount_codes SET class_category = NULL WHERE class_category NOT IN ('all','pilates','bienestar','funcional','barre','especial','mixto')`).catch(() => { });
    // ── bookings: add checked_in_at column ────────────────────────────────
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP WITH TIME ZONE`).catch(() => { });
    // ── Auto check-in + admin no-show revert (Grupo A) ────────────────────
    // 'auto' como nuevo checkin_method válido. ALTER TYPE ... ADD VALUE no
    // puede correr en transacción; pool.query() lo ejecuta autocommit.
    await pool.query(`ALTER TYPE checkin_method ADD VALUE IF NOT EXISTS 'auto'`).catch((e) => {
      if (!/already exists|duplicate/i.test(e.message)) console.error("[migration checkin_method auto]", e.message);
    });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkin_method checkin_method`).catch((e) => console.error("[migration bookings.checkin_method]", e.message));
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMP WITH TIME ZONE`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_show_by UUID REFERENCES users(id) ON DELETE SET NULL`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_user_cancelled_at ON bookings(user_id, cancelled_at) WHERE cancelled_by = 'user'`).catch(() => { });
    // Índice compuesto que acelera el GROUP BY class_id + WHERE status IN (...)
    // del calendario de admin (/api/classes). Sin esto, el LEFT JOIN derivado
    // que cuenta reservas confirmed/checked_in por clase escanea idx_bookings_status
    // completo y agrupa en memoria. Con esto, el scan queda cubierto por índice.
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_class_status ON bookings(class_id, status)`).catch(() => { });
    // ── Cobro por transferencia: auto-approve provisional + múltiples evidencias (Grupo B) ──
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_approved_at TIMESTAMP WITH TIME ZONE`).catch(()=>{});
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_approval_expires_at TIMESTAMP WITH TIME ZONE`).catch(()=>{});
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_reverted_at TIMESTAMP WITH TIME ZONE`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_auto_approval_expires
                    ON orders(auto_approval_expires_at)
                  WHERE auto_approval_expires_at IS NOT NULL`).catch(()=>{});
    await pool.query(`ALTER TABLE payment_proofs DROP CONSTRAINT IF EXISTS uq_payment_proofs_order`)
      .catch((e)=>console.error("[migration drop uq_payment_proofs_order]", e.message));
    await pool.query(`ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payment_proofs_order_sort ON payment_proofs(order_id, sort_order)`).catch(()=>{});

    // ── Grupo D: audit log de mutaciones admin ────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
        actor_email     VARCHAR(255),
        actor_role      VARCHAR(30),
        method          VARCHAR(10) NOT NULL,
        path            TEXT NOT NULL,
        path_full       TEXT,
        resource_id     TEXT,
        status_code     INTEGER,
        payload         JSONB DEFAULT '{}',
        ip              VARCHAR(45),
        user_agent      TEXT,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `).catch((e) => console.error("[migration admin_audit_log]", e.message));
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON admin_audit_log(actor_user_id, created_at DESC)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_created       ON admin_audit_log(created_at DESC)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_resource      ON admin_audit_log(resource_id) WHERE resource_id IS NOT NULL`).catch(()=>{});
    // (Upsert del setting cancellation_window se hace abajo, después de crear la tabla settings.)
    // Reescribir "Cancelación con 12h..." → "...con 5h..." en plans.features
    await pool.query(`
      UPDATE plans
         SET features = (
           SELECT jsonb_agg(
             CASE WHEN value::text ILIKE '%Cancelación con 12h%'
                  THEN to_jsonb('Cancelación con 5h de anticipación'::text)
                  ELSE value END
           )
           FROM jsonb_array_elements(features) value
         )
       WHERE features::text ILIKE '%Cancelación con 12h%'
    `).catch((e) => console.error("[migration plans.features 12h→5h]", e.message));
    // ── bookings: walk-in support (nullable user_id + guest_name/phone + order link) ─
    await pool.query(`ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_name TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_phone TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL`).catch(() => { });
    // ── orders: walk-in support (nullable user_id was set earlier; add guest fields) ─
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_name TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_phone TEXT`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_guest_phone ON orders(guest_phone) WHERE guest_phone IS NOT NULL`).catch(() => { });
    // Prevent duplicate active bookings (same user + same class)
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_user_class_active
      ON bookings (user_id, class_id)
      WHERE status NOT IN ('cancelled')
    `).catch(() => { });
    // Quitar la constraint vieja unique_booking UNIQUE(class_id,user_id) SIN
    // filtro de status: bloqueaba re-reservar/re-asignar una clase que la
    // alumna había cancelado antes (el INSERT chocaba con la fila cancelada →
    // "Error interno"). La unicidad correcta (1 reserva ACTIVA por alumna/clase)
    // ya la da idx_bookings_user_class_active.
    await pool.query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS unique_booking`).catch(() => { });
    await pool.query(`DROP INDEX IF EXISTS unique_booking`).catch(() => { });
    // ── Settings table ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key        VARCHAR(100) PRIMARY KEY,
        value      JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["general_settings", JSON.stringify(DEFAULT_GENERAL_SETTINGS)],
    ).catch(() => { });
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["policies_settings", JSON.stringify(DEFAULT_POLICIES_SETTINGS)],
    ).catch(() => { });
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["notification_settings", JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS)],
    ).catch(() => { });
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["notification_templates", JSON.stringify(DEFAULT_NOTIFICATION_TEMPLATES)],
    ).catch(() => { });
    for (const [settingKey, defaults] of Object.entries(DEFAULT_SETTINGS_BY_KEY)) {
      await pool.query(
        `UPDATE settings
            SET value = $2::jsonb || COALESCE(value, '{}'::jsonb),
                updated_at = NOW()
          WHERE key = $1 AND jsonb_typeof(value) = 'object'`,
        [settingKey, JSON.stringify(defaults)],
      ).catch(() => { });
    }
    // ── Upsert del setting cancellation_window ───────────────────────────
    // Crea la fila con defaults nuevos si no existe. Si ya existe:
    //   - asegura `free_cancellations_per_membership` (copia del valor legacy
    //     `free_cancellations_per_month` si existía, o default 2)
    //   - mantiene `free_cancellations_per_month` como alias (mismo valor)
    //   - baja min_hours de 12→5 solo si seguía con el viejo default.
    await pool.query(
      `INSERT INTO settings (key, value)
       VALUES ('cancellation_window', $1::jsonb)
       ON CONFLICT (key) DO UPDATE
         SET value = settings.value
                  || jsonb_build_object('free_cancellations_per_membership',
                       COALESCE(
                         settings.value->'free_cancellations_per_membership',
                         settings.value->'free_cancellations_per_month',
                         '2'::jsonb))
                  || jsonb_build_object('free_cancellations_per_month',
                       COALESCE(
                         settings.value->'free_cancellations_per_membership',
                         settings.value->'free_cancellations_per_month',
                         '2'::jsonb))
                  || CASE WHEN (settings.value->>'min_hours')::int = 12
                          THEN jsonb_build_object('min_hours', 5)
                          ELSE '{}'::jsonb END`,
      [JSON.stringify(DEFAULT_CANCELLATION_WINDOW)]
    ).catch((e) => console.error("[migration cancellation_window seed]", e.message));
    // ── Loyalty rewards table ──────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_rewards (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name         VARCHAR(150) NOT NULL,
        description  TEXT,
        points_cost  INTEGER NOT NULL,
        reward_type  VARCHAR(30) NOT NULL DEFAULT 'custom',
        reward_value VARCHAR(150),
        stock        INTEGER,
        is_active    BOOLEAN DEFAULT true,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── Loyalty rewards: add new columns if table already exists ───────────
    await pool.query(`ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS reward_type  VARCHAR(30) NOT NULL DEFAULT 'custom'`).catch(() => { });
    await pool.query(`ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS reward_value VARCHAR(150)`).catch(() => { });
    await pool.query(`ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS stock        INTEGER`).catch(() => { });
    // ── Apple Wallet device registration table ────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS apple_wallet_devices (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id      VARCHAR(255) NOT NULL,
        push_token     VARCHAR(255) NOT NULL DEFAULT '',
        pass_type_id   VARCHAR(255) NOT NULL,
        serial_number  VARCHAR(255) NOT NULL,
        created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(device_id, pass_type_id, serial_number)
      );
    `).catch(() => { });
    // Backward compatibility: some DBs still have the old wallet schema
    // (device_id, pass_type_id, membership_id) without serial_number.
    await pool.query(`ALTER TABLE apple_wallet_devices ADD COLUMN IF NOT EXISTS serial_number VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ADD COLUMN IF NOT EXISTS pass_type_id VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ADD COLUMN IF NOT EXISTS push_token VARCHAR(255) NOT NULL DEFAULT ''`).catch(() => { });
    await pool.query(`
      UPDATE apple_wallet_devices
      SET serial_number = CONCAT(
        'legacy_',
        REPLACE(COALESCE(membership_id::text, id::text), '-', '')
      )
      WHERE serial_number IS NULL OR serial_number = ''
    `).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ALTER COLUMN serial_number SET NOT NULL`).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ALTER COLUMN membership_id DROP NOT NULL`).catch(() => { });
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_apple_wallet_devices_device_pass_serial
      ON apple_wallet_devices(device_id, pass_type_id, serial_number)
    `).catch(() => { });
    // ── Wallet push notifications log ─────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_notification_logs (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
        reason         VARCHAR(160) NOT NULL DEFAULT 'wallet_update',
        apple_sent     INTEGER NOT NULL DEFAULT 0,
        apple_failed   INTEGER NOT NULL DEFAULT 0,
        google_synced  BOOLEAN NOT NULL DEFAULT false,
        google_mode    VARCHAR(40),
        status         VARCHAR(20) NOT NULL DEFAULT 'ok',
        detail         JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_notification_logs_user ON wallet_notification_logs(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_notification_logs_created_at ON wallet_notification_logs(created_at DESC)`).catch(() => { });
    // ── Review tags table ──────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_tags (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name       VARCHAR(100) NOT NULL,
        color      VARCHAR(20) DEFAULT '#C9A5A8',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── Videos: add price column (may fail if videos table not yet created) ─
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS price DECIMAL(10,2)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(500)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS cloudinary_id VARCHAR(500)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_drive_id VARCHAR(500)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS subtitle VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS tagline VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS days VARCHAR(100)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS brand_color VARCHAR(7)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_enabled BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_unlocks_video BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_price_mxn DECIMAL(10,2)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_class_credits INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_cta_text VARCHAR(100)`).catch(() => { });
    // ── Video purchases: add admin_notes and verified_at ──────────────────
    await pool.query(`ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS admin_notes TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE`).catch(() => { });

    // ── Módulo de Eventos ────────────────────────────────────────────────
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE event_type AS ENUM (
          'masterclass','workshop','retreat','challenge','openhouse','special'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type                event_type NOT NULL,
        title               VARCHAR(200) NOT NULL,
        description         TEXT NOT NULL,
        instructor_name     VARCHAR(100) NOT NULL,
        instructor_photo    TEXT,
        date                DATE NOT NULL,
        start_time          TIME NOT NULL,
        end_time            TIME NOT NULL,
        location            VARCHAR(200) NOT NULL,
        capacity            INTEGER NOT NULL DEFAULT 1,
        registered          INTEGER DEFAULT 0,
        price               NUMERIC(10,2) NOT NULL DEFAULT 0,
        currency            VARCHAR(3) DEFAULT 'MXN',
        early_bird_price    NUMERIC(10,2),
        early_bird_deadline DATE,
        member_discount     NUMERIC(5,2) DEFAULT 0,
        image               TEXT,
        requirements        VARCHAR(500) DEFAULT '',
        includes            JSONB DEFAULT '[]',
        tags                JSONB DEFAULT '[]',
        status              VARCHAR(20) DEFAULT 'draft',
        created_by          UUID,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_registrations (
        id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id                UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id                 UUID,
        name                    VARCHAR(100) NOT NULL,
        email                   VARCHAR(255) NOT NULL,
        phone                   VARCHAR(20) DEFAULT '',
        status                  VARCHAR(20) DEFAULT 'pending',
        amount                  NUMERIC(10,2) DEFAULT 0,
        payment_method          VARCHAR(20),
        payment_reference       VARCHAR(200),
        payment_proof_url       TEXT,
        payment_proof_file_name VARCHAR(255),
        transfer_date           DATE,
        paid_at                 TIMESTAMPTZ,
        checked_in              BOOLEAN DEFAULT false,
        checked_in_at           TIMESTAMPTZ,
        checked_in_by           UUID,
        waitlist_position       INTEGER,
        notes                   TEXT,
        created_at              TIMESTAMPTZ DEFAULT NOW(),
        updated_at              TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_status    ON events(status)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_date       ON events(date)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_type       ON events(type)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_regs_event  ON event_registrations(event_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_regs_user   ON event_registrations(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_regs_status ON event_registrations(status)`).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_passes (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
        user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pass_code      VARCHAR(60) NOT NULL UNIQUE,
        status         VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','used','cancelled')),
        issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        used_at        TIMESTAMPTZ,
        cancelled_at   TIMESTAMPTZ,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_passes_user ON event_passes(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_passes_event ON event_passes(event_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_passes_status ON event_passes(status)`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_event_passes_registration_unique ON event_passes(registration_id) WHERE registration_id IS NOT NULL`).catch(() => { });

    console.log("✅ Schema ensured");
  } catch (err) {
    console.error("Schema migration warning:", err.message);
  }

  // ── Seed demo classes for the next 4 weeks (only if classes table is empty) ──
  try {
    // First ensure at least one instructor exists
    const instCount = await pool.query("SELECT COUNT(*) FROM instructors");
    if (parseInt(instCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO instructors (display_name, email, bio, specialties, is_active) VALUES
          ('Angie', 'angie@varre24.com', 'Soy una profesional del movimiento apasionada por acompañar a las personas a sentirse mejor en su cuerpo desde un enfoque consciente, funcional y sostenible. Mi enfoque integra fuerza, movilidad y control corporal, adaptándose a cada persona y a cada proceso.', '["Pilates Matt Clásico","Pilates Terapéutico","Flex & Flow","Body Strong"]'::jsonb, true)
        ON CONFLICT DO NOTHING;
      `);
      console.log("✅ Seeded VARRE24 instructor (Angie)");
    }

    const classCount = await pool.query("SELECT COUNT(*) FROM classes");
    if (parseInt(classCount.rows[0].count) === 0) {
      // Fetch real class_type ids and instructor ids from DB
      const typesRes = await pool.query(
        "SELECT id, name FROM class_types WHERE is_active = true ORDER BY sort_order ASC LIMIT 8"
      );
      const instRes = await pool.query(
        "SELECT id FROM instructors WHERE is_active = true ORDER BY created_at ASC LIMIT 4"
      );

      if (typesRes.rows.length > 0 && instRes.rows.length > 0) {
        const types = typesRes.rows;       // [{id, name}, ...]
        const insts = instRes.rows;        // [{id}, ...]
        const getType = (i) => types[i % types.length].id;
        const getInst = (i) => insts[i % insts.length].id;

        // Build classes for Mon–Sat for the next 4 weeks
        const today = new Date();
        // Find Monday of current week
        const dayOfWeek = today.getDay(); // 0=Sun
        const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMon);

        // Time slots: morning + evening
        const SLOTS = [
          { hour: 7, min: 0, dur: 55 },
          { hour: 9, min: 0, dur: 55 },
          { hour: 11, min: 0, dur: 60 },
          { hour: 18, min: 0, dur: 55 },
          { hour: 19, min: 30, dur: 55 },
        ];
        // Days: Mon(1)–Sat(6), no Sunday
        const DAYS = [0, 1, 2, 3, 4, 5]; // offset from monday

        let typeIdx = 0;
        let instIdx = 0;
        const inserts = [];

        for (let week = 0; week < 4; week++) {
          for (const dayOffset of DAYS) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + week * 7 + dayOffset);
            const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD

            // Not every slot on every day — skip some to feel realistic
            const slotsToday = SLOTS.filter((_, si) => {
              // Weekends (Sat = offset 5) only morning slots
              if (dayOffset === 5 && si > 2) return false;
              // Some variety: skip slot if typeIdx+dayOffset+si is divisible by 7
              if ((typeIdx + dayOffset + si) % 7 === 0) return false;
              return true;
            });

            for (const slot of slotsToday) {
              const startH = String(slot.hour).padStart(2, "0");
              const startM = String(slot.min).padStart(2, "0");
              const totalMin = slot.hour * 60 + slot.min + slot.dur;
              const endH = String(Math.floor(totalMin / 60)).padStart(2, "0");
              const endM = String(totalMin % 60).padStart(2, "0");
              inserts.push({
                classTypeId: getType(typeIdx),
                instructorId: getInst(instIdx),
                date: dateStr,
                startTime: `${startH}:${startM}`,
                endTime: `${endH}:${endM}`,
                maxCapacity: 10,
              });
              typeIdx++;
              instIdx++;
            }
          }
        }

        for (const c of inserts) {
          await pool.query(
            `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
             VALUES ($1,$2,$3,$4,$5,$6,'scheduled') ON CONFLICT DO NOTHING`,
            [c.classTypeId, c.instructorId, c.date, c.startTime, c.endTime, c.maxCapacity]
          );
        }
        console.log(`✅ Seeded ${inserts.length} demo classes for the next 4 weeks`);
      }
    }
  } catch (err) {
    console.error("Demo classes seed warning:", err.message);
  }


  try {
    // Admin inicial 100% via env — NO se commitea ninguna credencial real.
    // Si ADMIN_PASSWORD no está definido se genera una temporal y se imprime
    // UNA vez en los logs del deploy para que la operadora la cambie al entrar.
    // ON CONFLICT NO sobreescribe password_hash: si el admin ya cambió su
    // contraseña desde la UI, los siguientes deploys la respetan.
    const adminEmail = String(process.env.ADMIN_EMAIL || "admin@varre24.com").trim().toLowerCase();
    const adminName = process.env.ADMIN_NAME || "Admin VARRE24";
    let adminPass = process.env.ADMIN_PASSWORD;
    let generated = false;
    if (!adminPass) {
      adminPass = "Varre24-" + crypto.randomBytes(6).toString("base64url");
      generated = true;
    }
    const adminHash = await bcrypt.hash(adminPass, 12);
    await pool.query(
      `INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms, accepts_communications)
       VALUES ($1, $2, '0000000000', $3, 'admin', true, false)
       ON CONFLICT (email) DO UPDATE SET role = 'admin'`,
      [adminName, adminEmail, adminHash]
    );
    if (generated) {
      console.log(`✅ Admin inicial creado: ${adminEmail} — contraseña temporal: ${adminPass} (cámbiala al entrar)`);
    } else {
      console.log(`✅ Admin user ready: ${adminEmail}`);
    }
  } catch (err) {
    console.error("Admin seed warning:", err.message);
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────
const CORS_ALLOWED_ORIGINS = String(
  process.env.CORS_ALLOWED_ORIGINS ||
  "https://varre24fit.com,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080",
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const SECURITY_RATE_LIMIT_WINDOW_MS = Math.max(10_000, Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000));
const SECURITY_RATE_LIMIT_MAX = Math.max(30, Number(process.env.API_RATE_LIMIT_MAX || 180));
const SECURITY_AUTH_WINDOW_MS = Math.max(10_000, Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000));
const SECURITY_AUTH_MAX = Math.max(5, Number(process.env.AUTH_RATE_LIMIT_MAX || 20));

app.disable("x-powered-by");
// gzip de respuestas JSON/HTML/JS. Reduce el payload del /api/classes y demás
// endpoints listados ~70% sobre la red — la mayor parte del tiempo en móviles
// con buena CPU es transferencia, no DB (la query de classes corre en <1ms).
app.use(compression({ threshold: 1024 }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (CORS_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (origin.endsWith(".up.railway.app")) return callback(null, true);
    // Evita lanzar un error 500. Se retorna false para no enviar cabeceras CORS.
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

const rateLimitBuckets = new Map();
function getRateLimitIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}
function createSimpleRateLimiter({ windowMs, max, keyPrefix, shouldApply }) {
  return (req, res, next) => {
    if (!shouldApply(req)) return next();
    const ip = getRateLimitIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const current = rateLimitBuckets.get(key);
    if (!current || current.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ message: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." });
    }
    current.count += 1;
    return next();
  };
}
// Best-effort in-memory cleanup to avoid unbounded map growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitBuckets.entries()) {
    if (!value || value.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 60_000).unref();

app.use(createSimpleRateLimiter({
  windowMs: SECURITY_RATE_LIMIT_WINDOW_MS,
  max: SECURITY_RATE_LIMIT_MAX,
  keyPrefix: "api",
  shouldApply: (req) =>
    req.path.startsWith("/api/") &&
    !req.path.startsWith("/api/wallet/v1/") &&
    req.path !== "/api/webhook/evolution",
}));
app.use(createSimpleRateLimiter({
  windowMs: SECURITY_AUTH_WINDOW_MS,
  max: SECURITY_AUTH_MAX,
  keyPrefix: "auth",
  shouldApply: (req) =>
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register" ||
    req.path === "/api/auth/forgot-password" ||
    req.path === "/api/auth/reset-password",
}));

// Skip JSON body parsing for binary upload-chunk endpoint
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  express.json({ limit: "20mb" })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  express.urlencoded({ extended: true, limit: "20mb" })(req, res, next);
});

// ─── Audit log de mutaciones admin (Grupo D) ────────────────────────────────
// Se monta DESPUÉS de los body parsers para tener acceso a req.body, y se
// dispara en res.on("finish") así que no bloquea la respuesta al cliente.
// La función se define más abajo (declarada con function → hoisted).
app.use((req, res, next) => adminAuditMiddleware(req, res, next));

// ─── Helper: snake_case → camelCase row mapper ──────────────────────────────
function camelRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}
function camelRows(rows) { return rows.map(camelRow); }

// ════════════════════════════════════════════════════════════════════════════
// Grupo D — Audit log + ocultar instructor del cliente
// ════════════════════════════════════════════════════════════════════════════

const AUDIT_REDACTED_KEYS = new Set([
  "password", "newPassword", "oldPassword", "currentPassword",
  "token", "jwt", "refresh_token", "access_token",
  "mp_access_token", "resend_api_key",
]);

function sanitizeAuditPayload(body) {
  if (!body || typeof body !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (AUDIT_REDACTED_KEYS.has(k)) { out[k] = "[REDACTED]"; continue; }
    if (typeof v === "string") {
      if (v.startsWith("data:") && v.length > 200) { out[k] = `[binary ${v.slice(5, 25)}...]`; continue; }
      if (v.length > 500) { out[k] = v.slice(0, 500) + "…"; continue; }
    }
    out[k] = v;
  }
  return out;
}

async function captureAuditLog(entry) {
  if (process.env.AUDIT_ENABLED === "false") return;
  try {
    const u = await pool.query("SELECT email, role FROM users WHERE id = $1", [entry.actorUserId]).catch(() => ({ rows: [] }));
    const actor = u.rows[0] || {};
    await pool.query(
      `INSERT INTO admin_audit_log
        (actor_user_id, actor_email, actor_role, method, path, path_full,
         resource_id, status_code, payload, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
      [entry.actorUserId, actor.email || null, actor.role || null,
       entry.method, entry.path, entry.pathFull, entry.resourceId,
       entry.statusCode, JSON.stringify(entry.body || {}), entry.ip, entry.userAgent]
    );
  } catch (err) {
    console.error("[audit-log] insert failed:", err.message);
  }
}

// Middleware no-bloqueante que captura mutaciones admin (POST/PUT/PATCH/DELETE)
// y las loguea cuando la respuesta termina.
function adminAuditMiddleware(req, res, next) {
  const m = req.method?.toUpperCase();
  if (!["POST","PUT","PATCH","DELETE"].includes(m)) return next();
  res.on("finish", () => {
    try {
      if (!req.userId) return;
      const path = req.path || "";
      // Rutas administrativas: /api/admin/* y unas pocas mutaciones de /api/users (CRUD admin).
      const isAdminPath =
        path.startsWith("/api/admin/") ||
        path === "/api/users" ||
        /^\/api\/users\/[^/]+$/.test(path) ||
        /^\/api\/instructors(\/.*)?$/.test(path) ||
        /^\/api\/discount-codes(\/.*)?$/.test(path) ||
        /^\/api\/plans(\/.*)?$/.test(path) ||
        /^\/api\/settings\//.test(path);
      if (!isAdminPath) return;
      captureAuditLog({
        actorUserId: req.userId,
        method: m,
        path: req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : path,
        pathFull: req.originalUrl,
        resourceId: req.params?.id ?? null,
        statusCode: res.statusCode,
        body: sanitizeAuditPayload(req.body),
        ip: req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip,
        userAgent: req.headers["user-agent"] || null,
      }).catch(() => {});
    } catch (_e) {}
  });
  next();
}

// ── Ocultar instructor al cliente ─────────────────────────────────────
// El cliente y los anónimos NO ven el nombre/id/foto del instructor.
// Admin, super_admin, reception, instructor SÍ.
// Cache in-memory de roles por userId. TTL corto para que los cambios de rol
// (poco frecuentes en este sistema) se reflejen sin tener que reiniciar.
// Evita un SELECT role FROM users por cada request a /api/classes y similares.
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const roleCache = new Map(); // userId → { role, expiresAt }
function invalidateRoleCache(userId) {
  if (userId) roleCache.delete(String(userId));
}
async function getRoleCached(userId) {
  if (!userId) return null;
  const key = String(userId);
  const cached = roleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.role;
  try {
    const r = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);
    const role = r.rows[0]?.role || "client";
    roleCache.set(key, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
    return role;
  } catch {
    return null;
  }
}

// Soporta endpoints SIN authMiddleware: si req.userId no está pero hay
// Bearer token, lo decodifica al vuelo (mejor que duplicar middleware).
// Usa caché in-memory de rol para evitar un SELECT extra por request.
async function callerCanSeeInstructor(req) {
  if (req._instructorRoleCache !== undefined) return req._instructorRoleCache;
  let userId = req.userId;
  if (!userId) {
    const auth = req.headers?.authorization || "";
    if (auth.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
        // El token se firma con { sub: userId } (jwt.sign en /auth/login).
        // Aceptamos también userId/id por compatibilidad con tokens viejos.
        userId = decoded?.sub || decoded?.userId || decoded?.id || null;
      } catch { /* token inválido o expirado → anónimo */ }
    }
  }
  if (!userId) { req._instructorRoleCache = false; return false; }
  const role = await getRoleCached(userId);
  req._instructorRoleCache = ["admin", "super_admin", "reception", "instructor"].includes(role || "");
  return req._instructorRoleCache;
}

function stripInstructorIfNeeded(row, canSee) {
  if (canSee || !row || typeof row !== "object") return row;
  const cleaned = { ...row };
  for (const k of ["instructor_name", "instructor_id", "instructor_photo_url",
                   "instructor_photo", "instructorPhoto",
                   "instructorName", "instructorId", "instructorPhotoUrl",
                   "instructor", "photo_focus_x", "photo_focus_y", "photoFocusX", "photoFocusY"]) {
    if (k in cleaned) delete cleaned[k];
  }
  return cleaned;
}

// Las fotos de instructora pueden vivir como data-URL base64 en la BD
// (fallback del upload cuando Google Drive no está configurado). Incrustar
// ese base64 en cada fila inflaba /api/classes a ~20MB por semana (25 clases
// × ~800KB de foto), que es lo que hacía que el calendario "no cargara".
// Este fragmento devuelve en su lugar una URL ligera servida por
// GET /api/instructors/:id/photo, versionada con updated_at para que el
// navegador la cachee como inmutable.
const INSTRUCTOR_PHOTO_SQL = `CASE WHEN i.photo_url LIKE 'data:%'
       THEN '/api/instructors/' || i.id || '/photo?v=' || floor(extract(epoch FROM i.updated_at))::bigint
       ELSE i.photo_url END`;

// Sirve un photo_url que puede ser data-URL base64 (lo decodifica y manda
// binario cacheable) o una URL normal (redirect). 404 si no hay foto.
function servePhotoValue(res, value) {
  if (!value) return res.status(404).end();
  if (!value.startsWith("data:")) return res.redirect(value);
  const comma = value.indexOf(",");
  if (comma < 0) return res.status(404).end();
  const mime = value.slice(5, comma).split(";")[0] || "image/jpeg";
  const buf = Buffer.from(value.slice(comma + 1), "base64");
  res.setHeader("Content-Type", mime);
  // Inmutable: la URL cambia (?v=epoch updated_at) cuando se sube otra foto.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  return res.end(buf);
}

function normalizeDiscountType(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "percent" || raw === "percentage" || raw === "%") return "percent";
  if (raw === "fixed" || raw === "amount" || raw === "monto") return "fixed";
  return null;
}

function calculateDiscountAmount(type, value, subtotal) {
  const safeSubtotal = Number(subtotal || 0);
  const safeValue = Number(value || 0);
  if (safeSubtotal <= 0 || safeValue <= 0) return 0;
  const normalized = normalizeDiscountType(type);
  const amount = normalized === "percent"
    ? safeSubtotal * (safeValue / 100)
    : safeValue;
  return Math.max(0, Math.min(amount, safeSubtotal));
}

function normalizeClassCategory(value, fallback = "all") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["pilates", "bienestar", "funcional", "mixto", "all"].includes(raw)) return raw;
  return fallback;
}

function normalizeDiscountChannel(value, fallback = "all") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["all", "membership", "pos", "event"].includes(raw)) return raw;
  return fallback;
}

function isUnlimitedClasses(value) {
  return value === null || value === undefined || Number(value) >= 9999;
}

function isMembershipCategoryCompatible(membershipCategory, classCategory) {
  const memCat = normalizeClassCategory(membershipCategory, "all");
  const clsCat = normalizeClassCategory(classCategory, "all");
  if (clsCat === "all") return true;
  if (memCat === "all" || memCat === "mixto") return true;
  return memCat === clsCat;
}

// ── Clase Muestra (trial) schedule restriction ──────────────────────────────
// Trial plans can only book on specific day+time slots:
//   Monday:   08:20, 19:20
//   Tuesday:  09:30
//   Thursday: 09:30
// VARRE24: sin restricción de horario para la clase de prueba (puede reservarse
// en cualquier clase disponible). Para limitarla, agrega { day, time } aquí.
const TRIAL_ALLOWED_SCHEDULES = [];

function isTrialPlan(membership) {
  const rk = String(membership?.repeat_key ?? "").toLowerCase();
  const name = String(membership?.plan_name ?? "").toLowerCase();
  return rk.startsWith("trial_single_session") || name.includes("muestra");
}

// Auto-expire an active membership that is truly done: credits at 0 AND no
// pending bookings (confirmed/waitlist future classes) linked to it. A
// membership with credits at 0 but 3 future reservations is not expired — the
// client already booked all her classes, the pack is fully allocated.
// Reverse path: if credits come back above 0 (e.g. on-time cancellation) or a
// future booking exists and end_date is still valid, revert to active.
async function syncExhaustedMembershipStatus({ client, membershipId }) {
  try {
    const q = client ?? pool;
    const r = await q.query(
      `SELECT m.status, m.classes_remaining, m.end_date,
              (SELECT COUNT(*) FROM bookings b
                 JOIN classes c ON c.id = b.class_id
                WHERE b.membership_id = m.id
                  AND b.status IN ('confirmed','waitlist')
                  AND c.date >= CURRENT_DATE
              )::int AS pending_bookings
         FROM memberships m
        WHERE m.id = $1`,
      [membershipId]
    );
    if (!r.rows.length) return;
    const m = r.rows[0];
    const rem = m.classes_remaining;
    const isUnlimited = rem === null || Number(rem) >= 9999;
    const isExhausted = !isUnlimited && Number(rem) <= 0;
    const hasPending = Number(m.pending_bookings) > 0;
    // "Hoy" en hora de México, no UTC (el server corre en UTC).
    const mxToday = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    mxToday.setHours(0, 0, 0, 0);
    const endOk = !m.end_date || new Date(m.end_date) >= mxToday;
    if (m.status === "active" && isExhausted && !hasPending) {
      await q.query(`UPDATE memberships SET status = 'expired', updated_at = NOW() WHERE id = $1`, [membershipId]);
    } else if (m.status === "expired" && endOk && (!isExhausted || hasPending)) {
      await q.query(`UPDATE memberships SET status = 'active', updated_at = NOW() WHERE id = $1`, [membershipId]);
    }
  } catch (err) {
    console.error("[syncExhaustedMembershipStatus]", err.message);
  }
}

// Audit-log any change to memberships.classes_remaining. Never throws — logging
// failure must not break the caller. Caller passes the locked membership id and
// the final new value; we read old value via the same transaction client so the
// reading sees the pre-change state.
async function logCreditChange({
  client,
  membershipId,
  oldValue,
  newValue,
  reason,
  actorUserId = null,
  bookingId = null,
  notes = null,
}) {
  try {
    const q = client ?? pool;
    const delta = (newValue ?? 0) - (oldValue ?? 0);
    await q.query(
      `INSERT INTO membership_credit_log
         (membership_id, old_value, new_value, delta, reason, actor_user_id, booking_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [membershipId, oldValue, newValue, delta, reason, actorUserId, bookingId, notes]
    );
  } catch (err) {
    console.error("[credit-log] insert failed:", err.message);
  }
}

function isClassAllowedForTrial(classDate, classStartTime) {
  // Sin restricciones configuradas → la clase de prueba puede reservarse en
  // cualquier clase disponible.
  if (!TRIAL_ALLOWED_SCHEDULES.length) return true;
  const d = new Date(classDate);
  // getUTCDay: 0=Sun, 1=Mon ... 6=Sat
  const dayOfWeek = d.getUTCDay();
  const timeStr = String(classStartTime ?? "").slice(0, 5); // "HH:MM"
  return TRIAL_ALLOWED_SCHEDULES.some((s) => s.day === dayOfWeek && s.time === timeStr);
}

// Elige la mejor membresía para una clase. `classDate` (YYYY-MM-DD) es CLAVE:
// la membresía debe cubrir la FECHA DE LA CLASE (end_date >= classDate), no solo
// estar vigente hoy. Sin esto, una alumna que renovó (2 membresías activas: la
// vieja que vence pronto + la nueva) reservaba con la vieja y se bloqueaban las
// clases posteriores al vencimiento de esa, aunque la renovación sí las cubriera.
// Entre las que cubren la fecha, se prefiere la que vence ANTES (consumir primero
// la que caduca). Si no se pasa classDate, se usa "hoy" en hora de México.
async function selectMembershipForClass({ userId, classCategory, classDate = null, client = null }) {
  if (!userId) return null;
  const q = client ?? pool;
  const clsCat = normalizeClassCategory(classCategory, "all");
  const r = await q.query(
    `SELECT m.id,
            m.user_id,
            m.classes_remaining,
            m.end_date,
            m.created_at,
            COALESCE(p.class_category, 'all') AS class_category,
            p.repeat_key,
            p.name AS plan_name
       FROM memberships m
       LEFT JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        -- La membresía debe seguir vigente PARA LA FECHA DE LA CLASE (inclusive).
        -- Si no se da classDate, se evalúa contra hoy (hora de México).
        AND (m.end_date IS NULL OR m.end_date >= COALESCE($3::date, (NOW() AT TIME ZONE 'America/Mexico_City')::date))
        AND (
          COALESCE(p.class_category, 'all') IN ('all', 'mixto')
          OR COALESCE(p.class_category, 'all') = $2
        )
        AND (
          m.classes_remaining IS NULL
          OR m.classes_remaining >= 9999
          OR m.classes_remaining > 0
        )
      ORDER BY
        CASE
          WHEN COALESCE(p.class_category, 'all') = $2 THEN 0
          WHEN COALESCE(p.class_category, 'all') = 'mixto' THEN 1
          WHEN COALESCE(p.class_category, 'all') = 'all' THEN 2
          ELSE 3
        END ASC,
        CASE WHEN m.end_date IS NULL THEN 1 ELSE 0 END ASC,
        m.end_date ASC,
        CASE WHEN m.classes_remaining IS NULL OR m.classes_remaining >= 9999 THEN 1 ELSE 0 END ASC,
        m.created_at ASC
      LIMIT 1`,
    [userId, clsCat, classDate]
  );
  return r.rows[0] ?? null;
}

async function findApplicableDiscountCode({
  code,
  subtotal,
  planId = null,
  classCategory = "all",
  channel = "all",
  client = null,
}) {
  if (!code) return null;
  const q = client ?? pool;
  const normalizedCode = String(code).toUpperCase().trim();
  const normalizedChannel = normalizeDiscountChannel(channel, "all");
  const normalizedCategory = normalizeClassCategory(classCategory, "all");
  const r = await q.query(
    `SELECT *
       FROM discount_codes
      WHERE code = $1
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (max_uses IS NULL OR uses_count < max_uses)
        AND (channel = 'all' OR channel = $2)
        AND (plan_id IS NULL OR plan_id = $3)
        AND (
          class_category IS NULL
          OR class_category = 'all'
          OR class_category = $4
          OR (class_category = 'mixto' AND $4 IN ('pilates','bienestar','funcional'))
        )
      ORDER BY
        CASE WHEN plan_id IS NULL THEN 1 ELSE 0 END ASC,
        CASE WHEN class_category IS NULL OR class_category = 'all' THEN 1 ELSE 0 END ASC
      LIMIT 1`,
    [normalizedCode, normalizedChannel, planId, normalizedCategory]
  );
  if (!r.rows.length) return null;
  const dc = r.rows[0];
  const safeSubtotal = Number(subtotal || 0);
  const minOrderAmount = Number(dc.min_order_amount || 0);
  if (safeSubtotal < minOrderAmount) {
    return {
      code: dc,
      discountAmount: 0,
      minOrderAmount,
      rejectedByMinOrder: true,
    };
  }
  const discountAmount = calculateDiscountAmount(dc.discount_type, dc.discount_value, safeSubtotal);
  return {
    code: dc,
    discountAmount,
    minOrderAmount,
    rejectedByMinOrder: false,
  };
}

async function incrementDiscountUsage(discountId, client = null) {
  if (!discountId) return null;
  const q = client ?? pool;
  const r = await q.query(
    `UPDATE discount_codes
        SET uses_count = uses_count + 1,
            updated_at = NOW()
      WHERE id = $1
        AND (max_uses IS NULL OR uses_count < max_uses)
    RETURNING id, uses_count, max_uses`,
    [discountId]
  );
  if (!r.rows.length) {
    const usageErr = new Error("El código de descuento alcanzó su límite de usos");
    usageErr.status = 409;
    throw usageErr;
  }
  return r.rows[0];
}

function buildEventPassCode(eventId, userId) {
  const eventPart = String(eventId || "").replace(/-/g, "").slice(0, 6).toUpperCase();
  const userPart = String(userId || "").replace(/-/g, "").slice(-4).toUpperCase();
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `EV-${eventPart}-${userPart}-${randomPart}`;
}

async function ensureEventPassForRegistration({ eventId, registrationId, userId, client = null }) {
  if (!eventId || !registrationId || !userId) return null;
  const q = client ?? pool;

  const existing = await q.query(
    "SELECT * FROM event_passes WHERE registration_id = $1 LIMIT 1",
    [registrationId]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.status === "issued") return row;
    const updated = await q.query(
      `UPDATE event_passes
          SET event_id = $1,
              user_id = $2,
              status = 'issued',
              issued_at = NOW(),
              used_at = NULL,
              cancelled_at = NULL,
              updated_at = NOW()
        WHERE id = $3
      RETURNING *`,
      [eventId, userId, row.id]
    );
    return updated.rows[0] ?? row;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const passCode = buildEventPassCode(eventId, userId);
    try {
      const inserted = await q.query(
        `INSERT INTO event_passes (event_id, registration_id, user_id, pass_code, status, issued_at)
         VALUES ($1, $2, $3, $4, 'issued', NOW())
         RETURNING *`,
        [eventId, registrationId, userId, passCode]
      );
      return inserted.rows[0] ?? null;
    } catch (err) {
      if (err?.code !== "23505") throw err;
    }
  }

  throw new Error("No se pudo generar un pase único para el evento");
}

async function cancelEventPassByRegistration({ registrationId, client = null }) {
  if (!registrationId) return null;
  const q = client ?? pool;
  const r = await q.query(
    `UPDATE event_passes
        SET status = 'cancelled',
            cancelled_at = NOW(),
            updated_at = NOW()
      WHERE registration_id = $1
        AND status <> 'cancelled'
    RETURNING *`,
    [registrationId]
  );
  return r.rows[0] ?? null;
}

async function markEventPassUsedByRegistration({ registrationId, client = null }) {
  if (!registrationId) return null;
  const q = client ?? pool;
  const r = await q.query(
    `UPDATE event_passes
        SET status = 'used',
            used_at = NOW(),
            updated_at = NOW()
      WHERE registration_id = $1
        AND status = 'issued'
    RETURNING *`,
    [registrationId]
  );
  return r.rows[0] ?? null;
}

function normalizePosItems(items) {
  const qtyByProduct = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const productId = String(raw?.productId ?? "").trim();
    const qty = Number(raw?.qty ?? 0);
    if (!productId || !Number.isFinite(qty) || qty <= 0) continue;
    qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + Math.floor(qty));
  }
  return Array.from(qtyByProduct.entries()).map(([productId, qty]) => ({ productId, qty }));
}

async function processPosSale({ userId, items, paymentMethod = "efectivo", discountCode = null }) {
  const normalizedItems = normalizePosItems(items);
  if (!normalizedItems.length) {
    return { error: { status: 400, message: "Se requieren artículos válidos" } };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productIds = normalizedItems.map((item) => item.productId);
    const productsRes = await client.query(
      "SELECT * FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE",
      [productIds]
    );
    const productsById = new Map(productsRes.rows.map((p) => [p.id, p]));
    if (productsById.size !== productIds.length) {
      const missing = productIds.find((id) => !productsById.has(id));
      await client.query("ROLLBACK");
      return { error: { status: 404, message: `Producto ${missing} no encontrado` } };
    }

    let subtotal = 0;
    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      if (Number(product.stock) < item.qty) {
        await client.query("ROLLBACK");
        return { error: { status: 400, message: `Stock insuficiente para ${product.name}` } };
      }
      subtotal += Number(product.price) * item.qty;
    }

    let discountAmount = 0;
    let discountCodeRow = null;
    if (discountCode) {
      const discount = await findApplicableDiscountCode({
        code: discountCode,
        subtotal,
        channel: "pos",
        classCategory: "all",
        client,
      });
      if (!discount) {
        await client.query("ROLLBACK");
        return { error: { status: 400, message: "Código de descuento no válido para POS" } };
      }
      if (discount.rejectedByMinOrder) {
        await client.query("ROLLBACK");
        return {
          error: {
            status: 400,
            message: `Compra mínima requerida: $${Number(discount.minOrderAmount || 0).toFixed(2)} MXN`,
          },
        };
      }
      discountAmount = discount.discountAmount;
      discountCodeRow = discount.code;
    }

    const total = Math.max(0, subtotal - discountAmount);
    const orderRes = await client.query(
      `INSERT INTO orders (
         user_id, subtotal, tax_amount, total_amount, payment_method,
         status, discount_amount, discount_code_id, channel
       )
       VALUES ($1,$2,0,$3,$4::payment_method,'approved'::order_status,$5,$6,'pos')
       RETURNING *`,
      [userId || null, subtotal, total, paymentMethod, discountAmount, discountCodeRow?.id ?? null]
    );
    const order = orderRes.rows[0];

    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)",
        [order.id, item.productId, item.qty, product.price]
      );
      const stockUpdate = await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1",
        [item.qty, item.productId]
      );
      if (stockUpdate.rowCount === 0) {
        const stockErr = new Error(`Stock insuficiente para ${product.name}`);
        stockErr.status = 400;
        throw stockErr;
      }
    }

    if (discountCodeRow?.id) {
      await incrementDiscountUsage(discountCodeRow.id, client);
    }

    if (userId && total > 0) {
      const cfgRes = await client.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
      const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
      const pts = Math.floor(total * (cfg.points_per_peso ?? 1));
      if (cfg.enabled !== false && pts > 0) {
        await client.query(
          "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
          [userId, pts, `Venta POS — $${total}`]
        );
      }
    }

    await client.query("COMMIT");
    if (userId) {
      triggerWalletPassSync(userId, "pos_sale_approved");
    }
    return { data: order };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    throw err;
  } finally {
    client.release();
  }
}

async function awardBirthdayBonusIfEligible(userId, client = null) {
  if (!userId) return null;
  const q = client ?? pool;
  const userRes = await q.query(
    "SELECT date_of_birth FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const dob = userRes.rows[0]?.date_of_birth;
  if (!dob) return null;

  const today = new Date();
  const birth = new Date(dob);
  const isBirthdayToday =
    birth.getUTCDate() === today.getUTCDate() &&
    birth.getUTCMonth() === today.getUTCMonth();
  if (!isBirthdayToday) return null;

  const cfgRes = await q.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
  const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
  const points = Number(cfg.birthday_bonus ?? 0);
  if (cfg.enabled === false || points <= 0) return null;

  const year = today.getUTCFullYear();
  const desc = `Bono de cumpleaños ${year}`;
  const exists = await q.query(
    "SELECT id FROM loyalty_transactions WHERE user_id = $1 AND description = $2 LIMIT 1",
    [userId, desc]
  );
  if (exists.rows.length) return null;

  const inserted = await q.query(
    "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3) RETURNING *",
    [userId, points, desc]
  );
  return inserted.rows[0] ?? null;
}

const NON_REPEATABLE_ORDER_BLOCK_STATUSES = ["pending_payment", "pending_verification", "approved"];

function parseBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return ["true", "1", "yes", "si", "sí", "t"].includes(v);
  }
  return false;
}

function getPlanRepeatKey(plan) {
  const raw = plan?.repeat_key ?? plan?.repeatKey;
  if (raw === null || raw === undefined) return null;
  const key = String(raw).trim();
  return key || null;
}

function getPlanFlags(plan) {
  return {
    isNonTransferable: parseBooleanFlag(plan?.is_non_transferable ?? plan?.isNonTransferable),
    isNonRepeatable: parseBooleanFlag(plan?.is_non_repeatable ?? plan?.isNonRepeatable),
    repeatKey: getPlanRepeatKey(plan),
  };
}

async function findNonRepeatablePlanConflict({
  userId,
  plan,
  excludeOrderId = null,
  client = null,
}) {
  if (!userId || !plan?.id) return null;
  const { isNonRepeatable, repeatKey } = getPlanFlags(plan);
  if (!isNonRepeatable) return null;

  const q = client ?? pool;
  const key = repeatKey || `plan:${plan.id}`;

  const memConflict = await q.query(
    `SELECT m.id, m.status, p.name AS plan_name
       FROM memberships m
       LEFT JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1
        AND (
          m.plan_id = $2
          OR (COALESCE(p.repeat_key, '') <> '' AND p.repeat_key = $3)
        )
      ORDER BY m.created_at DESC
      LIMIT 1`,
    [userId, plan.id, key]
  );
  if (memConflict.rows.length) {
    return {
      source: "membership",
      message: `La "${plan.name}" es de un solo uso, no transferible y no se puede repetir.`,
      detail: memConflict.rows[0],
    };
  }

  const params = [userId, plan.id, key, NON_REPEATABLE_ORDER_BLOCK_STATUSES];
  let orderSql = `
    SELECT o.id, o.status, p.name AS plan_name
      FROM orders o
      JOIN plans p ON p.id = o.plan_id
     WHERE o.user_id = $1
       AND (
         o.plan_id = $2
         OR (COALESCE(p.repeat_key, '') <> '' AND p.repeat_key = $3)
       )
       AND o.status = ANY($4::order_status[])
  `;
  if (excludeOrderId) {
    params.push(excludeOrderId);
    orderSql += ` AND o.id <> $${params.length}`;
  }
  orderSql += " ORDER BY o.created_at DESC LIMIT 1";

  const orderConflict = await q.query(orderSql, params);
  if (orderConflict.rows.length) {
    const status = orderConflict.rows[0].status;
    if (status === "pending_payment" || status === "pending_verification") {
      return {
        source: "order",
        message: "Ya tienes una sesión muestra en proceso. No puede repetirse.",
        detail: orderConflict.rows[0],
      };
    }
    return {
      source: "order",
      message: `La "${plan.name}" ya fue utilizada y no se puede repetir.`,
      detail: orderConflict.rows[0],
    };
  }

  return null;
}

function serializeSpecialtiesForDb(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v).trim()).filter(Boolean);
    return items.length ? JSON.stringify(items) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Already JSON string? keep as-is if parseable.
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try {
        JSON.parse(trimmed);
        return trimmed;
      } catch (_) {
        // fall through and normalize as csv list
      }
    }
    const items = trimmed.split(",").map((v) => v.trim()).filter(Boolean);
    return JSON.stringify(items);
  }
  return JSON.stringify(value);
}

function normalizeQrDataUrl(raw) {
  if (!raw) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

function pickEvolutionQrPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  // Evolution often returns both "code" and "base64".
  // "code" is not always an image payload, so prefer explicit base64/image fields.
  const candidates = [
    payload?.base64,
    payload?.qrcode?.base64,
    payload?.qrCode?.base64,
    payload?.qr?.base64,
    payload?.instance?.qrcode?.base64,
    payload?.instance?.qrCode?.base64,
    payload?.instance?.qr?.base64,
    payload?.code,
    payload?.qrcode?.code,
    payload?.qrCode?.code,
    payload?.qr?.code,
  ];

  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:image/")) return trimmed;
    // Raw base64 image strings should not include separators like comma + '@'
    // seen in non-image "code" values.
    const looksLikeRawBase64Image =
      !trimmed.includes(",") &&
      !trimmed.includes("@") &&
      /^[A-Za-z0-9+/=]+$/.test(trimmed) &&
      trimmed.length > 120;
    if (looksLikeRawBase64Image) return trimmed;
  }
  return null;
}

// ─── Auth helpers ────────────────────────────────────────────────────────────
function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

function normalizeEmailAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function isStrongPassword(password) {
  const candidate = String(password || "");
  return candidate.length >= 8 && /[A-Z]/.test(candidate) && /[0-9]/.test(candidate);
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "No autorizado" });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
}

async function adminMiddleware(req, res, next) {
  authMiddleware(req, res, async () => {
    try {
      // Usa caché de rol (TTL 5 min) para evitar SELECT por cada request admin.
      const role = await getRoleCached(req.userId);
      if (!role || !["admin", "super_admin", "instructor", "reception"].includes(role)) {
        return res.status(403).json({ message: "Acceso restringido" });
      }
      next();
    } catch { return res.status(500).json({ message: "Error interno" }); }
  });
}

function mapUser(u) {
  return {
    id: u.id,
    displayName: u.display_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    gender: u.gender ?? null,
    photoUrl: u.photo_url ?? null,
    dateOfBirth: u.date_of_birth ?? null,
    emergencyContactName: u.emergency_contact_name ?? null,
    emergencyContactPhone: u.emergency_contact_phone ?? null,
    healthNotes: u.health_notes ?? null,
    receiveReminders: u.receive_reminders ?? true,
    receivePromotions: u.receive_promotions ?? false,
    receiveWeeklySummary: u.receive_weekly_summary ?? false,
    createdAt: u.created_at,
  };
}

// ─── Routes: /api/auth ───────────────────────────────────────────────────────

// POST /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  const { email, password, displayName, phone, gender, dateOfBirth, acceptsTerms, acceptsCommunications } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ message: "Nombre, email y contraseña son requeridos" });
  }
  try {
    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ message: "Este email ya está registrado" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const dob = dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? dateOfBirth : null;
    const result = await pool.query(
      `INSERT INTO users (display_name, email, phone, gender, date_of_birth, password_hash, accepts_terms, accepts_communications, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'client')
       RETURNING *`,
      [displayName.trim(), email.toLowerCase().trim(), normalizePhoneForStorage(phone), gender || null, dob, passwordHash, acceptsTerms ?? false, acceptsCommunications ?? false]
    );
    const user = result.rows[0];
    // Award welcome bonus loyalty points
    try {
      const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
      const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
      const pts = cfg.welcome_bonus ?? 50;
      if (cfg.enabled !== false && pts > 0) {
        await pool.query(
          "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, 'Bono de bienvenida')",
          [user.id, pts]
        );
      }
    } catch (e) { /* loyalty earn error shouldn't fail register */ }
    const token = signToken(user.id);
    return res.status(201).json({ user: mapUser(user), token });
  } catch (err) {
    // Doble-submit o dos registros simultáneos con el mismo email: la
    // verificación previa no es atómica y el INSERT choca con UNIQUE(email).
    // Devolver 409 claro en vez de "Error interno".
    if (err && err.code === "23505") {
      return res.status(409).json({ message: "Este email ya está registrado" });
    }
    console.error("Register error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email y contraseña requeridos" });
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (result.rows.length === 0) return res.status(401).json({ message: "Credenciales incorrectas" });
    const user = result.rows[0];
    if (!user.password_hash) return res.status(401).json({ message: "Credenciales incorrectas" });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Credenciales incorrectas" });
    try {
      await awardBirthdayBonusIfEligible(user.id);
    } catch (bonusErr) {
      console.error("[Loyalty] birthday bonus login:", bonusErr?.message || bonusErr);
    }
    const token = signToken(user.id);
    return res.json({ user: mapUser(user), token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /api/auth/me
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ user: mapUser(result.rows[0]) });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /api/auth/forgot-password
app.post("/api/auth/forgot-password", async (req, res) => {
  const email = normalizeEmailAddress(req.body?.email);
  if (!email) return res.status(400).json({ message: "Email es requerido" });

  try {
    const user = await pool.query("SELECT id, display_name FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      // Return 200 to prevent user enumeration
      return res.json({ message: "Si el correo existe, recibirás un enlace de recuperación." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    // Expiration set to 2 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 2);

    // Invalidate older active reset links before creating a new one.
    await pool.query(
      `UPDATE password_reset_tokens
       SET used = true
       WHERE user_id = $1 AND used = false`,
      [user.rows[0].id],
    );
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.rows[0].id, token, expiresAt]
    );

    await sendPasswordResetEmail({
      to: email,
      name: user.rows[0].display_name || "Clienta",
      token,
      resetUrl: `${APP_PUBLIC_URL}/auth/reset-password?token=${encodeURIComponent(token)}`,
    });

    return res.json({ message: "Si el correo existe, recibirás un enlace de recuperación." });
  } catch (err) {
    console.error("Auth /forgot-password error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /api/auth/reset-password
app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");
  if (!token || !password) return res.status(400).json({ message: "Datos incompletos" });
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres, una mayúscula y un número." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Check token validity
    const t = await client.query(
      `SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token = $1 FOR UPDATE`,
      [token]
    );
    if (t.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El enlace es inválido o ha expirado." });
    }

    const dbToken = t.rows[0];
    if (dbToken.used) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este enlace ya fue utilizado. Solicita uno nuevo." });
    }
    if (new Date() > new Date(dbToken.expires_at)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este enlace ha expirado." });
    }

    // Hash new password and update
    const hash = await bcrypt.hash(password, 12);
    const userUpdate = await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, dbToken.user_id]);
    if (!userUpdate.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El enlace es inválido o ha expirado." });
    }

    // Mark current and any still-active tokens as used for this user.
    await client.query(
      `UPDATE password_reset_tokens
       SET used = true
       WHERE user_id = $1 AND used = false`,
      [dbToken.user_id],
    );

    await client.query("COMMIT");

    return res.json({ message: "Contraseña restablecida con éxito." });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("Auth /reset-password error:", err);
    return res.status(500).json({ message: "Error al actualizar la contraseña." });
  } finally {
    client.release();
  }
});

// POST /api/auth/change-password — cambio de contraseña autenticado
// Requiere currentPassword (para confirmar identidad) + newPassword.
app.post("/api/auth/change-password", authMiddleware, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Datos incompletos" });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres, una mayúscula y un número." });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: "La contraseña nueva debe ser distinta de la actual." });
  }
  try {
    const u = await pool.query("SELECT id, password_hash FROM users WHERE id = $1", [req.userId]);
    if (!u.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const ok = await bcrypt.compare(currentPassword, u.rows[0].password_hash || "");
    if (!ok) return res.status(403).json({ message: "La contraseña actual no es correcta." });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, req.userId]);
    // Invalidar tokens de reset pendientes (por seguridad)
    await pool.query("UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false", [req.userId]).catch(()=>{});
    return res.json({ ok: true, message: "Contraseña actualizada." });
  } catch (err) {
    console.error("/auth/change-password error:", err);
    return res.status(500).json({ message: "Error al cambiar la contraseña." });
  }
});

// ─── Routes: /api/plans ─────────────────────────────────────────────────────

// GET /api/plans
app.get("/api/plans", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM plans WHERE is_active = true ORDER BY sort_order ASC, price ASC"
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("Plans error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/complements & combo-pricing ──────────────────────────────

// GET /api/complements — public, returns active complements
app.get("/api/complements", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM complements WHERE is_active = true ORDER BY sort_order ASC"
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    // Table may not exist yet — return empty array instead of 500
    if (err.code === "42P01") return res.json({ data: [] });
    console.error("Complements error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/combo-pricing — public, returns combo price tiers
app.get("/api/combo-pricing", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM combo_pricing WHERE is_active = true ORDER BY class_count ASC"
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    // Table may not exist yet — return empty array instead of 500
    if (err.code === "42P01") return res.json({ data: [] });
    console.error("Combo pricing error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/memberships ───────────────────────────────────────────────

// GET /api/memberships/my
app.get("/api/memberships/my", authMiddleware, async (req, res) => {
  try {
    // Ensure optional columns exist (idempotent, safe to run on every request)
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS plan_name_override VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS class_limit_override INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancellations_used INTEGER NOT NULL DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS order_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_category VARCHAR(20) DEFAULT 'all'`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_limit INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 30`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb`).catch(() => { });

    const r = await pool.query(
      `SELECT m.id, m.user_id, m.plan_id, m.status, m.start_date, m.end_date,
              m.classes_remaining, m.payment_method, m.created_at, m.updated_at,
              m.order_id, m.cancellations_used,
              COALESCE(m.plan_name_override, '') AS plan_name_override,
              m.class_limit_override,
              COALESCE(p.name, m.plan_name_override, 'Membresía') AS plan_name,
              COALESCE(p.class_limit, m.class_limit_override)      AS class_limit,
              COALESCE(p.duration_days, 30)                        AS duration_days,
              p.features,
              COALESCE(p.class_category, 'all')                    AS class_category,
              p.repeat_key
       FROM memberships m
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1
         AND m.status IN ('active', 'pending_activation', 'pending_payment')
       ORDER BY CASE m.status
         WHEN 'active'              THEN 1
         WHEN 'pending_activation'  THEN 2
         WHEN 'pending_payment'     THEN 3
         ELSE 4 END,
         CASE
           WHEN m.status = 'active'
            AND m.classes_remaining IS NOT NULL
            AND m.classes_remaining < 9999
            AND m.classes_remaining <= 0 THEN 1
           ELSE 0
         END ASC,
         CASE
           WHEN m.status = 'active' AND (m.classes_remaining IS NULL OR m.classes_remaining >= 9999) THEN 1
           ELSE 0
         END ASC,
         CASE
           WHEN m.status = 'active' AND m.end_date IS NULL THEN 1
           ELSE 0
         END ASC,
         m.end_date ASC NULLS LAST,
         m.created_at DESC
       LIMIT 1`,
      [req.userId]
    );
    if (!r.rows[0]) return res.json({ data: null });
    const row = camelRows([r.rows[0]])[0];
    // Treat 9999 or very large numbers as unlimited (null)
    if (row.classesRemaining >= 9999) row.classesRemaining = null;
    if (row.classLimit >= 9999) row.classLimit = null;
    return res.json({ data: row });
  } catch (err) {
    console.error("Memberships/my error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Public: horario base semanal (schedule_slots) ──────────────────────────
// Para la landing ("Horarios"): el horario recurrente que el studio edita en el
// admin. No requiere auth ni clases generadas; muestra el horario base.
app.get("/api/public/schedule-slots", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT day_of_week, time_slot, class_type_name, instructor_name, COALESCE(capacity, 7) AS capacity
         FROM schedule_slots
        WHERE is_active = true
        ORDER BY day_of_week`
    );
    res.json({ data: rows });
  } catch (err) {
    console.error("GET public/schedule-slots error:", err);
    res.status(500).json({ message: "Error al obtener horarios" });
  }
});

// ─── Routes: /api/classes ───────────────────────────────────────────────────

// GET /api/classes?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/api/classes", async (req, res) => {
  try {
    const { start, end, limit } = req.query;
    // current_bookings se calcula con un LEFT JOIN a un agregado de bookings
    // (una sola pasada) en vez de un subquery correlacionado por fila.
    let query = `
      SELECT c.*,
             c.max_capacity                         AS capacity,
             COALESCE(bc.cnt, 0)::int               AS current_bookings,
             (c.date || 'T' || c.start_time)        AS start_time_full,
             (c.date || 'T' || c.end_time)          AS end_time_full,
             ct.name  AS class_type_name,
             ct.color AS class_type_color,
             ct.icon  AS class_type_icon,
             ct.level AS class_type_level,
             i.display_name AS instructor_name,
             ${INSTRUCTOR_PHOTO_SQL} AS instructor_photo,
             f.name         AS facility_name
      FROM classes c
      JOIN class_types ct   ON c.class_type_id  = ct.id
      JOIN instructors i    ON c.instructor_id   = i.id
      LEFT JOIN facilities f ON c.facility_id    = f.id
      LEFT JOIN (
        -- Cada reserva ocupa 1 lugar. Solo cuenta como 2 cuando es una ALUMNA
        -- (user_id presente) que lleva invitada. Un walk-in ("Bloquear lugar")
        -- tiene guest_name pero user_id NULL y es UNA sola persona → 1 lugar.
        -- Antes contaba cualquier guest_name como 2, inflando el cupo de las
        -- clases con walk-in (se veían 7/7 con solo 6 nombres en la lista).
        SELECT class_id,
               SUM(CASE WHEN user_id IS NOT NULL AND guest_name IS NOT NULL AND guest_name <> '' THEN 2 ELSE 1 END)::int AS cnt
          FROM bookings
         WHERE status IN ('confirmed','checked_in')
         GROUP BY class_id
      ) bc ON bc.class_id = c.id
      WHERE c.status != 'cancelled'
    `;
    const params = [];
    if (start) { params.push(start); query += ` AND c.date >= $${params.length}`; }
    if (end) { params.push(end); query += ` AND c.date <= $${params.length}`; }
    query += " ORDER BY c.date ASC, c.start_time ASC";
    if (limit) { params.push(parseInt(limit)); query += ` LIMIT $${params.length}`; }
    const __t0 = Date.now();
    const r = await pool.query(query, params);
    const __t1 = Date.now();
    const canSee = await callerCanSeeInstructor(req);
    const __t2 = Date.now();
    console.log(`[perf /api/classes] rows=${r.rows.length} query=${__t1 - __t0}ms canSee=${__t2 - __t1}ms`);
    // Normalise: expose start_time / end_time as full ISO strings for front-end consumers
    const rows = r.rows.map((row) => {
      const enriched = {
        ...row,
        date: row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : (typeof row.date === "string" ? row.date.slice(0, 10) : row.date),
        start_time: row.start_time_full ?? row.start_time,
        end_time: row.end_time_full ?? row.end_time,
      };
      return stripInstructorIfNeeded(enriched, canSee);
    });
    console.log(`[perf /api/classes] map=${Date.now() - __t2}ms total=${Date.now() - __t0}ms`);
    // micro-cache HTTP: 15s. Permite que la navegación atrás/adelante o
    // refresh inmediato sirva desde cache del navegador en vez de pegarle
    // al servidor. El admin tarda más que esto en editar y volver, y el
    // cliente además tiene refetchOnWindowFocus.
    res.setHeader("Cache-Control", "private, max-age=15");
    return res.json({ data: rows });
  } catch (err) {
    console.error("Classes error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/classes/:id
app.get("/api/classes/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.*,
              (c.date || 'T' || c.start_time) AS start_time,
              (c.date || 'T' || c.end_time)   AS end_time,
              ct.name  AS class_type_name,
              ct.color AS class_type_color,
              ct.icon  AS class_type_icon,
              ct.level AS class_type_level,
              i.display_name AS instructor_name,
              ${INSTRUCTOR_PHOTO_SQL} AS instructor_photo,
              i.bio          AS instructor_bio,
              f.name         AS facility_name
       FROM classes c
       JOIN class_types ct   ON c.class_type_id  = ct.id
       JOIN instructors i    ON c.instructor_id   = i.id
       LEFT JOIN facilities f ON c.facility_id    = f.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Clase no encontrada" });
    const canSee = await callerCanSeeInstructor(req);
    const row = stripInstructorIfNeeded(r.rows[0], canSee);
    // También ocultar instructor_bio si no puede verlo (no está en el helper genérico)
    if (!canSee) delete row.instructor_bio;
    return res.json({ data: row });
  } catch (err) {
    console.error("Class/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/bookings ──────────────────────────────────────────────────

// GET /api/bookings/my-bookings
app.get("/api/bookings/my-bookings", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*,
              c.date,
              (c.date || 'T' || c.start_time) AS start_time,
              (c.date || 'T' || c.end_time)   AS end_time,
              c.status AS class_status,
              ct.name  AS class_type_name,
              ct.color AS class_color,
              i.display_name AS instructor_name,
              ${INSTRUCTOR_PHOTO_SQL} AS instructor_photo,
              EXISTS(
                SELECT 1
                FROM reviews rv
                WHERE rv.booking_id = b.id
              ) AS has_review,
              f.name         AS facility_name
       FROM bookings b
       JOIN classes c       ON b.class_id       = c.id
       JOIN class_types ct  ON c.class_type_id  = ct.id
       JOIN instructors i   ON c.instructor_id  = i.id
       LEFT JOIN facilities f ON c.facility_id  = f.id
       WHERE b.user_id = $1
       ORDER BY c.date DESC, c.start_time DESC`,
      [req.userId]
    );
    const canSee = await callerCanSeeInstructor(req);
    const rows = r.rows.map((row) => stripInstructorIfNeeded(row, canSee));
    return res.json({ data: rows });
  } catch (err) {
    console.error("Bookings/my error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/bookings
app.post("/api/bookings", authMiddleware, async (req, res) => {
  const { classId } = req.body;
  const guestNameRaw = typeof req.body?.guestName === "string" ? req.body.guestName.trim() : "";
  const guestPhoneRaw = typeof req.body?.guestPhone === "string" ? req.body.guestPhone.trim() : "";
  const hasGuest = guestNameRaw.length > 0;
  const guestName = hasGuest ? guestNameRaw.slice(0, 120) : null;
  const guestPhone = hasGuest && guestPhoneRaw ? guestPhoneRaw.slice(0, 40) : null;
  const slotsNeeded = hasGuest ? 2 : 1;
  const creditsNeeded = hasGuest ? 2 : 1;

  if (!classId) return res.status(400).json({ message: "classId requerido" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock class row to avoid overbooking in concurrent requests
    const classRes = await client.query(
      `SELECT c.id, c.max_capacity, c.current_bookings, c.status, c.date, c.start_time,
              ct.category AS class_category
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE c.id = $1
       FOR UPDATE`,
      [classId]
    );
    if (classRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = classRes.rows[0];
    if (cls.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta clase fue cancelada" });
    }

    const clsCategory = normalizeClassCategory(cls.class_category, "all");
    const toYMD = (d) => {
      if (!d) return null;
      if (typeof d === "string") return d.slice(0, 10);
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      return String(d).slice(0, 10);
    };
    const classDateStr = toYMD(cls.date);
    // Elige una membresía que cubra LA FECHA DE LA CLASE (no solo vigente hoy).
    // Así, si la alumna renovó y tiene 2 activas, usa la que llega a esa fecha.
    const membership = await selectMembershipForClass({
      userId: req.userId,
      classCategory: clsCategory,
      classDate: classDateStr,
      client,
    });
    if (!membership) {
      await client.query("ROLLBACK");
      // ¿Tiene alguna membresía activa con créditos que NO alcanza esta fecha?
      // Entonces el problema es vigencia (renueva), no falta de créditos.
      const cover = await client.query(
        `SELECT MAX(m.end_date) AS max_end
           FROM memberships m LEFT JOIN plans p ON p.id = m.plan_id
          WHERE m.user_id = $1 AND m.status = 'active'
            AND (m.classes_remaining IS NULL OR m.classes_remaining >= 9999 OR m.classes_remaining > 0)
            AND (COALESCE(p.class_category,'all') IN ('all','mixto') OR COALESCE(p.class_category,'all') = $2)`,
        [req.userId, clsCategory]
      );
      const maxEnd = cover.rows[0]?.max_end ? toYMD(cover.rows[0].max_end) : null;
      if (maxEnd && classDateStr && classDateStr > maxEnd) {
        return res.status(403).json({
          code: "CLASS_AFTER_MEMBERSHIP_EXPIRY",
          message: `Esta clase (${classDateStr}) es posterior al vencimiento de tu membresía (${maxEnd}). Renueva tu plan para reservar clases en esa fecha.`,
          classDate: classDateStr,
          membershipEndDate: maxEnd,
        });
      }
      return res.status(403).json({
        message: `No tienes membresía activa con créditos para esta clase.`,
      });
    }

    // Lock selected membership row to prevent double consumption
    const lockedMembershipRes = await client.query(
      "SELECT id, classes_remaining FROM memberships WHERE id = $1 FOR UPDATE",
      [membership.id]
    );
    const lockedMembership = lockedMembershipRes.rows[0];
    if (!lockedMembership) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No se encontró una membresía válida para esta reserva." });
    }

    if (!isMembershipCategoryCompatible(membership.class_category, clsCategory)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: `Tu membresía no incluye este tipo de clase. Necesitas una membresía compatible.`,
      });
    }

    // ── Clase Muestra: restrict to allowed day+time slots ──
    if (isTrialPlan(membership) && !isClassAllowedForTrial(cls.date, cls.start_time)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Tu Clase Muestra solo puede reservarse en los horarios disponibles: Lunes 8:20 AM / 7:20 PM, Martes 9:25 AM, Jueves 9:25 AM.",
      });
    }

    // ── Invitada: NO permitida en Clase Muestra ──
    if (hasGuest && isTrialPlan(membership)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        code: "GUEST_NOT_ALLOWED_IN_TRIAL",
        message: "La Clase Muestra no permite llevar invitada. Toma primero tu clase de prueba.",
      });
    }

    if (!isUnlimitedClasses(lockedMembership.classes_remaining) && Number(lockedMembership.classes_remaining) < creditsNeeded) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        code: hasGuest ? "NOT_ENOUGH_CREDITS_FOR_GUEST" : "NO_CREDITS",
        message: hasGuest
          ? "Necesitas 2 créditos para reservar contigo + tu invitada (1 cada una). Revisa tu paquete o quita la invitada."
          : "Ya no tienes clases disponibles en tu paquete. Renueva o adquiere un nuevo plan.",
      });
    }

    const dupRes = await client.query(
      "SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'",
      [classId, req.userId]
    );
    if (dupRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Ya tienes una reserva para esta clase" });
    }

    // Capacidad: si trae invitada, requiere 2 lugares libres SIN waitlist
    // (no se permite invitada en lista de espera; el modelo es 1 booking
    // principal con guest_name marcado, y cada booking-con-invitada ocupa 2).
    const used = Number(cls.current_bookings) || 0;
    const cap = Number(cls.max_capacity) || 0;
    if (hasGuest && used + 2 > cap) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "NOT_ENOUGH_SPOTS_FOR_GUEST",
        message: "Esta clase solo tiene 1 lugar libre. No alcanza para ti + invitada. Reserva sin invitada o elige otro horario.",
      });
    }
    const isWaitlist = used >= cap; // sin invitada, lista de espera normal
    const status = isWaitlist ? "waitlist" : "confirmed";
    const result = await client.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, status, guest_name, guest_phone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [classId, req.userId, membership.id, status, guestName, guestPhone]
    );

    if (!isWaitlist) {
      await client.query(
        "UPDATE classes SET current_bookings = current_bookings + $1 WHERE id = $2",
        [slotsNeeded, classId]
      );
      if (!isUnlimitedClasses(lockedMembership.classes_remaining)) {
        const oldVal = Number(lockedMembership.classes_remaining);
        const newVal = Math.max(0, oldVal - creditsNeeded);
        await client.query(
          "UPDATE memberships SET classes_remaining = $1, updated_at = NOW() WHERE id = $2",
          [newVal, membership.id]
        );
        await logCreditChange({
          client,
          membershipId: membership.id,
          oldValue: oldVal,
          newValue: newVal,
          reason: hasGuest ? "booking_created_with_guest" : "booking_created",
          actorUserId: req.userId,
          bookingId: result.rows[0].id,
        });
        await syncExhaustedMembershipStatus({ client, membershipId: membership.id });
      }
    }
    await client.query("COMMIT");

    // ── Email: booking confirmed / waitlist ────────────────────────────────
    try {
      const userRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [req.userId]);
      const classFullRes = await pool.query(
        `SELECT c.date, c.start_time, ct.name AS class_type_name,
                i.display_name AS instructor_name
         FROM classes c
         JOIN class_types ct ON c.class_type_id = ct.id
         LEFT JOIN instructors i ON c.instructor_id = i.id
         WHERE c.id = $1`,
        [classId]
      );
      const memAfter = await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id]);
      const classesLeft = memAfter.rows[0]?.classes_remaining ?? null;

      if (userRes.rows[0] && classFullRes.rows[0]) {
        const u = userRes.rows[0];
        const cl = classFullRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendBookingConfirmed({
            to: u.email,
            name: u.display_name || "Alumna",
            className: cl.class_type_name,
            date: cl.date,
            startTime: cl.start_time,
            instructor: cl.instructor_name,
            classesLeft,
            isWaitlist,
          }).catch((e) => console.error("[Email] booking confirmed:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "booking_confirmed",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            class: cl.class_type_name || "Clase",
            date: cl.date ? new Date(cl.date).toLocaleDateString("es-MX") : "",
            time: cl.start_time ? String(cl.start_time).slice(0, 5) : "",
          },
          fallbackMessage: isWaitlist
            ? `Hola ${u.display_name || "Alumna"}, quedaste en lista de espera para ${cl.class_type_name || "tu clase"} (${cl.date || ""} ${String(cl.start_time || "").slice(0, 5)}).`
            : `Hola ${u.display_name || "Alumna"}, tu reserva para ${cl.class_type_name || "tu clase"} (${cl.date || ""} ${String(cl.start_time || "").slice(0, 5)}) está confirmada.`,
        }).catch((e) => console.error("[WA] booking confirmed:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] booking confirmed query error:", emailErr.message);
    }

    const msg = isWaitlist ? "Añadido a lista de espera" : "Reserva confirmada";
    triggerWalletPassSync(req.userId, isWaitlist ? "booking_waitlist_created" : "booking_created");
    return res.status(201).json({ message: msg, booking: result.rows[0] });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("POST bookings error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// GET /api/bookings/cancellation-quota — cuántas cancelaciones gratis le quedan
// en la membresía activa (o en la que se pase por ?membershipId=).
app.get("/api/bookings/cancellation-quota", authMiddleware, async (req, res) => {
  try {
    const membershipId = req.query.membershipId ? String(req.query.membershipId) : null;
    const data = await getCancellationQuota(req.userId, membershipId);
    return res.json({ data });
  } catch (err) {
    console.error("GET cancellation-quota error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/bookings/:id
app.delete("/api/bookings/:id", authMiddleware, async (req, res) => {
  try {
    // Load booking
    const r = await pool.query(
      `SELECT b.*, c.date, c.start_time, ct.name AS class_type_name
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const booking = r.rows[0];

    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Esta reserva ya fue cancelada" });
    }

    // ── Load membership (sin bloquear por contador — el límite ahora es mensual y se evalúa abajo) ──
    let membership = null;
    if (booking.membership_id) {
      const memRes = await pool.query(
        "SELECT id, classes_remaining, plan_id FROM memberships WHERE id = $1",
        [booking.membership_id]
      );
      membership = memRes.rows[0] ?? null;
    }

    // ── Cancellation window (admin-configurable) ──────────────────────────
    const cancellationWindow = await getSettingValueWithDefaults("cancellation_window");
    const cwEnabled = cancellationWindow.enabled !== false;
    const cwMinHours = Math.max(0, Math.min(168, Number(cancellationWindow.min_hours ?? 5)));
    // Cuota por membresía (con fallback a la llave legacy per_month).
    const cwFreePerMembership = Math.max(0, Math.min(99, Number(
      cancellationWindow.free_cancellations_per_membership
        ?? cancellationWindow.free_cancellations_per_month
        ?? 2
    )));
    const cwRefund = cancellationWindow.refund_credit_on_cancel !== false;
    const cwLateMessage = String(cancellationWindow.late_cancel_message || "Esta clase ya no se puede cancelar.");

    if (!cwEnabled) {
      return res.status(403).json({
        code: "CANCELLATIONS_DISABLED",
        message: "Las cancelaciones están desactivadas. Contacta al estudio.",
      });
    }

    // ── Resolve canonical class start in UTC ──────────────────────────────
    const classStartRes = await pool.query(
      `SELECT (c.date + c.start_time::time) AT TIME ZONE 'America/Mexico_City' AS class_start_utc
       FROM classes c WHERE c.id = $1`,
      [booking.class_id]
    );
    const classStartUTC = classStartRes.rows[0]?.class_start_utc
      ? new Date(classStartRes.rows[0].class_start_utc)
      : null;
    if (!classStartUTC) {
      return res.status(500).json({ code: "CLASS_NOT_RESOLVED", message: "No se pudo determinar la hora de la clase." });
    }
    const now = new Date();
    const minutesUntilClass = (classStartUTC.getTime() - now.getTime()) / 60_000;

    if (minutesUntilClass <= 0) {
      return res.status(400).json({
        code: "CLASS_ALREADY_STARTED",
        message: "Esta clase ya inició o terminó. No se puede cancelar.",
      });
    }

    if (minutesUntilClass < cwMinHours * 60) {
      return res.status(400).json({
        code: "CANCELLATION_WINDOW_EXCEEDED",
        message: cwLateMessage,
        minHours: cwMinHours,
      });
    }

    // Within window — calcular cupo POR MEMBRESÍA y decidir si toca refund.
    // Política: primeras N cancelaciones de esta membresía devuelven crédito;
    // a partir de la N+1 se descuenta sin devolver. El contador se calcula al
    // vuelo desde bookings (filtrado por membership_id) — no usa
    // memberships.cancellations_used (columna obsoleta, queda como histórico).
    const quota = await getCancellationQuota(req.userId, booking.membership_id);
    const hasFreeSlot = quota.used < cwFreePerMembership;
    const shouldRefundCredit =
      hasFreeSlot &&
      !!membership &&
      cwRefund &&
      membership.classes_remaining !== null &&
      Number(membership.classes_remaining) < 9999;

    // Cancel the booking (mark as user-initiated)
    await pool.query(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'user' WHERE id = $1",
      [req.params.id]
    );

    if (booking.status === "confirmed") {
      // Una reserva con invitada ocupa 2 lugares y consumió 2 créditos.
      const slotsHeld = booking.guest_name ? 2 : 1;
      // Always free the class spot — incluso si no devolvemos crédito,
      // el cupo queda libre para waitlist.
      await pool.query(
        "UPDATE classes SET current_bookings = GREATEST(current_bookings - $1, 0) WHERE id = $2",
        [slotsHeld, booking.class_id]
      );

      if (shouldRefundCredit) {
        const oldVal = Number(membership.classes_remaining);
        const newVal = oldVal + slotsHeld;
        await pool.query(
          "UPDATE memberships SET classes_remaining = classes_remaining + $1 WHERE id = $2",
          [slotsHeld, membership.id]
        );
        await logCreditChange({
          membershipId: membership.id,
          oldValue: oldVal,
          newValue: newVal,
          reason: booking.guest_name ? "booking_cancelled_free_with_guest" : "booking_cancelled_free",
          actorUserId: req.userId,
          bookingId: booking.id,
        });
        await syncExhaustedMembershipStatus({ membershipId: membership.id });
      } else if (membership) {
        // Cancelación tras agotar el cupo gratis del mes (o con refund deshabilitado):
        // se cancela pero NO se devuelve crédito. Dejar rastro en el log para auditoría.
        await logCreditChange({
          membershipId: membership.id,
          oldValue: Number(membership.classes_remaining),
          newValue: Number(membership.classes_remaining),
          reason: "booking_cancelled_penalty",
          actorUserId: req.userId,
          bookingId: booking.id,
        });
      }
    }
    const freeRemaining = Math.max(0, cwFreePerMembership - quota.used - 1);

    // ── Email: booking cancelled ───────────────────────────────────────────
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [req.userId]);
      const memAfter = membership
        ? await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id])
        : null;
      if (uRes.rows[0]) {
        const u = uRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendBookingCancelled({
            to: u.email,
            name: u.display_name || "Alumna",
            className: booking.class_type_name || "tu clase",
            date: booking.date,
            startTime: booking.start_time,
            creditRestored: shouldRefundCredit,
            isLate: false,
            classesLeft: memAfter?.rows[0]?.classes_remaining ?? null,
          }).catch((e) => console.error("[Email] booking cancelled:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "booking_cancelled",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            class: booking.class_type_name || "tu clase",
            date: booking.date ? new Date(booking.date).toLocaleDateString("es-MX") : "",
            time: booking.start_time ? String(booking.start_time).slice(0, 5) : "",
            creditRestored: shouldRefundCredit ? "Sí" : "No",
          },
          fallbackMessage: shouldRefundCredit
            ? `Hola ${u.display_name || "Alumna"}, cancelaste tu reserva de ${booking.class_type_name || "tu clase"}. Tu crédito fue devuelto.`
            : `Hola ${u.display_name || "Alumna"}, cancelaste tu reserva de ${booking.class_type_name || "tu clase"}. La clase no se devolvió a tu paquete.`,
        }).catch((e) => console.error("[WA] booking cancelled:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] cancelled query:", emailErr.message);
    }

    triggerWalletPassSync(req.userId, "booking_cancelled");
    return res.json({
      ok: true,
      refunded: shouldRefundCredit,
      credit_refunded: shouldRefundCredit,  // alias legacy
      creditRestored: shouldRefundCredit,   // alias legacy
      free_remaining_in_membership: freeRemaining,
      free_remaining_this_month: freeRemaining, // alias legacy (deprecated)
      message: shouldRefundCredit
        ? `Reserva cancelada. Se devolvió el crédito a tu paquete. Te quedan ${freeRemaining} cancelación${freeRemaining === 1 ? "" : "es"} gratis en esta membresía.`
        : "Reserva cancelada. La clase se cuenta como tomada (ya usaste tus cancelaciones gratis de esta membresía o el estudio desactivó los reembolsos).",
    });
  } catch (err) {
    console.error("DELETE bookings error:", err.message, err.stack);
    return res.status(500).json({ message: "Error interno", detail: err.message });
  }
});

// DELETE /api/bookings/:id/guest — quita solo la invitada de una reserva,
// dejando la reserva principal intacta. Libera 1 lugar y devuelve 1 crédito
// si la cancelación cae dentro de la ventana y la membresía aún tiene cupo
// gratis (misma política que cancelar la reserva completa).
app.delete("/api/bookings/:id/guest", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT b.*, c.id AS class_pk
         FROM bookings b
         JOIN classes c ON b.class_id = c.id
        WHERE b.id = $1 AND b.user_id = $2
        FOR UPDATE OF b`,
      [req.params.id, req.userId]
    );
    if (!r.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Reserva no encontrada" });
    }
    const booking = r.rows[0];
    if (!booking.guest_name) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta reserva no tiene invitada" });
    }
    if (booking.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "La reserva ya está cancelada" });
    }

    // Política de cancelación (misma que DELETE /api/bookings/:id)
    const cw = await getSettingValueWithDefaults("cancellation_window");
    const cwEnabled = cw.enabled !== false;
    if (!cwEnabled) {
      await client.query("ROLLBACK");
      return res.status(403).json({ code: "CANCELLATIONS_DISABLED", message: "Las cancelaciones están desactivadas." });
    }
    const cwMinHours = Math.max(0, Math.min(168, Number(cw.min_hours ?? 5)));
    const cwFreePerMembership = Math.max(0, Math.min(99, Number(
      cw.free_cancellations_per_membership ?? cw.free_cancellations_per_month ?? 2
    )));
    const cwRefund = cw.refund_credit_on_cancel !== false;

    const startRes = await client.query(
      `SELECT (c.date + c.start_time::time) AT TIME ZONE 'America/Mexico_City' AS start_utc
         FROM classes c WHERE c.id = $1`,
      [booking.class_id]
    );
    const startUTC = startRes.rows[0]?.start_utc ? new Date(startRes.rows[0].start_utc) : null;
    if (!startUTC) {
      await client.query("ROLLBACK");
      return res.status(500).json({ message: "No se pudo determinar la hora de la clase." });
    }
    const minutesUntil = (startUTC.getTime() - Date.now()) / 60_000;
    if (minutesUntil <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ code: "CLASS_ALREADY_STARTED", message: "Esta clase ya empezó o terminó." });
    }
    if (minutesUntil < cwMinHours * 60) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        code: "CANCELLATION_WINDOW_EXCEEDED",
        message: String(cw.late_cancel_message || "Ya no se puede modificar."),
      });
    }

    // Quitar la invitada del registro y liberar 1 lugar.
    await client.query(
      "UPDATE bookings SET guest_name = NULL, guest_phone = NULL, updated_at = NOW() WHERE id = $1",
      [booking.id]
    );
    if (booking.status === "confirmed") {
      await client.query(
        "UPDATE classes SET current_bookings = GREATEST(current_bookings - 1, 0) WHERE id = $1",
        [booking.class_id]
      );
    }

    // Crédito: misma cuota mensual de cancelaciones gratis.
    let refunded = false;
    let membership = null;
    if (booking.membership_id) {
      const mRes = await client.query(
        "SELECT id, classes_remaining FROM memberships WHERE id = $1 FOR UPDATE",
        [booking.membership_id]
      );
      membership = mRes.rows[0] ?? null;
    }
    const quota = await getCancellationQuota(req.userId, booking.membership_id);
    const eligible =
      quota.used < cwFreePerMembership &&
      cwRefund &&
      membership &&
      membership.classes_remaining !== null &&
      Number(membership.classes_remaining) < 9999;
    if (eligible && booking.status === "confirmed") {
      const oldVal = Number(membership.classes_remaining);
      await client.query(
        "UPDATE memberships SET classes_remaining = classes_remaining + 1, updated_at = NOW() WHERE id = $1",
        [membership.id]
      );
      await logCreditChange({
        client,
        membershipId: membership.id,
        oldValue: oldVal,
        newValue: oldVal + 1,
        reason: "guest_removed_refund",
        actorUserId: req.userId,
        bookingId: booking.id,
      });
      await syncExhaustedMembershipStatus({ client, membershipId: membership.id });
      refunded = true;
    } else if (membership && booking.status === "confirmed") {
      await logCreditChange({
        client,
        membershipId: membership.id,
        oldValue: Number(membership.classes_remaining),
        newValue: Number(membership.classes_remaining),
        reason: "guest_removed_penalty",
        actorUserId: req.userId,
        bookingId: booking.id,
      });
    }

    await client.query("COMMIT");
    triggerWalletPassSync(req.userId, "guest_removed");
    return res.json({
      ok: true,
      refunded,
      message: refunded
        ? "Invitada removida. Se devolvió 1 crédito a tu paquete."
        : "Invitada removida. Como ya usaste tus cancelaciones gratis (o el reembolso está deshabilitado), el crédito no se devolvió.",
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("DELETE /api/bookings/:id/guest error:", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/reviews
app.post("/api/reviews", authMiddleware, async (req, res) => {
  const { bookingId, rating, comment, tagIds } = req.body;
  if (!bookingId || !rating) return res.status(400).json({ message: "bookingId y rating requeridos" });
  try {
    const safeRating = Math.max(1, Math.min(5, Number(rating)));
    if (!Number.isFinite(safeRating)) {
      return res.status(400).json({ message: "rating inválido" });
    }
    // Verify booking belongs to user and was attended
    const bRes = await pool.query(
      `SELECT b.id, b.status, c.id AS class_id, c.instructor_id
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [bookingId, req.userId]
    );
    if (bRes.rows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const booking = bRes.rows[0];

    // Check if already reviewed
    const existing = await pool.query("SELECT id FROM reviews WHERE booking_id = $1", [bookingId]);
    if (existing.rows.length > 0) return res.status(409).json({ message: "Ya dejaste una reseña para esta clase" });

    // Compatible insert for both schemas:
    // - reviews.rating (legacy/current)
    // - reviews.overall_rating (production variants)
    const colRes = await pool.query(
      `SELECT a.attname AS column_name
       FROM pg_attribute a
       JOIN pg_class c ON a.attrelid = c.oid
       JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname='public'
         AND c.relname='reviews'
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND a.attname = ANY($1::text[])`,
      [["rating", "overall_rating", "tag_ids"]]
    );
    const hasRating = colRes.rows.some((r) => r.column_name === "rating");
    const hasOverallRating = colRes.rows.some((r) => r.column_name === "overall_rating");
    const hasTagIds = colRes.rows.some((r) => r.column_name === "tag_ids");

    const insertCols = ["user_id", "booking_id", "class_id", "instructor_id"];
    const insertVals = [req.userId, bookingId, booking.class_id, booking.instructor_id || null];

    if (hasRating) {
      insertCols.push("rating");
      insertVals.push(safeRating);
    }
    if (hasOverallRating) {
      insertCols.push("overall_rating");
      insertVals.push(safeRating);
    }

    insertCols.push("comment");
    insertVals.push(comment || null);

    if (hasTagIds) {
      insertCols.push("tag_ids");
      insertVals.push(tagIds || []);
    }

    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");

    let review;
    try {
      const rRes = await pool.query(
        `INSERT INTO reviews (${insertCols.join(", ")})
         VALUES (${placeholders}) RETURNING *`,
        insertVals
      );
      review = rRes.rows[0];
    } catch (insertErr) {
      // Safety retry for schemas where overall_rating exists but wasn't detected
      const shouldRetry =
        insertErr?.code === "23502" &&
        insertErr?.column === "overall_rating" &&
        !insertCols.includes("overall_rating");

      if (!shouldRetry) throw insertErr;

      const retryCols = [...insertCols];
      const retryVals = [...insertVals];
      const insertAt = hasRating ? retryCols.indexOf("rating") + 1 : 4;
      retryCols.splice(insertAt, 0, "overall_rating");
      retryVals.splice(insertAt, 0, safeRating);
      const retryPlaceholders = retryCols.map((_, i) => `$${i + 1}`).join(", ");

      const retryRes = await pool.query(
        `INSERT INTO reviews (${retryCols.join(", ")})
         VALUES (${retryPlaceholders}) RETURNING *`,
        retryVals
      );
      review = retryRes.rows[0];
    }

    // Insert tag links
    if (Array.isArray(tagIds) && tagIds.length > 0) {
      for (const tagId of tagIds) {
        await pool.query(
          "INSERT INTO review_tag_links (review_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [review.id, tagId]
        ).catch(() => { });
      }
    }

    return res.json({ message: "Reseña enviada — gracias por tu opinión", data: review });
  } catch (err) {
    if (
      err?.code === "23505" &&
      String(err?.detail || err?.message || "").toLowerCase().includes("booking_id")
    ) {
      return res.status(409).json({ message: "Ya dejaste una reseña para esta clase" });
    }
    console.error("POST reviews error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MercadoPago — Checkout Pro (cliente API + webhook)
// ════════════════════════════════════════════════════════════════════════════

// Crea una preferencia de Checkout Pro y devuelve la URL de pago.
async function mpCreatePreference({ orderId, orderNumber, planName, amount, userEmail }) {
  if (!isMercadoPagoEnabled()) throw new Error("MercadoPago no está configurado (falta MP_ACCESS_TOKEN)");
  const body = {
    items: [{
      id: orderId,
      title: planName || "Membresía VARRE24",
      description: `VARRE24 — ${planName || "Membresía"}`,
      quantity: 1,
      currency_id: MP_CURRENCY,
      unit_price: Number(amount),
    }],
    payer: userEmail ? { email: userEmail } : undefined,
    external_reference: orderId,
    back_urls: {
      success: `${MP_FRONTEND_URL}/app/orders?checkout=success&order=${orderId}`,
      failure: `${MP_FRONTEND_URL}/app/orders?checkout=failure&order=${orderId}`,
      pending: `${MP_FRONTEND_URL}/app/orders?checkout=pending&order=${orderId}`,
    },
    auto_return: "approved",
    notification_url: `${MP_BACKEND_URL}/webhooks/mercadopago`,
    statement_descriptor: MP_STATEMENT_DESCRIPTOR,
    metadata: { order_id: orderId, order_number: orderNumber || null },
    payment_methods: {
      excluded_payment_types: [],
      excluded_payment_methods: [],
      installments: MP_MAX_INSTALLMENTS,
    },
  };
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `order-${orderId}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`MercadoPago preference error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return {
    preference_id: data.id,
    checkout_url: data.init_point,
    sandbox_checkout_url: data.sandbox_init_point,
  };
}

// Consulta el estado real de un pago contra la API de MercadoPago.
async function mpSyncPayment(mpPaymentId) {
  if (!isMercadoPagoEnabled()) throw new Error("MercadoPago no está configurado (falta MP_ACCESS_TOKEN)");
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
    headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`MercadoPago payment sync error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return {
    status: data.status,
    status_detail: data.status_detail,
    external_reference: data.external_reference,
    transaction_amount: data.transaction_amount,
    payer_email: data.payer?.email || "",
  };
}

// Verifica la firma HMAC del webhook (header x-signature: "ts=...,v1=...").
// Manifest firmado: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
function mpVerifyWebhookSignature(req, dataId) {
  if (!MP_WEBHOOK_SECRET) return true; // sin secret configurado → se omite (comportamiento legacy)
  const sigHeader = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const idx = p.indexOf("=");
      return idx === -1 ? [p.trim(), ""] : [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const computed = crypto.createHmac("sha256", MP_WEBHOOK_SECRET).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(v1, "hex"));
  } catch (_e) {
    return false;
  }
}

// Activa la orden cuando MercadoPago confirma un pago aprobado.
// Replica la lógica de aprobación manual (membresía, crédito de referido,
// consulta de complemento, registro de pago) en una sola transacción.
async function approveOrderFromMP(orderId, mpPaymentId, paymentInfo) {
  const headRes = await pool.query(
    `SELECT o.*, p.name AS plan_name FROM orders o
       LEFT JOIN plans p ON o.plan_id = p.id
      WHERE o.id = $1`,
    [orderId]
  );
  if (!headRes.rows.length) { console.warn("[MP webhook] order not found:", orderId); return; }
  if (headRes.rows[0].status === "approved") {
    // Ya estaba aprobada — solo persistir info del pago de forma idempotente.
    await pool.query(
      `UPDATE orders SET mp_payment_id = $1, mp_payment_status = $2, mp_status_detail = $3,
              provider_synced_at = NOW(), updated_at = NOW()
        WHERE id = $4`,
      [mpPaymentId, paymentInfo?.status || "approved", paymentInfo?.status_detail || null, orderId]
    );
    return;
  }

  const client = await pool.connect();
  let approvedOrder = null;
  let plan = null;
  try {
    await client.query("BEGIN");

    const orderRes = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
    if (!orderRes.rows.length) { await client.query("ROLLBACK"); return; }
    let order = orderRes.rows[0];
    if (order.status === "approved") { await client.query("ROLLBACK"); return; }

    if (order.plan_id) {
      const planRes = await client.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]);
      plan = planRes.rows[0] || null;
    }

    const updRes = await client.query(
      `UPDATE orders SET
          status = 'approved', payment_method = 'card', payment_provider = 'mercadopago',
          mp_payment_id = $2, mp_payment_status = $3, mp_status_detail = $4,
          provider_synced_at = NOW(), approved_at = NOW(), paid_at = COALESCE(paid_at, NOW()),
          updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [orderId, mpPaymentId, paymentInfo?.status || "approved", paymentInfo?.status_detail || null]
    );
    order = updRes.rows[0];
    approvedOrder = order;

    // ── Activar membresía ──
    if (order.plan_id && plan && order.user_id) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const endStr = calcMembershipEndDate(todayStr, plan);
      const existingMem = await client.query("SELECT id FROM memberships WHERE order_id = $1", [order.id]);
      if (existingMem.rows.length) {
        await client.query("UPDATE memberships SET status = 'active' WHERE order_id = $1", [order.id]);
      } else {
        await client.query(
          `UPDATE orders SET status = 'cancelled', notes = COALESCE(notes,'') || ' [auto-cancelada: otra orden del mismo plan fue aprobada]'
            WHERE user_id = $1 AND plan_id = $2 AND id != $3 AND status IN ('pending_payment', 'pending_verification')`,
          [order.user_id, order.plan_id, order.id]
        );
        await client.query(
          `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, order_id)
           VALUES ($1,$2,'active','card',$3,$4,$5,$6)`,
          [order.user_id, order.plan_id, todayStr, endStr, plan.class_limit === 0 ? null : (plan.class_limit ?? null), order.id]
        );
      }
    }

    // ── Consulta de complemento si la orden lo incluye ──
    const orderComplementType = order.complement_type || null;
    if (orderComplementType) {
      const compInfo = COMPLEMENT_MAP[orderComplementType] || null;
      if (compInfo) {
        try {
          const memForOrder = await client.query("SELECT id FROM memberships WHERE order_id = $1 LIMIT 1", [order.id]);
          const membershipId = memForOrder.rows[0]?.id || null;
          await client.query(
            `INSERT INTO consultations (membership_id, user_id, complement_type, complement_name, specialist, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [membershipId, order.user_id, orderComplementType, compInfo.name, compInfo.specialist]
          );
        } catch (compErr) {
          console.error("[MP webhook] consultations insert:", compErr.message);
        }
      }
    }

    if (order.discount_code_id) {
      await incrementDiscountUsage(order.discount_code_id, client);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[MP webhook] approveOrderFromMP transaction error:", err.message);
    throw err;
  } finally {
    client.release();
  }

  // ── Efectos secundarios post-commit (fire & forget) ──
  try {
    const order = approvedOrder;
    if (!order || !order.plan_id) return;
    if (!plan) {
      const planRes = await pool.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]).catch(() => null);
      plan = planRes?.rows?.[0] || null;
    }
    // Registro contable del pago
    try {
      const memForPay = await pool.query("SELECT id FROM memberships WHERE order_id = $1 LIMIT 1", [order.id]);
      const membershipId = memForPay.rows[0]?.id || null;
      await pool.query(
        `INSERT INTO payments (user_id, membership_id, amount, currency, payment_method, reference, status, notes)
         VALUES ($1, $2, $3, $4, 'card', $5, 'completed', 'MercadoPago')`,
        [order.user_id, membershipId, order.total_amount, order.currency || MP_CURRENCY, mpPaymentId]
      );
    } catch (payErr) {
      console.error("[MP webhook] payments insert:", payErr.message);
    }
    // Puntos de lealtad
    if (order.user_id && Number(order.total_amount) > 0) {
      try {
        const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
        const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
        const pts = Math.floor(Number(order.total_amount || 0) * (cfg.points_per_peso ?? 1));
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
            [order.user_id, pts, `Compra aprobada (tarjeta) — $${order.total_amount}`]
          );
        }
      } catch (_e) { /* loyalty no debe fallar el webhook */ }
    }
    // Email + WhatsApp de membresía activada
    if (order.user_id && plan) {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [order.user_id]).catch(() => null);
      const u = uRes?.rows?.[0];
      if (u) {
        const startStr = new Date().toISOString().slice(0, 10);
        const endStr = calcMembershipEndDate(startStr, plan);
        const startDisplay = new Date(startStr).toLocaleDateString("es-MX");
        const endDisplay = endStr ? new Date(endStr).toLocaleDateString("es-MX") : "";
        if (u.email && (await areEmailNotificationsEnabled().catch(() => false))) {
          sendMembershipActivated({
            to: u.email,
            name: u.display_name || "Alumna",
            planName: plan.name,
            startDate: startStr,
            endDate: endStr,
            classLimit: plan.class_limit ?? null,
          }).catch((e) => console.error("[MP webhook] membership email:", e.message));
        }
        if (u.phone) {
          sendConfiguredWhatsAppTemplate({
            templateKey: "membership_activated",
            phone: u.phone,
            vars: { name: u.display_name || "Alumna", plan: plan.name || "tu plan", startDate: startDisplay, endDate: endDisplay },
            fallbackMessage: `Hola ${u.display_name || "Alumna"}, tu membresía ${plan.name || ""} ya está activa. Vigencia: ${startDisplay} al ${endDisplay}.`,
          }).catch((e) => console.error("[MP webhook] WhatsApp:", e.message));
        }
      }
    }
    if (order.user_id) triggerWalletPassSync(order.user_id, "mp_payment_approved");
  } catch (sideErr) {
    console.error("[MP webhook] post-commit side effects:", sideErr.message);
  }
}

// Procesa una notificación de pago de MercadoPago: consulta el estado real,
// persiste info del pago y, si está aprobado, activa la orden.
async function handleMpPaymentNotification(mpPaymentId) {
  const payment = await mpSyncPayment(mpPaymentId);
  const { status, status_detail, external_reference } = payment;
  if (!external_reference) {
    console.warn("[MP webhook] payment without external_reference:", mpPaymentId);
    return;
  }
  await pool.query(
    `UPDATE orders SET mp_payment_id = $1, mp_payment_status = $2, mp_status_detail = $3,
            payment_provider = COALESCE(payment_provider, 'mercadopago'), provider_synced_at = NOW(), updated_at = NOW()
      WHERE id = $4`,
    [mpPaymentId, status, status_detail, external_reference]
  );
  if (status === "approved") {
    await approveOrderFromMP(external_reference, mpPaymentId, payment);
  } else if (status === "rejected" || status === "cancelled") {
    await pool.query(
      `UPDATE orders SET status = 'rejected', rejected_at = NOW(),
              rejection_reason = COALESCE(rejection_reason, $2), updated_at = NOW()
        WHERE id = $1 AND status = 'pending_payment'`,
      [external_reference, `Pago con tarjeta rechazado (${status_detail || status})`]
    ).catch(() => {});
  }
}

// POST /webhooks/mercadopago — webhook server-to-server (FUENTE DE VERDAD).
// IMPORTANTE: la ruta NO va bajo /api, debe coincidir con notification_url.
app.post("/webhooks/mercadopago", async (req, res) => {
  // 1) Responder 200 de inmediato — MercadoPago reintenta si tarda.
  res.status(200).end();
  try {
    const { type, data, action } = req.body || {};
    const queryType = req.query?.type;
    const queryDataId = req.query?.["data.id"] || req.query?.id;
    const mpPaymentId = (data?.id ?? queryDataId)?.toString();
    if (!mpPaymentId) return;

    // 2) Verificar firma HMAC.
    if (!mpVerifyWebhookSignature(req, mpPaymentId)) {
      console.warn(`[MP webhook] signature verification failed for ${mpPaymentId}`);
      return;
    }

    const eventType = type || queryType || (action?.includes?.("payment") ? "payment" : null);
    if (eventType !== "payment") return; // solo nos interesan eventos de pago
    const eventKey = `payment:${mpPaymentId}`;

    // 3) Idempotencia — el INSERT falla (23505) si el evento ya se procesó.
    try {
      await pool.query(
        `INSERT INTO payment_webhook_events (provider, event_key, event_type, payload)
         VALUES ('mercadopago', $1, 'payment', $2)`,
        [eventKey, JSON.stringify(req.body || {})]
      );
    } catch (e) {
      if (e.code === "23505") return; // ya procesado
      console.error("[MP webhook] idempotency insert error:", e.message);
      return;
    }

    // 4) Procesar.
    try {
      await handleMpPaymentNotification(mpPaymentId);
      await pool.query(
        `UPDATE payment_webhook_events SET processed_at = NOW() WHERE provider = 'mercadopago' AND event_key = $1`,
        [eventKey]
      );
    } catch (procErr) {
      console.error("[MP webhook] processing error:", procErr.message);
      // El evento queda registrado sin processed_at → se puede reprocesar manualmente.
    }
  } catch (outerErr) {
    console.error("[MP webhook] handler error:", outerErr.message);
  }
});

// ─── Routes: /api/orders ────────────────────────────────────────────────────

// GET /api/orders
app.get("/api/orders", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, p.name AS plan_name, p.duration_days
       FROM orders o
       JOIN plans p ON o.plan_id = p.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.userId]
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET orders error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/notifications — real notifications from orders, bookings, memberships
app.get("/api/notifications", authMiddleware, async (req, res) => {
  try {
    const notifications = [];

    // 1) Orders — approved, rejected, pending
    const orders = await pool.query(
      `SELECT o.id, o.status, o.total, o.created_at, o.updated_at, o.order_number,
              p.name AS plan_name
       FROM orders o
       JOIN plans p ON o.plan_id = p.id
       WHERE o.user_id = $1
       ORDER BY o.updated_at DESC
       LIMIT 20`,
      [req.userId]
    );
    for (const o of orders.rows) {
      if (o.status === "paid") {
        notifications.push({
          id: `order-paid-${o.id}`,
          title: "Pago aprobado",
          body: `Tu pago de $${o.total} para ${o.plan_name} fue aprobado. ¡Tu membresía está activa!`,
          time: o.updated_at,
          unread: (Date.now() - new Date(o.updated_at).getTime()) < 7 * 86400000,
          type: "success",
        });
      } else if (o.status === "rejected") {
        notifications.push({
          id: `order-rej-${o.id}`,
          title: "Pago rechazado",
          body: `Tu pago para ${o.plan_name} (${o.order_number || ""}) fue rechazado. Contacta al estudio para más información.`,
          time: o.updated_at,
          unread: (Date.now() - new Date(o.updated_at).getTime()) < 7 * 86400000,
          type: "error",
        });
      } else if (o.status === "pending_verification") {
        notifications.push({
          id: `order-pend-${o.id}`,
          title: "Pago en revisión",
          body: `Tu orden ${o.order_number || ""} para ${o.plan_name} está siendo revisada.`,
          time: o.created_at,
          unread: true,
          type: "info",
        });
      }
    }

    // 2) Upcoming bookings (next 48h)
    const bookings = await pool.query(
      `SELECT b.id, b.status, c.date, c.start_time, ct.name AS class_name
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE b.user_id = $1 AND b.status = 'confirmed'
         AND (c.date || 'T' || c.start_time)::timestamp >= NOW()
         AND (c.date || 'T' || c.start_time)::timestamp <= NOW() + INTERVAL '48 hours'
       ORDER BY c.date, c.start_time
       LIMIT 10`,
      [req.userId]
    );
    for (const b of bookings.rows) {
      notifications.push({
        id: `booking-${b.id}`,
        title: "Clase próxima",
        body: `Tu clase de ${b.class_name} es el ${b.date} a las ${b.start_time}.`,
        time: new Date().toISOString(),
        unread: true,
        type: "reminder",
      });
    }

    // 3) Active memberships
    const memberships = await pool.query(
      `SELECT m.id, m.status, m.classes_remaining, m.start_date, m.created_at,
              COALESCE(m.plan_name_override, p.name) AS plan_name
       FROM memberships m
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1 AND m.status = 'active'
       ORDER BY m.created_at DESC
       LIMIT 5`,
      [req.userId]
    );
    for (const m of memberships.rows) {
      if (m.classes_remaining !== null && m.classes_remaining <= 2 && m.classes_remaining > 0) {
        notifications.push({
          id: `mem-low-${m.id}`,
          title: "Créditos por agotarse",
          body: `Tu membresía ${m.plan_name} tiene solo ${m.classes_remaining} clase(s) restante(s).`,
          time: new Date().toISOString(),
          unread: true,
          type: "warning",
        });
      }
    }

    // Sort by time descending
    notifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return res.json({ data: notifications });
  } catch (err) {
    console.error("GET notifications error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/orders/:id
app.get("/api/orders/:id", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, p.name AS plan_name, p.duration_days, p.features,
              (SELECT json_agg(json_build_object(
                 'id', pp.id, 'file_url', pp.file_url, 'file_name', pp.file_name,
                 'mime_type', pp.mime_type, 'status', pp.status,
                 'uploaded_at', pp.uploaded_at, 'sort_order', pp.sort_order
               ) ORDER BY pp.sort_order, pp.uploaded_at)
                FROM payment_proofs pp WHERE pp.order_id = o.id) AS proofs,
              (SELECT pp.file_url     FROM payment_proofs pp WHERE pp.order_id = o.id ORDER BY pp.sort_order LIMIT 1) AS proof_url,
              (SELECT pp.status       FROM payment_proofs pp WHERE pp.order_id = o.id ORDER BY pp.sort_order LIMIT 1) AS proof_status,
              (SELECT pp.uploaded_at  FROM payment_proofs pp WHERE pp.order_id = o.id ORDER BY pp.sort_order LIMIT 1) AS proof_uploaded_at
         FROM orders o
         JOIN plans p ON o.plan_id = p.id
        WHERE o.id = $1 AND o.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Orden no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("GET orders/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/orders
app.post("/api/orders", authMiddleware, async (req, res) => {
  const { planId, discountCode, paymentMethod: rawPM = "transfer", complementId, complementType } = req.body;
  const paymentMethod = normalizePaymentMethod(rawPM);
  if (!planId) return res.status(400).json({ message: "planId requerido" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planRes = await client.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
    if (planRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Plan no encontrado" });
    }
    const plan = planRes.rows[0];
    const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId: req.userId, plan, client });
    if (nonRepeatableConflict) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: nonRepeatableConflict.message });
    }

    // ── Órdenes pendientes duplicadas para el mismo plan ──
    const pendingDup = await client.query(
      `SELECT id, status, payment_method, mp_checkout_url, order_number
         FROM orders
        WHERE user_id = $1 AND plan_id = $2
          AND status IN ('pending_payment', 'pending_verification')
        ORDER BY created_at DESC
        LIMIT 1`,
      [req.userId, planId]
    );
    if (pendingDup.rows.length) {
      const dup = pendingDup.rows[0];
      await client.query("ROLLBACK");
      // Pago con tarjeta: en vez de bloquear, REUTILIZAR la orden pendiente y
      // devolver (o regenerar) su checkout de MercadoPago. Antes esto devolvía
      // 409 y el cliente quedaba atascado tras un intento de pago fallido.
      if (paymentMethod === "card" && dup.status === "pending_payment") {
        try {
          let checkoutUrl = dup.mp_checkout_url || null;
          if (!checkoutUrl && isMercadoPagoEnabled()) {
            const dupFull = await pool.query(
              `SELECT o.*, p.name AS plan_name, u.email AS user_email
                 FROM orders o JOIN plans p ON o.plan_id = p.id JOIN users u ON o.user_id = u.id
                WHERE o.id = $1`,
              [dup.id]
            );
            if (dupFull.rows.length) {
              const d = dupFull.rows[0];
              const pref = await mpCreatePreference({
                orderId: d.id,
                orderNumber: d.order_number,
                planName: d.plan_name,
                amount: Number(d.total_amount),
                userEmail: d.user_email || "",
              });
              checkoutUrl = pref.checkout_url;
              await pool.query(
                `UPDATE orders SET payment_method = 'card', payment_provider = 'mercadopago',
                        payment_intent_id = $1, mp_checkout_url = $2, updated_at = NOW()
                  WHERE id = $3`,
                [pref.preference_id, pref.checkout_url, d.id]
              );
            }
          }
          if (checkoutUrl) {
            return res.status(200).json({
              data: { id: dup.id, order_number: dup.order_number, reused: true, mp_checkout_url: checkoutUrl },
            });
          }
        } catch (reuseErr) {
          console.error("[orders] reuse pending card order error:", reuseErr.message);
        }
      }
      return res.status(409).json({
        message: "Ya tienes una orden pendiente para este plan. Completa o cancela la orden existente antes de crear otra.",
        existingOrderId: dup.id,
        existingOrderStatus: dup.status,
      });
    }

    // ── Pricing with cash/transfer discounts ──
    const COMBO_PRICES = { 8: { price: 1030, discount: 990 }, 12: { price: 1250, discount: 1190 }, 16: { price: 1450, discount: 1340 } };
    // Feature de complementos retirada: se ignora cualquier complementType /
    // complementId que llegue por API. No se aplica precio combo hardcodeado
    // ni se generan consultas. (Var no usada referenciada abajo, se deja null.)
    void complementType; void complementId;
    const activeComplement = null;
    let subtotal = parseFloat(plan.price);
    const isCashOrTransfer = paymentMethod === "cash" || paymentMethod === "transfer";

    if (activeComplement) {
      const cl = plan.class_limit;
      const combo = COMBO_PRICES[cl];
      if (combo) {
        subtotal = isCashOrTransfer ? combo.discount : combo.price;
      }
    } else if (isCashOrTransfer && plan.discount_price != null && parseFloat(plan.discount_price) > 0) {
      subtotal = parseFloat(plan.discount_price);
    }

    let discount = 0;
    let appliedDiscountCode = null;

    if (discountCode) {
      const discountResult = await findApplicableDiscountCode({
        code: discountCode,
        subtotal,
        planId,
        classCategory: normalizeClassCategory(plan.class_category, "all"),
        channel: "membership",
        client,
      });
      if (!discountResult) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Código de descuento no válido para este plan" });
      }
      if (discountResult.rejectedByMinOrder) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Compra mínima requerida: $${Number(discountResult.minOrderAmount || 0).toFixed(2)} MXN`,
        });
      }
      discount = discountResult.discountAmount;
      appliedDiscountCode = discountResult.code;
    }

    // Referral program removed: no referral credit is ever applied to an order.
    const referralDiscount = 0;
    const appliedCreditId = null;

    const baseTotal = Math.max(0, subtotal - discount - referralDiscount);
    // Sin recargo por pago con tarjeta. El estudio absorbe la comisión de MercadoPago.
    const cardFee = 0;
    const total = Math.round(baseTotal * 100) / 100;
    const bankInfo = await getConfiguredBankInfo(client);
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h
    // Cash orders skip proof upload → go straight to pending_verification so admin can approve
    const initialStatus = paymentMethod === "cash" ? "pending_verification" : "pending_payment";
    // Build INSERT dynamically — complement_id column may not exist yet
    const cols = ["user_id", "plan_id", "status", "payment_method", "subtotal", "tax_amount", "total_amount", "bank_info", "expires_at"];
    const vals = [req.userId, planId, initialStatus, paymentMethod, subtotal, 0, total, JSON.stringify(bankInfo), expires];
    if (cardFee > 0) { cols.push("card_fee_amount"); vals.push(cardFee); }
    if (discount > 0 || appliedDiscountCode) {
      cols.push("discount_amount");
      vals.push(discount);
      if (appliedDiscountCode?.id) {
        cols.push("discount_code_id");
        vals.push(appliedDiscountCode.id);
      }
    }
    if (referralDiscount > 0 && appliedCreditId) {
      cols.push("applied_credit_id"); vals.push(appliedCreditId);
      cols.push("referral_discount"); vals.push(referralDiscount);
    }
    if (activeComplement) {
      cols.push("complement_type");
      vals.push(activeComplement);
      cols.push("notes");
      vals.push(`Complemento: ${activeComplement}`);
    }
    const placeholders = vals.map((_, i) => {
      const col = cols[i];
      if (col === "status") return `$${i + 1}::order_status`;
      if (col === "payment_method") return `$${i + 1}::payment_method`;
      return `$${i + 1}`;
    }).join(", ");
    let orderRes;
    try {
      orderRes = await client.query(
        `INSERT INTO orders (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
    } catch (insertErr) {
      throw insertErr;
    }

    await client.query("COMMIT");

    const order = orderRes.rows[0];

    // ── Pago con tarjeta en línea: generar checkout de MercadoPago ──
    let mp_checkout_url = null;
    if (paymentMethod === "card") {
      if (!isMercadoPagoEnabled()) {
        console.warn("[orders] MercadoPago no configurado — orden con tarjeta queda pendiente sin checkout");
      } else {
        try {
          const u = await pool.query("SELECT email FROM users WHERE id = $1", [req.userId]);
          const pref = await mpCreatePreference({
            orderId: order.id,
            orderNumber: order.order_number,
            planName: plan.name,
            amount: Number(order.total_amount),
            userEmail: u.rows[0]?.email || "",
          });
          mp_checkout_url = pref.checkout_url;
          await pool.query(
            `UPDATE orders SET payment_provider = 'mercadopago', payment_intent_id = $1, mp_checkout_url = $2, updated_at = NOW() WHERE id = $3`,
            [pref.preference_id, pref.checkout_url, order.id]
          );
          order.payment_provider = "mercadopago";
          order.payment_intent_id = pref.preference_id;
          order.mp_checkout_url = pref.checkout_url;
        } catch (mpErr) {
          console.error("[orders] MercadoPago preference error:", mpErr.message);
          // La orden ya existe; el cliente puede reintentar desde /api/orders/:id/pay-with-card
        }
      }
    }

    return res.status(201).json({
      data: {
        ...order,
        plan_name: plan.name,
        mp_checkout_url,
        bank_details: { ...bankInfo, amount: total, currency: "MXN" },
      }
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("POST orders error:", err);
    return res.status(500).json({ message: err?.message || "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/orders/:id/pay-with-card — genera (o reutiliza) el checkout de MercadoPago
// para una orden existente. Útil si la orden se creó pero el pago no se completó,
// o si la generación inicial de la preferencia falló.
app.post("/api/orders/:id/pay-with-card", authMiddleware, async (req, res) => {
  try {
    if (!isMercadoPagoEnabled()) {
      return res.status(503).json({ message: "El pago con tarjeta no está disponible por el momento." });
    }
    const orderRes = await pool.query(
      `SELECT o.*, p.name AS plan_name, u.email AS user_email
         FROM orders o
         JOIN plans p ON o.plan_id = p.id
         JOIN users u ON o.user_id = u.id
        WHERE o.id = $1 AND o.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ message: "Orden no encontrada" });
    const order = orderRes.rows[0];
    if (order.status !== "pending_payment") {
      return res.status(400).json({ message: "Esta orden ya no acepta pagos." });
    }
    // Reutilizar el checkout si ya existe (no duplicar preferencias).
    if (order.mp_checkout_url) {
      return res.json({ data: { mp_checkout_url: order.mp_checkout_url } });
    }
    const pref = await mpCreatePreference({
      orderId: order.id,
      orderNumber: order.order_number,
      planName: order.plan_name,
      amount: Number(order.total_amount),
      userEmail: order.user_email || "",
    });
    await pool.query(
      `UPDATE orders SET payment_method = 'card', payment_provider = 'mercadopago',
              payment_intent_id = $1, mp_checkout_url = $2, updated_at = NOW()
        WHERE id = $3`,
      [pref.preference_id, pref.checkout_url, order.id]
    );
    return res.json({ data: { mp_checkout_url: pref.checkout_url } });
  } catch (err) {
    console.error("POST /api/orders/:id/pay-with-card error:", err.message);
    return res.status(500).json({ message: "No se pudo generar el checkout de pago." });
  }
});

// POST /api/orders/:id/cancel — el cliente cancela su propia orden.
// Solo permitido mientras la orden está en 'pending_payment' (aún no pagada
// ni con comprobante en revisión). No toca órdenes aprobadas/en revisión.
app.post("/api/orders/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const orderRes = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ message: "Orden no encontrada" });
    const order = orderRes.rows[0];
    if (order.status !== "pending_payment") {
      return res.status(400).json({ message: "Solo puedes cancelar órdenes con pago pendiente." });
    }
    const r = await pool.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND status = 'pending_payment'
        RETURNING *`,
      [req.params.id, req.userId]
    );
    if (!r.rows.length) {
      return res.status(409).json({ message: "La orden cambió de estado, recarga e inténtalo de nuevo." });
    }
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST /api/orders/:id/cancel error:", err.message);
    return res.status(500).json({ message: "No se pudo cancelar la orden." });
  }
});

// POST /api/orders/:id/proof — multi-archivo (max 3) + auto-aprobación provisional
const MAX_PROOFS = 3;
const ALLOWED_PROOF_MIMES = new Set(["image/jpeg","image/png","image/webp"]);

app.post("/api/orders/:id/proof", authMiddleware, upload.any(), async (req, res) => {
  try {
    const orderRes = await pool.query(
      `SELECT o.*, u.email AS user_email, u.display_name AS user_name, u.phone AS user_phone
         FROM orders o JOIN users u ON o.user_id = u.id
        WHERE o.id = $1 AND o.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ message: "Orden no encontrada" });
    const order = orderRes.rows[0];

    if (!["pending_payment","pending_verification","approved"].includes(order.status)) {
      return res.status(400).json({ message: "Esta orden ya no acepta comprobantes." });
    }

    const incoming = Array.isArray(req.files) ? req.files : [];
    if (incoming.length === 0 && !req.body.fileUrl) {
      return res.status(400).json({ message: "Sube al menos un comprobante." });
    }
    for (const f of incoming) {
      if (!ALLOWED_PROOF_MIMES.has(f.mimetype)) {
        return res.status(400).json({ message: `Tipo no permitido: ${f.mimetype}. Solo imágenes JPG, PNG o WEBP.` });
      }
    }
    const existingCount = (await pool.query(
      "SELECT COUNT(*)::int AS n FROM payment_proofs WHERE order_id=$1", [order.id]
    )).rows[0].n;
    const incomingCount = incoming.length || (req.body.fileUrl ? 1 : 0);
    if (existingCount + incomingCount > MAX_PROOFS) {
      return res.status(400).json({
        message: `Máximo ${MAX_PROOFS} comprobantes por orden (ya tienes ${existingCount}).`,
      });
    }

    let nextSort = existingCount;
    for (const f of incoming) {
      const dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
      await pool.query(
        `INSERT INTO payment_proofs (order_id, file_url, file_name, mime_type, status, sort_order)
         VALUES ($1,$2,$3,$4,'pending',$5)`,
        [order.id, dataUrl, f.originalname || `comprobante-${nextSort+1}`, f.mimetype, nextSort++]
      );
    }
    if (incoming.length === 0 && req.body.fileUrl) {
      await pool.query(
        `INSERT INTO payment_proofs (order_id, file_url, file_name, mime_type, status, sort_order)
         VALUES ($1,$2,$3,$4,'pending',$5)`,
        [order.id, req.body.fileUrl, req.body.fileName || "comprobante",
         req.body.mimeType || "application/octet-stream", nextSort++]
      );
    }

    // ¿Validación manual de transferencias activada? Si sí, NO auto-aprobar:
    // la orden queda pending_verification hasta que el admin la apruebe en Pagos.
    const payValidation = await getSettingValueWithDefaults("payment_validation");
    const manualTransfer = payValidation?.manual_transfer !== false;

    let manualPending = false;
    if (order.status !== "approved") {
      if (manualTransfer) {
        // Pendiente de validación del admin. NO se crea la membresía todavía.
        await pool.query(
          "UPDATE orders SET status='pending_verification', paid_at = COALESCE(paid_at, NOW()), updated_at=NOW() WHERE id=$1",
          [order.id]
        ).catch(()=>{});
        manualPending = true;
        // Avisar al admin que hay un pago por validar (best-effort).
        try {
          const envList = String(process.env.ADMIN_NOTIFY_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
          const dbAdmins = await pool.query("SELECT email FROM users WHERE role IN ('admin','super_admin') AND email IS NOT NULL").catch(() => ({ rows: [] }));
          const planRow = await pool.query("SELECT name FROM plans WHERE id=$1", [order.plan_id]);
          const recipients = Array.from(new Set([...envList, ...dbAdmins.rows.map((r) => r.email)].map((e) => e.toLowerCase()))).slice(0, 10);
          for (const to of recipients) {
            sendAdminNewOrderToVerify({
              to, orderNumber: order.order_number, orderId: order.id,
              planName: planRow.rows[0]?.name || "Plan", alumnaName: order.user_name || "Alumna",
              amount: order.total_amount, expiresAt: null,
            }).catch(() => {});
          }
        } catch (_e) {}
        // Avisar al admin por WhatsApp (no solo el panel) si configuró su número.
        try {
          const notifyPhone = String(payValidation?.notify_whatsapp || "").trim();
          if (notifyPhone) {
            const planRow2 = await pool.query("SELECT name FROM plans WHERE id=$1", [order.plan_id]).catch(() => ({ rows: [] }));
            const planName = planRow2.rows[0]?.name || "Plan";
            const amount = Number(order.total_amount || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
            await sendConfiguredWhatsAppTemplate({
              templateKey: "admin_payment_to_verify",
              phone: notifyPhone,
              vars: { alumna: order.user_name || "Una alumna", plan: planName, monto: amount, folio: order.order_number || order.id },
              fallbackMessage: `🔔 VARRE24 — Pago por validar\n${order.user_name || "Una alumna"} subió comprobante de transferencia.\nPlan: ${planName} · ${amount}\nFolio: ${order.order_number || order.id}\nEntra a Pagos para aprobar y activar su membresía.`,
            }).catch(() => {});
          }
        } catch (_e) {}
      } else {
        // Auto-aprobación al instante (provisional 24h) — comportamiento previo.
        try {
          const planRow = await pool.query("SELECT name FROM plans WHERE id=$1", [order.plan_id]);
          order.plan_name = planRow.rows[0]?.name;
          await autoApproveTransferOrder(order);
        } catch (e) {
          console.error("[POST /proof auto-approve]", e.message);
          await pool.query(
            "UPDATE orders SET status='pending_verification', paid_at = COALESCE(paid_at, NOW()), updated_at=NOW() WHERE id=$1",
            [order.id]
          ).catch(()=>{});
        }
      }
    }

    if (manualPending) {
      return res.json({
        message: "Recibimos tu comprobante. La administración validará tu pago y activará tu membresía en breve.",
        auto_approved: false,
        pending_validation: true,
      });
    }
    return res.json({
      message: "Tu pago se está verificando y tu membresía ya está activa. La admin revisará el comprobante en las próximas 24 horas.",
      auto_approved: true,
    });
  } catch (err) {
    console.error("POST orders/proof error:", err.message, err.stack);
    return res.status(500).json({ message: "Error interno", detail: err.message });
  }
});

// DELETE /api/orders/:id/proof/:proofId — quitar un comprobante antes de que admin verifique
app.delete("/api/orders/:id/proof/:proofId", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `DELETE FROM payment_proofs
         WHERE id = $1
           AND order_id IN (
             SELECT id FROM orders WHERE id = $2 AND user_id = $3 AND verified_at IS NULL
           )
         RETURNING id`,
      [req.params.proofId, req.params.id, req.userId]
    );
    if (!r.rowCount) return res.status(404).json({ message: "Comprobante no encontrado o ya verificado." });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE proof error:", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/discount-codes ────────────────────────────────────────────

// POST /api/discount-codes/validate
app.post("/api/discount-codes/validate", authMiddleware, async (req, res) => {
  const { code, planId, classCategory, channel } = req.body;
  if (!code) return res.status(400).json({ message: "Código requerido" });
  try {
    const planRes = await pool.query("SELECT price, class_category FROM plans WHERE id = $1", [planId || null]);
    const originalPrice = planRes.rows.length > 0 ? parseFloat(planRes.rows[0].price) : 0;
    const effectiveCategory = normalizeClassCategory(
      classCategory ?? planRes.rows[0]?.class_category ?? "all",
      "all"
    );
    const discountResult = await findApplicableDiscountCode({
      code,
      subtotal: originalPrice,
      planId: planId || null,
      classCategory: effectiveCategory,
      channel: channel || "membership",
    });
    if (!discountResult) return res.status(404).json({ message: "Código no válido o expirado" });
    if (discountResult.rejectedByMinOrder) {
      return res.status(400).json({
        message: `Compra mínima requerida: $${Number(discountResult.minOrderAmount || 0).toFixed(2)} MXN`,
      });
    }
    const dc = discountResult.code;
    const discount = discountResult.discountAmount;
    return res.json({
      data: {
        code: dc.code,
        discount_type: dc.discount_type,
        discount_value: parseFloat(dc.discount_value),
        discount_amount: Math.min(discount, originalPrice),
        final_price: Math.max(originalPrice - discount, 0),
      }
    });
  } catch (err) {
    console.error("Discount validate error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/wallet ────────────────────────────────────────────────────

// GET /api/wallet/pass
app.get("/api/wallet/pass", authMiddleware, async (req, res) => {
  try {
    const pointsRes = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points WHEN type='adjust' THEN points ELSE -points END), 0) AS total FROM loyalty_transactions WHERE user_id = $1",
      [req.userId]
    );
    const total = parseInt(pointsRes.rows[0].total);
    const passesRes = await pool.query(
      `SELECT ep.id,
              ep.pass_code,
              ep.status,
              ep.issued_at,
              ep.used_at,
              e.id AS event_id,
              e.title AS event_title,
              e.date AS event_date,
              e.start_time AS event_start_time
         FROM event_passes ep
         JOIN events e ON e.id = ep.event_id
        WHERE ep.user_id = $1
          AND ep.status <> 'cancelled'
        ORDER BY e.date DESC, e.start_time DESC
        LIMIT 20`,
      [req.userId]
    );
    let membership = null;
    try {
      const memRes = await pool.query(
        `SELECT m.id, m.status, m.classes_remaining, m.start_date, m.end_date,
                m.plan_name_override, m.class_limit_override,
                p.name AS plan_name, p.class_limit AS plan_class_limit,
                p.class_category, p.is_non_transferable, p.is_non_repeatable, p.repeat_key
           FROM memberships m
      LEFT JOIN plans p ON p.id = m.plan_id
          WHERE m.user_id = $1
            AND m.status = 'active'
            AND m.end_date >= CURRENT_DATE
       ORDER BY m.end_date DESC
          LIMIT 1`,
        [req.userId]
      );
      if (memRes.rows.length > 0) {
        const m = memRes.rows[0];
        membership = {
          id: m.id,
          status: m.status,
          plan_name: m.plan_name_override || m.plan_name || "Plan Activo",
          class_limit: m.class_limit_override ?? m.plan_class_limit,
          classes_remaining: m.classes_remaining,
          start_date: m.start_date,
          end_date: m.end_date,
          class_category: normalizeClassCategory(m.class_category, "all"),
          is_non_transferable: parseBooleanFlag(m.is_non_transferable),
          is_non_repeatable: parseBooleanFlag(m.is_non_repeatable),
          repeat_key: m.repeat_key || null,
        };
      }
    } catch (memErr) {
      console.error("Wallet/pass membership error:", memErr.message);
    }
    // QR data: user ID encoded
    const qrData = Buffer.from(req.userId).toString("base64");
    return res.json({
      data: {
        points: total,
        qr_code: qrData,
        membership,
        event_passes: passesRes.rows.map((row) => ({
          id: row.id,
          passCode: row.pass_code,
          status: row.status,
          issuedAt: row.issued_at,
          usedAt: row.used_at,
          eventId: row.event_id,
          eventTitle: row.event_title,
          eventDate: row.event_date ? String(row.event_date).slice(0, 10) : null,
          eventStartTime: row.event_start_time ? String(row.event_start_time).slice(0, 5) : null,
        })),
      },
    });
  } catch (err) {
    console.error("Wallet/pass error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/loyalty ───────────────────────────────────────────────────

// GET /api/loyalty/my-history
app.get("/api/loyalty/my-history", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT lt.*,
              CASE WHEN lt.type = 'earn' OR lt.points > 0 THEN 'earned' ELSE 'redeemed' END AS movement_type
       FROM loyalty_transactions lt
       WHERE lt.user_id = $1
       ORDER BY lt.created_at DESC
       LIMIT 100`,
      [req.userId]
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("Loyalty/my-history error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/loyalty/rewards
app.get("/api/loyalty/rewards", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM loyalty_rewards WHERE is_active = true ORDER BY points_cost ASC"
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("Loyalty/rewards error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/loyalty/redeem
app.post("/api/loyalty/redeem", authMiddleware, async (req, res) => {
  const { rewardId } = req.body;
  if (!rewardId) return res.status(400).json({ message: "rewardId requerido" });
  try {
    const rewardRes = await pool.query(
      "SELECT * FROM loyalty_rewards WHERE id = $1 AND is_active = true",
      [rewardId]
    );
    if (rewardRes.rows.length === 0) return res.status(404).json({ message: "Recompensa no encontrada" });
    const reward = rewardRes.rows[0];
    // Check user balance from loyalty_transactions
    const balanceRes = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points WHEN type='adjust' THEN points ELSE -points END), 0) AS balance FROM loyalty_transactions WHERE user_id = $1",
      [req.userId]
    );
    const balance = parseInt(balanceRes.rows[0].balance);
    if (balance < reward.points_cost) {
      return res.status(400).json({ message: `Necesitas ${reward.points_cost} puntos. Tienes ${balance}.` });
    }
    // Deduct points via loyalty_transactions (type=redeem)
    await pool.query(
      "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'redeem', $2, $3)",
      [req.userId, reward.points_cost, `Canje: ${reward.name}`]
    );
    // Decrement stock if limited
    if (reward.stock !== null) {
      await pool.query("UPDATE loyalty_rewards SET stock = stock - 1 WHERE id = $1 AND stock > 0", [rewardId]);
    }
    triggerWalletPassSync(req.userId, "loyalty_redeem");
    return res.json({ message: `¡Recompensa canjeada! ${reward.name}` });
  } catch (err) {
    console.error("Loyalty/redeem error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Google Wallet helpers ──────────────────────────────────────────────────

const SITE_URL = process.env.SITE_URL || "https://varre24.com";
const GW_ISSUER_ID = process.env.GOOGLE_ISSUER_ID || "";
const GW_ISSUER_NAME = process.env.GOOGLE_ISSUER_NAME || "VARRE24";
const GW_PROGRAM_NAME = process.env.GOOGLE_PROGRAM_NAME || "VARRE24 Club";
const GW_HEX_BG = process.env.GOOGLE_HEX_BACKGROUND_COLOR || "#260910";
const GW_HEX_BG_EVENT = process.env.GOOGLE_HEX_BACKGROUND_COLOR_EVENT || "#260910";

/**
 * Parse the Google Service Account private key from various env var formats.
 * Supports:
 *  - GOOGLE_SA_KEY_JSON_BASE64: the entire service-account JSON file base64-encoded (easiest)
 *  - GOOGLE_SA_PRIVATE_KEY: just the private key PEM (escaped \\n, raw, or base64-encoded)
 */
function parseGWServiceAccount() {
  let email = process.env.GOOGLE_SA_EMAIL || "";
  let key = "";

  // Option A: whole JSON file base64-encoded (e.g. cat sa.json | base64 -w0 | pbcopy)
  const jsonB64 = process.env.GOOGLE_SA_KEY_JSON_BASE64 || "";
  if (jsonB64) {
    try {
      const decoded = Buffer.from(jsonB64, "base64").toString("utf8");
      const sa = JSON.parse(decoded);
      if (sa.private_key) key = sa.private_key;
      if (sa.client_email && !email) email = sa.client_email;
      console.log("GW Key: parsed from GOOGLE_SA_KEY_JSON_BASE64 ✓");
    } catch (e) {
      console.error("Failed to parse GOOGLE_SA_KEY_JSON_BASE64:", e.message);
    }
  }

  // Option B: separate GOOGLE_SA_PRIVATE_KEY env var
  if (!key) {
    let raw = process.env.GOOGLE_SA_PRIVATE_KEY || "";
    if (raw) {
      // Step 1: URL-decode if needed (Railway sometimes encodes)
      if (raw.includes("%3D") || raw.includes("%2B") || raw.includes("%2F")) {
        try { raw = decodeURIComponent(raw); } catch (_) { }
      }
      // Step 2: If it's a JSON-escaped string (starts with "), unwrap it
      if (raw.startsWith('"') || raw.startsWith("'")) {
        try { raw = JSON.parse(raw); } catch (_) {
          raw = raw.slice(1, -1); // strip quotes manually
        }
      }
      // Step 3: If the whole thing looks like base64 (no PEM markers), decode
      if (!raw.includes("-----BEGIN") && !raw.includes("\\n") && raw.length > 100) {
        try {
          const decoded = Buffer.from(raw, "base64").toString("utf8");
          if (decoded.includes("-----BEGIN") || decoded.includes("PRIVATE KEY")) raw = decoded;
        } catch (_) { }
      }
      // Step 4: Replace escaped newlines (\\n → \n, plus double-escaped)
      raw = raw.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
      // Step 5: Reconstruct PEM if markers exist but no real newlines between them
      if (raw.includes("-----BEGIN") && raw.includes("-----END")) {
        // Ensure proper line breaks around the markers
        raw = raw
          .replace(/(-----BEGIN [A-Z ]+-----)\s*/g, "$1\n")
          .replace(/\s*(-----END [A-Z ]+-----)/g, "\n$1");
        // If the body between markers has no newlines, it's the base64 blob — add line breaks every 64 chars
        const match = raw.match(/(-----BEGIN [A-Z ]+-----)\n?([\s\S]*?)\n?(-----END [A-Z ]+-----)/);
        if (match) {
          const body = match[2].replace(/\s+/g, ""); // strip all whitespace from body
          const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
          raw = `${match[1]}\n${wrapped}\n${match[3]}`;
        }
      }
      key = raw.trim();
      console.log("GW Key: parsed from GOOGLE_SA_PRIVATE_KEY, length=" + key.length + ", hasPEM=" + key.includes("-----BEGIN"));
    }
  }

  // Validate the key can be used for RS256
  if (key) {
    try {
      crypto.createPrivateKey(key);
      console.log("GW Key: ✅ Valid RSA private key");
    } catch (e) {
      console.error("GW Key: ⚠️ Key validation failed:", e.message);
      // Last resort: try wrapping in PKCS#8 markers if missing
      if (!key.includes("-----BEGIN")) {
        const body = key.replace(/\s+/g, "");
        const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
        key = `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
        try {
          crypto.createPrivateKey(key);
          console.log("GW Key: ✅ Valid after adding PEM headers");
        } catch (e2) {
          console.error("GW Key: ❌ Still invalid after adding headers:", e2.message);
          key = ""; // unset — will disable Google Wallet gracefully
        }
      } else {
        key = ""; // unset — will disable Google Wallet gracefully
      }
    }
  }

  return { email, key };
}

const { email: _gwEmail, key: _gwKey } = parseGWServiceAccount();
const GW_SA_EMAIL = _gwEmail;
const GW_SA_PRIVATE_KEY = _gwKey;
const GW_CLASS_ID = GW_ISSUER_ID ? `${GW_ISSUER_ID}.pilatesroom_loyalty_v1` : "";

function isGoogleWalletConfigured() {
  return !!(GW_ISSUER_ID && GW_SA_EMAIL && GW_SA_PRIVATE_KEY);
}

/** Get OAuth2 access token for Google Wallet API using service account */
async function getGoogleWalletAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: GW_SA_EMAIL,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const saJwt = jwt.sign(claim, GW_SA_PRIVATE_KEY, { algorithm: "RS256" });
  const resp = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: saJwt,
  }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return resp.data.access_token;
}

/** Create or update the Google Wallet Loyalty Class (run once at startup) */
async function ensureGoogleWalletClass() {
  if (!isGoogleWalletConfigured()) return;
  try {
    const token = await getGoogleWalletAccessToken();
    const classObj = {
      id: GW_CLASS_ID,
      issuerName: GW_ISSUER_NAME,
      programName: GW_PROGRAM_NAME,
      programLogo: {
        sourceUri: { uri: `${SITE_URL}/wallet-program-black.png` },
        contentDescription: { defaultValue: { language: "es", value: "VARRE24" } },
      },
      heroImage: {
        sourceUri: { uri: `${SITE_URL}/wallet-hero-black.png` },
        contentDescription: { defaultValue: { language: "es", value: "VARRE24" } },
      },
      hexBackgroundColor: GW_HEX_BG,
      reviewStatus: "UNDER_REVIEW",
      countryCode: "MX",
      multipleDevicesAndHoldersAllowedStatus: "MULTIPLE_HOLDERS",
      localizedIssuerName: { defaultValue: { language: "es", value: GW_ISSUER_NAME } },
      localizedProgramName: { defaultValue: { language: "es", value: GW_PROGRAM_NAME } },
    };
    // Try to GET the class first
    try {
      await axios.get(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${GW_CLASS_ID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // If exists, update it
      await axios.put(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${GW_CLASS_ID}`, classObj, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      console.log("✅ Google Wallet loyalty class updated:", GW_CLASS_ID);
    } catch (getErr) {
      if (getErr.response?.status === 404) {
        // Create new class
        await axios.post("https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass", classObj, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        console.log("✅ Google Wallet loyalty class created:", GW_CLASS_ID);
      } else {
        throw getErr;
      }
    }
  } catch (err) {
    console.error("⚠️  Google Wallet class setup error:", err.response?.data || err.message);
  }
}

function formatWalletEventSchedule(eventPass) {
  if (!eventPass?.eventDate) return "";
  const eventDate = new Date(eventPass.eventDate);
  if (Number.isNaN(eventDate.getTime())) return "";
  const dateLabel = eventDate.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const startTime = eventPass.eventStartTime ? String(eventPass.eventStartTime).slice(0, 5) : "";
  const endTime = eventPass.eventEndTime ? String(eventPass.eventEndTime).slice(0, 5) : "";
  const timeLabel = startTime && endTime ? `${startTime} - ${endTime}` : (startTime || "");
  return `${dateLabel}${timeLabel ? ` · ${timeLabel}` : ""}`.trim();
}

/** Build a Google Wallet Save URL (JWT) for a user
 *  @param {Object} opts
 *  @param {string} opts.userId
 *  @param {string} opts.userName
 *  @param {number} opts.points
 *  @param {string} opts.qrCode
 *  @param {Object|null} opts.membership  - { plan_name, class_limit, classes_remaining, end_date, start_date }
 *  @param {Object|null} opts.nextBooking - { class_name, instructor_name, date, start_time }
 *  @param {Object|null} opts.activeEventPass - { eventTitle, eventDate, eventStartTime, eventEndTime, eventLocation, passCode }
 */
function buildGoogleWalletSaveUrl({ userId, userName, points, qrCode, membership, nextBooking, activeEventPass, passKind = "membership" }) {
  const isEventPass = String(passKind || "membership") === "event";
  const objectId = isEventPass
    ? `${GW_ISSUER_ID}.pn_event_${String(activeEventPass?.eventId || "event").replace(/-/g, "")}_${userId.replace(/-/g, "")}`
    : `${GW_ISSUER_ID}.pn_${userId.replace(/-/g, "")}`;

  // ── Determine pass type and details based on membership ──────────────────
  const hasMembership = !isEventPass && !!membership;
  const hasEventPass = isEventPass && !!activeEventPass;
  const showFullGooglePassText = parseBooleanFlag(process.env.GOOGLE_WALLET_SHOW_FULL_TEXT || false);
  const compactEventMode = hasEventPass && !showFullGooglePassText;
  const eventSchedule = formatWalletEventSchedule(activeEventPass);
  const eventTitle = activeEventPass?.eventTitle || "Evento especial";
  const membershipCategory = hasMembership
    ? normalizeClassCategory(membership.class_category, "all")
    : "all";
  const membershipCategoryLabel =
    membershipCategory === "pilates" ? "Pilates" :
      membershipCategory === "bienestar" ? "Bienestar" :
        membershipCategory === "funcional" ? "Funcional" :
          membershipCategory === "mixto" ? "Mixto" : "General";
  const isUnlimited = hasMembership && (membership.class_limit === null || membership.class_limit >= 9999);
  const classLimit = Number(membership?.class_limit ?? 0);
  const hasIconStampMode = hasMembership && !isUnlimited && classLimit > 0;
  const isPackage = hasMembership && !isUnlimited && membership.class_limit > 1;
  const isSingleClass = hasMembership && !isUnlimited && membership.class_limit === 1;
  const isTrialSingleSession = hasMembership && String(membership.repeat_key || "").startsWith("trial_single_session");
  const nonTransferable = hasMembership && parseBooleanFlag(membership.is_non_transferable);
  const nonRepeatable = hasMembership && parseBooleanFlag(membership.is_non_repeatable);

  // Header label
  let passHeader = "VARRE24 CLUB";
  if (hasEventPass) {
    passHeader = "PASE DE EVENTO";
  } else if (hasMembership) {
    if (isUnlimited) passHeader = "MEMBRESÍA";
    else if (isPackage) passHeader = "PAQUETE";
    else if (isSingleClass) passHeader = "CLASE INDIVIDUAL";
  }

  // ── Build textModulesData rows ───────────────────────────────────────────
  const textModules = [];

  if (hasEventPass) {
    textModules.push({
      id: "event_title",
      header: "EVENTO ACTIVO",
      body: eventTitle,
    });
    if (eventSchedule) {
      textModules.push({
        id: "event_schedule",
        header: "FECHA Y HORA",
        body: eventSchedule,
      });
    }
    if (!compactEventMode && activeEventPass?.eventLocation) {
      textModules.push({
        id: "event_location",
        header: "LUGAR",
        body: activeEventPass.eventLocation,
      });
    }
    if (!compactEventMode && activeEventPass?.passCode) {
      textModules.push({
        id: "event_code",
        header: "CÓDIGO EVENTO",
        body: activeEventPass.passCode,
      });
    }
  }

  if (!compactEventMode && !isEventPass) {
    // Row 1: Plan Name
    if (hasMembership) {
      textModules.push({
        id: "plan",
        header: passHeader,
        body: membership.plan_name || "Plan Activo",
      });
      textModules.push({
        id: "modalidad",
        header: "MODALIDAD",
        body: membershipCategoryLabel,
      });
    } else {
      textModules.push({
        id: "plan",
        header: "ESTADO",
        body: "Sin membresía activa",
      });
    }

    // Row 2: Vigencia (valid until)
    if (hasMembership && membership.end_date) {
      const endDate = new Date(membership.end_date);
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
      const endFormatted = endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
      textModules.push({
        id: "vigencia",
        header: "VIGENTE HASTA",
        body: `${endFormatted} (${daysLeft} días restantes)`,
      });
    }

    // Row 3: Classes info
    if (hasMembership) {
      if (isUnlimited) {
        textModules.push({
          id: "clases",
          header: "CLASES",
          body: "♾️ Ilimitadas",
        });
      } else if (membership.class_limit && !hasIconStampMode) {
        const used = Math.max(0, (membership.class_limit || 0) - (membership.classes_remaining || 0));
        textModules.push({
          id: "clases",
          header: "CLASES DISPONIBLES",
          body: `${membership.classes_remaining ?? 0} de ${membership.class_limit} restantes (${used} usadas)`,
        });
      }
    }

    // Row 3.1: Membership rules
    if (hasMembership) {
      const rules = [];
      if (nonTransferable) rules.push("No transferible");
      if (nonRepeatable) rules.push("No repetible");
      if (rules.length) {
        textModules.push({
          id: "reglas",
          header: "REGLAS",
          body: rules.join(" · "),
        });
      }
    }

    // Row 4: Next class
    if (nextBooking) {
      const bookingDate = new Date(nextBooking.date);
      const dateStr = bookingDate.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
      const timeStr = nextBooking.start_time ? String(nextBooking.start_time).substring(0, 5) : "";
      textModules.push({
        id: "next_class",
        header: "PRÓXIMA CLASE",
        body: `${nextBooking.class_name || "Clase"} — ${dateStr} ${timeStr}`,
      });
      if (nextBooking.instructor_name) {
        textModules.push({
          id: "instructor",
          header: "INSTRUCTORA",
          body: nextBooking.instructor_name,
        });
      }
    }
  }

  // Row 5: Points
  textModules.push({
    id: "puntos",
    header: "PUNTOS VARRE24",
    body: `${points.toLocaleString("es-MX")} pts`,
  });

  const infoRows = [];
  if (compactEventMode) {
    infoRows.push({
      columns: [
        { label: "Evento", value: eventTitle },
        { label: "Fecha", value: eventSchedule || "—" },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Código", value: activeEventPass?.passCode || "—" },
        { label: "Puntos", value: String(points) },
      ],
    });
  } else if (hasEventPass) {
    infoRows.push({
      columns: [
        { label: "Evento", value: eventTitle },
        { label: "Código", value: activeEventPass.passCode || "—" },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Horario", value: eventSchedule || "—" },
        { label: "Sede", value: activeEventPass.eventLocation || "—" },
      ],
    });
  }
  if (hasMembership) {
    infoRows.push({
      columns: [
        { label: "Miembro", value: userName },
        { label: "Plan", value: membership.plan_name || "—" },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Modalidad", value: membershipCategoryLabel },
        { label: "Reglas", value: [nonTransferable ? "No transferible" : "", nonRepeatable ? "No repetible" : ""].filter(Boolean).join(" · ") || "—" },
      ],
    });
  } else {
    infoRows.push({
      columns: [
        { label: "Miembro", value: userName },
        { label: "Puntos", value: String(points) },
      ],
    });
  }

  // ── Build loyaltyObject ──────────────────────────────────────────────────
  const loyaltyObject = {
    id: objectId,
    classId: GW_CLASS_ID,
    state: "ACTIVE",
    accountId: userId,
    accountName: userName,
    hexBackgroundColor: hasEventPass ? GW_HEX_BG_EVENT : GW_HEX_BG,
    barcode: {
      type: "QR_CODE",
      value: qrCode,
    },
    loyaltyPoints: {
      balance: { int: points },
      label: "PUNTOS",
    },
    header: {
      defaultValue: { language: "es", value: passHeader },
    },
    textModulesData: textModules,
    linksModuleData: {
      uris: [
        { uri: `${SITE_URL}/app/wallet`, description: "Mi Wallet", id: "wallet_link" },
        {
          uri: hasEventPass ? `${SITE_URL}/app/events` : `${SITE_URL}/app/bookings`,
          description: hasEventPass ? "Mis Eventos" : "Reservar Clase",
          id: hasEventPass ? "events_link" : "book_link",
        },
      ],
    },
    infoModuleData: {
      showLastUpdateTime: true,
      labelValueRows: infoRows,
    },
  };

  const payload = {
    iss: GW_SA_EMAIL,
    aud: "google",
    origins: [SITE_URL],
    typ: "savetowallet",
    payload: {
      loyaltyObjects: [loyaltyObject],
    },
  };
  const signedJwt = jwt.sign(payload, GW_SA_PRIVATE_KEY, { algorithm: "RS256" });
  return `https://pay.google.com/gp/v/save/${signedJwt}`;
}

// ─── Routes: /api/wallet/google ─────────────────────────────────────────────

// GET /api/wallet/google/save-url — returns Save URL for logged-in user
app.get("/api/wallet/google/save-url", authMiddleware, async (req, res) => {
  if (!isGoogleWalletConfigured()) {
    return res.status(503).json({ message: "Google Wallet no configurado", detail: { issuer: !!GW_ISSUER_ID, email: !!GW_SA_EMAIL, key: !!GW_SA_PRIVATE_KEY } });
  }
  try {
    // Ensure loyalty class exists (best-effort — don't fail the request if this errors)
    try {
      await ensureGoogleWalletClass();
    } catch (classErr) {
      console.error("Google Wallet class ensure error (non-fatal):", classErr.response?.data || classErr.message);
    }
    const snapshot = await getWalletSnapshotForUser(req.userId);
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    const saveUrl = buildGoogleWalletSaveUrl({ ...snapshot, activeEventPass: null, passKind: "membership" });
    return res.json({ data: { saveUrl } });
  } catch (err) {
    console.error("Google Wallet save-url error:", err.response?.data || err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
    return res.status(500).json({ message: "Error generando pase de Google Wallet", detail: err.message });
  }
});

// GET /api/wallet/events/google/save-url — returns event-specific Save URL for logged-in user
app.get("/api/wallet/events/google/save-url", authMiddleware, async (req, res) => {
  if (!isGoogleWalletConfigured()) {
    return res.status(503).json({ message: "Google Wallet no configurado", detail: { issuer: !!GW_ISSUER_ID, email: !!GW_SA_EMAIL, key: !!GW_SA_PRIVATE_KEY } });
  }
  try {
    const eventIdRaw = String(req.query?.eventId || "").trim();
    const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventIdRaw)
      ? eventIdRaw
      : null;
    if (!eventId) return res.status(400).json({ message: "eventId inválido" });

    try {
      await ensureGoogleWalletClass();
    } catch (classErr) {
      console.error("Google Wallet class ensure error (non-fatal):", classErr.response?.data || classErr.message);
    }

    const snapshot = await getWalletSnapshotForUser(req.userId, { eventId });
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    if (!snapshot.activeEventPass) {
      return res.status(404).json({ message: "No existe pase activo para ese evento" });
    }
    const saveUrl = buildGoogleWalletSaveUrl({
      ...snapshot,
      membership: null,
      nextBooking: null,
      passKind: "event",
    });
    return res.json({ data: { saveUrl } });
  } catch (err) {
    console.error("Google Wallet event save-url error:", err.response?.data || err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
    return res.status(500).json({ message: "Error generando pase de evento en Google Wallet", detail: err.message });
  }
});

// GET /api/wallet/google/diagnostics — check env config (admin only)
app.get("/api/wallet/google/diagnostics", adminMiddleware, async (_req, res) => {
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY || "";
  const keyPreview = GW_SA_PRIVATE_KEY
    ? `parsed_length=${GW_SA_PRIVATE_KEY.length}, hasNewlines=${GW_SA_PRIVATE_KEY.includes("\n")}, begins=${GW_SA_PRIVATE_KEY.substring(0, 32)}…`
    : "❌ missing";
  const rawKeyPreview = rawKey
    ? `raw_length=${rawKey.length}, hasBeginMarker=${rawKey.includes("-----BEGIN")}, hasLiteralBackslashN=${rawKey.includes("\\n")}`
    : "❌ env var not set";

  // Test JWT signing
  let jwtSignTest = "not tested";
  if (GW_SA_EMAIL && GW_SA_PRIVATE_KEY) {
    try {
      jwt.sign({ iss: GW_SA_EMAIL, aud: "test", iat: Math.floor(Date.now() / 1000) }, GW_SA_PRIVATE_KEY, { algorithm: "RS256" });
      jwtSignTest = "✅ JWT signing works";
    } catch (e) {
      jwtSignTest = `❌ JWT signing failed: ${e.message}`;
    }
  }

  // Test OAuth token
  let oauthTest = "not tested";
  if (isGoogleWalletConfigured()) {
    try {
      const token = await getGoogleWalletAccessToken();
      oauthTest = `✅ Got access token (${token.substring(0, 10)}...)`;
    } catch (e) {
      oauthTest = `❌ OAuth failed: ${e.response?.data?.error_description || e.message}`;
    }
  }

  return res.json({
    configured: isGoogleWalletConfigured(),
    issuerId: GW_ISSUER_ID ? `✅ ${GW_ISSUER_ID}` : "❌ missing",
    saEmail: GW_SA_EMAIL ? `✅ ${GW_SA_EMAIL}` : "❌ missing",
    saPrivateKey: keyPreview,
    rawKeyInfo: rawKeyPreview,
    classId: GW_CLASS_ID || "N/A",
    issuerName: GW_ISSUER_NAME,
    programName: GW_PROGRAM_NAME,
    jwtSignTest,
    oauthTest,
  });
});

// ─── Apple Wallet config ────────────────────────────────────────────────────

const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "";
const APPLE_PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID || "";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || "";
const APPLE_APNS_KEY_BASE64 = process.env.APPLE_APNS_KEY_BASE64 || "";
const APPLE_AUTH_TOKEN = process.env.APPLE_AUTH_TOKEN || crypto.randomBytes(32).toString("hex");
const APPLE_CERT_PASSWORD = process.env.APPLE_CERT_PASSWORD || "";

// ── Certificate loading: files first, then base64 env vars ──────────────────
// Priority 1: Read from files in wallet-assets/apple-pass/
// Priority 2: Decode from base64 env vars (APPLE_SIGNER_CERT_BASE64, etc.)

function safeExists(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath);
  } catch (_) {
    return false;
  }
}

function normalizePemText(value) {
  if (!value) return "";
  return String(value)
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function looksLikeBase64(value) {
  const raw = String(value || "").replace(/\s/g, "");
  if (raw.length < 100) return false;
  return /^[A-Za-z0-9+/=]+$/.test(raw);
}

const WALLET_ASSET_DIR_CANDIDATES = [
  process.env.APPLE_PASS_CERT_DIR,
  path.join(__dirname, "..", "wallet-assets", "apple-pass"),
  path.join(__dirname, "wallet-assets", "apple-pass"),
  path.join(process.cwd(), "wallet-assets", "apple-pass"),
  "/app/wallet-assets/apple-pass",
  "/app/server/wallet-assets/apple-pass",
].filter(Boolean);

const WALLET_ASSETS_DIR = WALLET_ASSET_DIR_CANDIDATES.find((dir) => safeExists(dir)) || WALLET_ASSET_DIR_CANDIDATES[0];

const CERT_FILE_CANDIDATES = {
  cert: [
    process.env.APPLE_PASS_CERT_PATH,
    process.env.APPLE_PASS_CERT,
    path.join(WALLET_ASSETS_DIR, "pass.pem"),
    path.join(WALLET_ASSETS_DIR, "certificate.pem"),
  ].filter(Boolean),
  key: [
    process.env.APPLE_PASS_KEY_PATH,
    process.env.APPLE_PASS_KEY,
    path.join(WALLET_ASSETS_DIR, "pass.key"),
    path.join(WALLET_ASSETS_DIR, "private.key"),
  ].filter(Boolean),
  wwdr: [
    process.env.APPLE_PASS_WWDR_PATH,
    process.env.APPLE_PASS_WWDR,
    path.join(WALLET_ASSETS_DIR, "wwdr.pem"),
    path.join(WALLET_ASSETS_DIR, "AppleWWDRCA.pem"),
    path.join(WALLET_ASSETS_DIR, "wwdr_rsa.pem"),
  ].filter(Boolean),
};

/** Try to load PEM from file, return empty string if not found */
function loadCertFile(filePath) {
  try {
    if (safeExists(filePath)) {
      const content = normalizePemText(fs.readFileSync(filePath, "utf8"));
      if (content.includes("-----BEGIN")) {
        console.log(`[Apple Wallet] ✅ Loaded cert from file: ${filePath} (${content.length} chars)`);
        return content;
      }
    }
  } catch (e) {
    console.error(`[Apple Wallet] ❌ Error reading ${filePath}:`, e.message);
  }
  return "";
}

function loadFirstCertFile(paths = []) {
  for (const p of paths) {
    const cert = loadCertFile(p);
    if (cert) return cert;
  }
  return "";
}

/** Decode base64 env var to PEM, ensuring proper PEM formatting */
function decodeBase64ToPem(b64, label = "CERTIFICATE") {
  if (!b64) return "";
  try {
    let raw = Buffer.from(String(b64), "base64").toString("utf8").trim();
    if (!raw) return "";
    if (raw.includes("-----BEGIN")) {
      return normalizePemText(raw);
    }
    const cleanB64 = String(b64).replace(/[\s\n\r]/g, "");
    if (!cleanB64) return "";
    const lines = cleanB64.match(/.{1,64}/g) || [cleanB64];
    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
  } catch (_) {
    return "";
  }
}

function loadPemFromEnvValue(value, label = "CERTIFICATE") {
  const raw = normalizePemText(value || "");
  if (!raw) return "";
  if (raw.includes("-----BEGIN")) return raw;
  if (safeExists(raw)) return loadCertFile(raw);
  if (looksLikeBase64(raw)) return decodeBase64ToPem(raw, label);
  return "";
}

const CERT_FILE_PATHS = {
  cert: CERT_FILE_CANDIDATES.cert.find((p) => safeExists(p)) || CERT_FILE_CANDIDATES.cert[0] || "",
  key: CERT_FILE_CANDIDATES.key.find((p) => safeExists(p)) || CERT_FILE_CANDIDATES.key[0] || "",
  wwdr: CERT_FILE_CANDIDATES.wwdr.find((p) => safeExists(p)) || CERT_FILE_CANDIDATES.wwdr[0] || "",
};

// Load certs: env PEM/path first, then files, then base64 env vars
const APPLE_SIGNER_CERT_PEM =
  loadPemFromEnvValue(process.env.APPLE_SIGNER_CERT_PEM || process.env.APPLE_PASS_CERT_PEM || process.env.APPLE_PASS_CERT, "CERTIFICATE")
  || loadFirstCertFile(CERT_FILE_CANDIDATES.cert)
  || decodeBase64ToPem(process.env.APPLE_SIGNER_CERT_BASE64 || process.env.APPLE_PASS_CERT_BASE64 || "", "CERTIFICATE");

const APPLE_SIGNER_KEY_PEM =
  loadPemFromEnvValue(process.env.APPLE_SIGNER_KEY_PEM || process.env.APPLE_PASS_KEY_PEM || process.env.APPLE_PASS_KEY, "PRIVATE KEY")
  || loadFirstCertFile(CERT_FILE_CANDIDATES.key)
  || decodeBase64ToPem(process.env.APPLE_SIGNER_KEY_BASE64 || process.env.APPLE_PASS_KEY_BASE64 || "", "PRIVATE KEY");

const APPLE_WWDR_CERT_PEM =
  loadPemFromEnvValue(process.env.APPLE_WWDR_CERT_PEM || process.env.APPLE_PASS_WWDR_PEM || process.env.APPLE_PASS_WWDR, "CERTIFICATE")
  || loadFirstCertFile(CERT_FILE_CANDIDATES.wwdr)
  || decodeBase64ToPem(process.env.APPLE_WWDR_CERT_BASE64 || process.env.APPLE_PASS_WWDR_BASE64 || "", "CERTIFICATE");

const APPLE_APNS_KEY_PEM =
  loadPemFromEnvValue(process.env.APPLE_APNS_KEY_PEM || process.env.APPLE_APNS_KEY || process.env.APPLE_APNS_KEY_PATH, "PRIVATE KEY")
  || decodeBase64ToPem(APPLE_APNS_KEY_BASE64 || "", "PRIVATE KEY");
const APPLE_APNS_HOST = process.env.APPLE_APNS_HOST || "https://api.push.apple.com";

function isAppleWalletConfigured() {
  return !!(APPLE_TEAM_ID && APPLE_PASS_TYPE_ID && APPLE_SIGNER_CERT_PEM && APPLE_SIGNER_KEY_PEM && APPLE_WWDR_CERT_PEM);
}

function isAppleApnsConfigured() {
  return !!(APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PASS_TYPE_ID && APPLE_APNS_KEY_PEM);
}

function buildAppleWalletSerialFromUserId(userId) {
  const cleaned = String(userId || "").trim();
  if (!cleaned) return "";
  return `pn_${cleaned.replace(/-/g, "")}`;
}

function parseUserIdFromAppleWalletSerial(serial) {
  const raw = String(serial || "").replace(/^pn_/, "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(raw)) return null;
  return raw.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5").toLowerCase();
}

function truncateWalletField(value, max = 26) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Find image assets — check both public/ and dist/ directories */
function findAssetDir() {
  const candidates = [
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "dist"),
    path.join(__dirname, "..", "dist", "public"),
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "dist"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "pn-logo.png"))) {
      return dir;
    }
  }
  return candidates[0];
}

/** Find the first existing asset file by trying file names across common asset dirs. */
function findAssetFile(fileNames = []) {
  const dirs = [
    findAssetDir(),
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "src", "assets"),
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "src", "assets"),
  ];
  const checked = new Set();
  for (const dir of dirs) {
    if (!dir || checked.has(dir)) continue;
    checked.add(dir);
    for (const name of fileNames) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) return fullPath;
    }
  }
  return null;
}

const WALLET_STRIP_TOTAL_BUCKETS = [1, 4, 8, 12, 16, 20];

function resolveWalletStripStampState(classLimitRaw, classesRemainingRaw) {
  const classLimit = Number(classLimitRaw ?? 0);
  const classesRemaining = Math.max(0, Number(classesRemainingRaw ?? 0));
  if (!Number.isFinite(classLimit) || classLimit <= 0) {
    return { total: 0, remaining: 0 };
  }
  const nearestTotal = WALLET_STRIP_TOTAL_BUCKETS.reduce((best, current) =>
    Math.abs(current - classLimit) < Math.abs(best - classLimit) ? current : best,
    WALLET_STRIP_TOTAL_BUCKETS[0]);
  const ratio = classLimit > 0 ? Math.min(1, Math.max(0, classesRemaining / classLimit)) : 0;
  const remainingBucket = Math.min(nearestTotal, Math.max(0, Math.round(ratio * nearestTotal)));
  return { total: nearestTotal, remaining: remainingBucket };
}

const appleApnsProviderTokenCache = {
  token: "",
  expiresAtMs: 0,
};

function getAppleApnsProviderToken() {
  const now = Date.now();
  if (appleApnsProviderTokenCache.token && appleApnsProviderTokenCache.expiresAtMs > now + 30_000) {
    return appleApnsProviderTokenCache.token;
  }
  if (!isAppleApnsConfigured()) {
    throw new Error("Apple APNS no configurado");
  }
  const iat = Math.floor(now / 1000);
  const token = jwt.sign(
    { iss: APPLE_TEAM_ID, iat },
    APPLE_APNS_KEY_PEM,
    {
      algorithm: "ES256",
      header: { alg: "ES256", kid: APPLE_KEY_ID },
    },
  );
  // Apple recomienda reutilizar por hasta 60 min. Renovamos cada 50 min.
  appleApnsProviderTokenCache.token = token;
  appleApnsProviderTokenCache.expiresAtMs = now + 50 * 60 * 1000;
  return token;
}

function shouldPruneApplePushToken(pushResult) {
  if (!pushResult || pushResult.ok) return false;
  if (pushResult.status === 410) return true;
  const badReasons = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);
  return pushResult.status === 400 && badReasons.has(pushResult.reason);
}

function sendApplePassUpdatedPush(pushToken, providerToken) {
  return new Promise((resolve) => {
    const session = http2.connect(APPLE_APNS_HOST);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { session.close(); } catch (_) { }
      resolve(result);
    };
    session.setTimeout(12_000, () => finish({ ok: false, status: 0, reason: "APNS timeout", pushToken }));
    session.on("error", (err) => finish({ ok: false, status: 0, reason: err.message, pushToken }));

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      authorization: `bearer ${providerToken}`,
      "apns-topic": APPLE_PASS_TYPE_ID,
      "apns-push-type": "background",
      "apns-priority": "5",
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers?.[":status"] || 0);
    });
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      let reason = "";
      if (body) {
        try {
          reason = JSON.parse(body)?.reason || "";
        } catch (_) {
          reason = body.slice(0, 120);
        }
      }
      finish({ ok: status === 200, status, reason, pushToken });
    });
    req.on("error", (err) => finish({ ok: false, status: 0, reason: err.message, pushToken }));
    req.end("{}");
  });
}

async function getWalletSnapshotForUser(userId, { eventId = null } = {}) {
  const userRes = await pool.query("SELECT id, email, display_name FROM users WHERE id = $1 LIMIT 1", [userId]);
  if (!userRes.rows.length) return null;
  const user = userRes.rows[0];
  const userName = user.display_name || user.email;

  const pointsRes = await pool.query(
    "SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points WHEN type='adjust' THEN points ELSE -points END), 0) AS total FROM loyalty_transactions WHERE user_id = $1",
    [userId],
  );
  const points = parseInt(pointsRes.rows[0]?.total ?? 0, 10) || 0;

  let membership = null;
  try {
    const memRes = await pool.query(
      `SELECT m.id, m.status, m.classes_remaining, m.start_date, m.end_date,
              m.plan_name_override, m.class_limit_override,
              p.name AS plan_name, p.class_limit AS plan_class_limit,
              p.class_category, p.is_non_transferable, p.is_non_repeatable, p.repeat_key
       FROM memberships m
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1 AND m.status = 'active' AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
       ORDER BY m.end_date DESC NULLS LAST
       LIMIT 1`,
      [userId],
    );
    if (memRes.rows.length > 0) {
      const m = memRes.rows[0];
      membership = {
        plan_name: m.plan_name_override || m.plan_name || "Plan Activo",
        class_limit: m.class_limit_override ?? m.plan_class_limit,
        classes_remaining: m.classes_remaining,
        start_date: m.start_date,
        end_date: m.end_date,
        class_category: normalizeClassCategory(m.class_category, "all"),
        is_non_transferable: parseBooleanFlag(m.is_non_transferable),
        is_non_repeatable: parseBooleanFlag(m.is_non_repeatable),
        repeat_key: m.repeat_key || null,
      };
    }
  } catch (err) {
    console.error("[Wallet] membership snapshot error:", err.message);
  }

  let nextBooking = null;
  try {
    const bookRes = await pool.query(
      `SELECT c.date, c.start_time, ct.name AS class_name, i.display_name AS instructor_name
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       LEFT JOIN instructors i ON c.instructor_id = i.id
       WHERE b.user_id = $1
         AND b.status IN ('confirmed', 'waitlist')
         AND c.date >= CURRENT_DATE
       ORDER BY c.date ASC, c.start_time ASC
       LIMIT 1`,
      [userId],
    );
    if (bookRes.rows.length > 0) nextBooking = bookRes.rows[0];
  } catch (err) {
    console.error("[Wallet] next booking snapshot error:", err.message);
  }

  let activeEventPass = null;
  try {
    const params = [userId];
    const where = [
      "ep.user_id = $1",
      "ep.status = 'issued'",
      "e.status <> 'cancelled'",
    ];
    if (eventId) {
      params.push(eventId);
      where.push(`ep.event_id = $${params.length}`);
    } else {
      where.push(`(
        e.date > CURRENT_DATE
        OR (e.date = CURRENT_DATE AND (e.end_time IS NULL OR e.end_time >= CURRENT_TIME))
      )`);
    }
    const eventPassRes = await pool.query(
      `SELECT ep.id,
              ep.pass_code,
              ep.status,
              ep.issued_at,
              e.id AS event_id,
              e.title AS event_title,
              e.date AS event_date,
              e.start_time AS event_start_time,
              e.end_time AS event_end_time,
              e.location AS event_location
         FROM event_passes ep
         JOIN events e ON e.id = ep.event_id
        WHERE ${where.join("\n          AND ")}
        ORDER BY e.date ASC, e.start_time ASC, ep.issued_at DESC
        LIMIT 1`,
      params,
    );
    if (eventPassRes.rows.length > 0) {
      const ev = eventPassRes.rows[0];
      activeEventPass = {
        id: ev.id,
        passCode: ev.pass_code,
        status: ev.status,
        issuedAt: ev.issued_at,
        eventId: ev.event_id,
        eventTitle: ev.event_title || "Evento especial",
        eventDate: ev.event_date,
        eventStartTime: ev.event_start_time,
        eventEndTime: ev.event_end_time,
        eventLocation: ev.event_location || "",
      };
    }
  } catch (err) {
    console.error("[Wallet] active event pass snapshot error:", err.message);
  }

  return {
    userId,
    userName,
    points,
    qrCode: Buffer.from(String(userId)).toString("base64"),
    membership,
    nextBooking,
    activeEventPass,
  };
}

function decodeBase64UrlToObject(value) {
  if (!value) return null;
  try {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch (_) {
    return null;
  }
}

function extractGoogleLoyaltyObjectFromSaveUrl(saveUrl) {
  const token = String(saveUrl || "").split("/save/")[1] || "";
  const payloadPart = token.split(".")[1] || "";
  const decoded = decodeBase64UrlToObject(payloadPart);
  return decoded?.payload?.loyaltyObjects?.[0] || null;
}

async function syncGoogleWalletObjectForUser(userId, { reason = "wallet_update" } = {}) {
  if (!isGoogleWalletConfigured()) {
    return { synced: false, reason: "google_wallet_not_configured" };
  }
  const snapshot = await getWalletSnapshotForUser(userId);
  if (!snapshot) return { synced: false, reason: "user_not_found" };

  const saveUrl = buildGoogleWalletSaveUrl({ ...snapshot, activeEventPass: null, passKind: "membership" });
  const loyaltyObject = extractGoogleLoyaltyObjectFromSaveUrl(saveUrl);
  if (!loyaltyObject?.id) {
    return { synced: false, reason: "google_object_build_failed" };
  }

  try {
    await ensureGoogleWalletClass();
    const accessToken = await getGoogleWalletAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const objectIdPath = encodeURIComponent(loyaltyObject.id);
    try {
      await axios.put(
        `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectIdPath}`,
        loyaltyObject,
        { headers },
      );
      return { synced: true, mode: "updated", objectId: loyaltyObject.id };
    } catch (err) {
      if (err.response?.status !== 404) throw err;
      await axios.post(
        "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject",
        loyaltyObject,
        { headers },
      );
      return { synced: true, mode: "created", objectId: loyaltyObject.id };
    }
  } catch (err) {
    console.error(`[Google Wallet] sync failed (${reason}) user=${userId}:`, err.response?.data || err.message);
    return { synced: false, reason: err.message || "google_sync_failed" };
  }
}

async function notifyApplePassUpdatedForUser(userId, { reason = "wallet_update" } = {}) {
  const serial = buildAppleWalletSerialFromUserId(userId);
  if (!serial || !APPLE_PASS_TYPE_ID) {
    return { serial, touched: 0, sent: 0, failed: 0, reason: "missing_serial_or_pass_type" };
  }

  let touched = 0;
  try {
    const touchRes = await pool.query(
      "UPDATE apple_wallet_devices SET updated_at = NOW() WHERE pass_type_id = $1 AND serial_number = $2",
      [APPLE_PASS_TYPE_ID, serial],
    );
    touched = touchRes.rowCount || 0;
  } catch (err) {
    console.error("[Apple Wallet] touch serial error:", err.message);
  }

  const regRes = await pool.query(
    `SELECT device_id, push_token
     FROM apple_wallet_devices
     WHERE pass_type_id = $1 AND serial_number = $2 AND COALESCE(push_token, '') <> ''`,
    [APPLE_PASS_TYPE_ID, serial],
  ).catch(() => ({ rows: [] }));
  const pushTokens = [...new Set(regRes.rows.map((r) => String(r.push_token || "").trim()).filter(Boolean))];

  if (!pushTokens.length) {
    return { serial, touched, total: 0, sent: 0, failed: 0, reason: "no_registered_devices" };
  }

  if (!isAppleApnsConfigured()) {
    console.log(`[Apple Wallet] APNS no configurado; pase marcado para ${serial} (${reason})`);
    return { serial, touched, total: pushTokens.length, sent: 0, failed: 0, reason: "apns_not_configured" };
  }

  let providerToken = "";
  try {
    providerToken = getAppleApnsProviderToken();
  } catch (err) {
    console.error("[Apple Wallet] APNS token error:", err.message);
    return { serial, touched, total: pushTokens.length, sent: 0, failed: pushTokens.length, reason: "apns_token_error" };
  }

  const pushResults = [];
  for (const pushToken of pushTokens) {
    // Throttle light to reduce burst rate on APNS.
    const result = await sendApplePassUpdatedPush(pushToken, providerToken);
    pushResults.push(result);
    await new Promise((r) => setTimeout(r, 120));
  }

  const sent = pushResults.filter((r) => r.ok).length;
  const failed = pushResults.length - sent;
  const tokensToPrune = pushResults.filter(shouldPruneApplePushToken).map((r) => r.pushToken);
  if (tokensToPrune.length) {
    await pool.query(
      `UPDATE apple_wallet_devices
       SET push_token = '', updated_at = NOW()
       WHERE pass_type_id = $1 AND serial_number = $2 AND push_token = ANY($3::text[])`,
      [APPLE_PASS_TYPE_ID, serial, tokensToPrune],
    ).catch(() => { });
  }

  if (failed > 0) {
    const sampleReason = pushResults.find((r) => !r.ok)?.reason || "unknown";
    console.warn(`[Apple Wallet] push parcial serial=${serial}, sent=${sent}, failed=${failed}, reason=${sampleReason}`);
  }

  return { serial, touched, total: pushResults.length, sent, failed, reason: failed ? "partial_failure" : "ok" };
}

async function persistWalletNotificationLog(payload) {
  const userId = payload?.userId || null;
  const reason = String(payload?.reason || "wallet_update").slice(0, 160);
  const apple = payload?.apple || {};
  const google = payload?.google || {};
  const appleSent = Number(apple.sent || 0);
  const appleFailed = Number(apple.failed || 0);
  const googleSynced = !!google.synced;
  const googleMode = google.mode ? String(google.mode).slice(0, 40) : null;
  const appleReason = String(apple.reason || "");
  const googleReason = String(google.reason || "");
  const appleOk = appleFailed === 0 && !["apns_token_error"].includes(appleReason);
  const googleOk = googleSynced || ["google_wallet_not_configured", "user_not_found"].includes(googleReason);
  const status = appleOk && googleOk ? "ok" : (appleOk || googleOk ? "partial" : "failed");

  await pool.query(
    `INSERT INTO wallet_notification_logs
      (user_id, reason, apple_sent, apple_failed, google_synced, google_mode, status, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [userId, reason, appleSent, appleFailed, googleSynced, googleMode, status, JSON.stringify({ apple, google })],
  );
}

async function notifyWalletPassesUpdatedForUser(userId, { reason = "wallet_update" } = {}) {
  if (!userId) {
    return { userId, reason, apple: { reason: "missing_user_id" }, google: { reason: "missing_user_id" } };
  }
  const [appleResult, googleResult] = await Promise.allSettled([
    notifyApplePassUpdatedForUser(userId, { reason }),
    syncGoogleWalletObjectForUser(userId, { reason }),
  ]);
  const result = {
    userId,
    reason,
    apple: appleResult.status === "fulfilled" ? appleResult.value : { reason: appleResult.reason?.message || "apple_notify_failed" },
    google: googleResult.status === "fulfilled" ? googleResult.value : { reason: googleResult.reason?.message || "google_sync_failed" },
  };
  await persistWalletNotificationLog(result).catch((err) => {
    console.error("[Wallet] could not persist notification log:", err.message);
  });
  return result;
}

const walletSyncQueue = new Map();

function triggerWalletPassSync(userId, reason = "wallet_update") {
  if (!userId) return;
  const key = String(userId);
  const existing = walletSyncQueue.get(key);
  if (existing?.timer) {
    clearTimeout(existing.timer);
    existing.reasons.add(reason);
  }
  const reasons = existing?.reasons || new Set([reason]);
  const timer = setTimeout(() => {
    walletSyncQueue.delete(key);
    const mergedReason = [...reasons].join(",");
    notifyWalletPassesUpdatedForUser(userId, { reason: mergedReason }).catch((err) => {
      console.error(`[Wallet] async sync failed (${mergedReason}) user=${userId}:`, err.message);
    });
  }, 1500);
  walletSyncQueue.set(key, { timer, reasons });
}

console.log("[Apple Wallet] Config check:",
  isAppleWalletConfigured() ? "✅ All certs configured — .pkpass mode" : "⚠️ Missing certs — web pass fallback mode");
console.log("[Apple Wallet]",
  "| TEAM:", APPLE_TEAM_ID ? "✅" : "❌",
  "| PASS_TYPE:", APPLE_PASS_TYPE_ID ? "✅" : "❌",
  "| CERT:", APPLE_SIGNER_CERT_PEM ? `✅ (${APPLE_SIGNER_CERT_PEM.length} chars)` : "❌",
  "| KEY:", APPLE_SIGNER_KEY_PEM ? `✅ (${APPLE_SIGNER_KEY_PEM.length} chars)` : "❌",
  "| WWDR:", APPLE_WWDR_CERT_PEM ? `✅ (${APPLE_WWDR_CERT_PEM.length} chars)` : "❌",
  "| APNS:", isAppleApnsConfigured() ? "✅" : "⚠️");
console.log("[Apple Wallet] File paths checked:",
  "cert:", CERT_FILE_PATHS.cert, safeExists(CERT_FILE_PATHS.cert) ? "✅" : "❌",
  "| key:", CERT_FILE_PATHS.key, safeExists(CERT_FILE_PATHS.key) ? "✅" : "❌",
  "| wwdr:", CERT_FILE_PATHS.wwdr, safeExists(CERT_FILE_PATHS.wwdr) ? "✅" : "❌");
console.log("[Apple Wallet] Cert dir candidates:", WALLET_ASSET_DIR_CANDIDATES.join(" | "));
console.log("[Apple Wallet] ASSET_DIR:", findAssetDir());

// Validate certs at startup if configured
if (isAppleWalletConfigured()) {
  try {
    console.log("[Apple Wallet] Cert PEM starts with:", APPLE_SIGNER_CERT_PEM.substring(0, 50));
    console.log("[Apple Wallet] Key PEM starts with:", APPLE_SIGNER_KEY_PEM.substring(0, 50));
    console.log("[Apple Wallet] WWDR PEM starts with:", APPLE_WWDR_CERT_PEM.substring(0, 50));
    try {
      crypto.createPrivateKey(APPLE_SIGNER_KEY_PEM);
      console.log("[Apple Wallet] ✅ Private key validated successfully");
    } catch (keyErr) {
      console.error("[Apple Wallet] ❌ Private key validation failed:", keyErr.message);
    }
  } catch (certErr) {
    console.error("[Apple Wallet] ❌ Cert decode error:", certErr.message);
  }
}

/** Check if we can at least generate a web pass (always true — no certs needed) */
function isAppleWebPassAvailable() {
  return true;
}

/**
 * Generate a .pkpass file as a Buffer for a given user.
 * Apple .pkpass = ZIP containing: pass.json, manifest.json, signature, icon.png, logo.png, strip.png
 */
async function generateApplePkpass({ userId, userName, points, qrCode, membership, nextBooking, activeEventPass }) {
  const baseSerialNumber = buildAppleWalletSerialFromUserId(userId);
  const hasMembership = !!membership;
  const hasEventPass = !!activeEventPass;
  const eventSerialHash = hasEventPass
    ? crypto.createHash("sha1").update(String(activeEventPass?.eventId || activeEventPass?.passCode || "")).digest("hex").slice(0, 12)
    : "";
  const serialNumber = hasEventPass ? `${baseSerialNumber}_ev_${eventSerialHash}` : baseSerialNumber;
  const eventSchedule = formatWalletEventSchedule(activeEventPass);
  const eventTitle = truncateWalletField(activeEventPass?.eventTitle || "Evento especial", 30);
  const eventDateObj = activeEventPass?.eventDate ? new Date(activeEventPass.eventDate) : null;
  const hasValidEventDate = !!eventDateObj && !Number.isNaN(eventDateObj.getTime());
  const eventDateShort = hasValidEventDate
    ? eventDateObj.toLocaleDateString("es-MX", { day: "numeric", month: "short" })
    : "Por confirmar";
  const eventDateLong = hasValidEventDate
    ? eventDateObj.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "Fecha por confirmar";
  const eventStartTimeLabel = activeEventPass?.eventStartTime ? String(activeEventPass.eventStartTime).slice(0, 5) : "";
  const eventEndTimeLabel = activeEventPass?.eventEndTime ? String(activeEventPass.eventEndTime).slice(0, 5) : "";
  const eventTimeShort = eventStartTimeLabel && eventEndTimeLabel
    ? `${eventStartTimeLabel}-${eventEndTimeLabel}`
    : (eventStartTimeLabel || "Por confirmar");
  const eventTimeLong = eventStartTimeLabel && eventEndTimeLabel
    ? `${eventStartTimeLabel} - ${eventEndTimeLabel}`
    : (eventStartTimeLabel || "Horario por confirmar");
  const eventLocationShort = truncateWalletField(activeEventPass?.eventLocation || "VARRE24", 24);
  const eventLocationLong = truncateWalletField(activeEventPass?.eventLocation || "VARRE24", 38);
  const eventCodeLabel = truncateWalletField(activeEventPass?.passCode || "—", 18);
  const eventRelevantDate = (() => {
    if (!hasEventPass || !hasValidEventDate) return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const startDate = new Date(eventDateObj);
    if (eventStartTimeLabel) {
      const [hh, mm] = eventStartTimeLabel.split(":").map((p) => Number(p));
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        startDate.setHours(hh, mm, 0, 0);
      }
    } else {
      startDate.setHours(10, 0, 0, 0);
    }
    return startDate.toISOString();
  })();
  const eventExpirationDate = (() => {
    if (!hasEventPass || !hasValidEventDate) return null;
    const endDate = new Date(eventDateObj);
    if (eventEndTimeLabel) {
      const [hh, mm] = eventEndTimeLabel.split(":").map((p) => Number(p));
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        endDate.setHours(hh, mm, 0, 0);
      }
    } else {
      endDate.setHours(23, 0, 0, 0);
    }
    endDate.setHours(endDate.getHours() + 8);
    return endDate.toISOString();
  })();
  const membershipCategory = hasMembership
    ? normalizeClassCategory(membership.class_category, "all")
    : "all";
  const membershipCategoryLabel =
    membershipCategory === "pilates" ? "Pilates" :
      membershipCategory === "bienestar" ? "Bienestar" :
        membershipCategory === "funcional" ? "Funcional" :
          membershipCategory === "mixto" ? "Mixto" : "General";
  const isUnlimited = hasMembership && (membership.class_limit === null || membership.class_limit >= 9999);
  const isTrialSingleSession = hasMembership && String(membership.repeat_key || "").startsWith("trial_single_session");
  const nonTransferable = hasMembership && parseBooleanFlag(membership.is_non_transferable);
  const nonRepeatable = hasMembership && parseBooleanFlag(membership.is_non_repeatable);
  const passAccent = hasEventPass
    ? "rgb(231, 235, 110)"
    : membershipCategory === "pilates"
      ? "rgb(181, 191, 156)"
      : membershipCategory === "bienestar"
        ? "rgb(148, 134, 122)"
        : membershipCategory === "funcional"
          ? "rgb(178, 152, 218)"
          : "rgb(181, 191, 156)";
  const passForeground = hasEventPass ? "rgb(249, 247, 232)" : "rgb(247, 245, 255)";
  const passBackground = hasEventPass ? "rgb(31, 0, 71)" : "rgb(20, 11, 31)";
  const classLimit = hasMembership ? Number(membership.class_limit ?? 0) : 0;
  const classesRemaining = hasMembership
    ? Math.max(0, Number(membership.classes_remaining ?? classLimit ?? 0))
    : 0;
  const stripStampState = resolveWalletStripStampState(classLimit, classesRemaining);
  const hasIconStampMode = hasMembership && !isUnlimited && stripStampState.total > 0;
  const membershipHeadline = isUnlimited ? "Membresía" : membershipCategoryLabel;
  const memberDisplayName = truncateWalletField(userName, 22);
  const planDisplayName = truncateWalletField(
    hasMembership ? (membership.plan_name || `${membershipCategoryLabel} ${isUnlimited ? "Ilimitado" : ""}`.trim()) : "",
    28,
  );
  const shouldUseStampStrip = !hasEventPass && hasMembership && !isUnlimited && stripStampState.total > 0;
  const showFullFrontTextFields = hasEventPass
    ? parseBooleanFlag(process.env.APPLE_WALLET_SHOW_FRONT_TEXT_EVENT || false)
    : parseBooleanFlag(process.env.APPLE_WALLET_SHOW_FRONT_TEXT_MEMBERSHIP || false);

  // Build secondary/auxiliary fields
  const secondaryFields = [];
  const auxiliaryFields = [];
  const compactAuxiliaryFields = [];
  const backFields = [];

  if (hasEventPass) {
    secondaryFields.push({
      key: "event_title",
      label: "EVENTO",
      value: truncateWalletField(eventTitle, 24),
    });
    secondaryFields.push({
      key: "event_date",
      label: "FECHA",
      value: eventDateLong,
    });
    auxiliaryFields.push({
      key: "event_time",
      label: "HORARIO",
      value: eventTimeLong,
    });
    auxiliaryFields.push({
      key: "event_code",
      label: "CÓDIGO",
      value: eventCodeLabel,
    });
    if (activeEventPass?.eventLocation) {
      auxiliaryFields.push({
        key: "event_location",
        label: "SEDE",
        value: eventLocationLong,
      });
    }
    compactAuxiliaryFields.push(
      {
        key: "compact_event_time",
        label: "HORA",
        value: eventTimeShort,
      },
      {
        key: "compact_event_venue",
        label: "SEDE",
        value: eventLocationShort,
      },
      {
        key: "compact_event_code",
        label: "CÓDIGO",
        value: eventCodeLabel,
      },
    );
  }

  if (hasMembership) {
    secondaryFields.push({
      key: "plan_name",
      label: "PLAN",
      value: planDisplayName || `${membershipCategoryLabel}${isUnlimited ? " ilimitado" : ""}`,
    });
    secondaryFields.push({
      key: "modalidad",
      label: "MODALIDAD",
      value: membershipCategoryLabel,
    });
    auxiliaryFields.push({
      key: "client_name",
      label: "CLIENTE",
      value: memberDisplayName || "Miembro",
    });
    if (membership.end_date) {
      const endDate = new Date(membership.end_date);
      const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
      auxiliaryFields.push({
        key: "vigencia",
        label: "VIGENTE HASTA",
        value: `${endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })} (${daysLeft}d)`,
      });
    }
    if (isUnlimited) {
      auxiliaryFields.push({ key: "clases", label: "CLASES", value: "♾️ Ilimitadas" });
    } else if (classLimit > 0 && !hasIconStampMode && !hasEventPass) {
      auxiliaryFields.push({
        key: "clases",
        label: "CLASES",
        value: `${classesRemaining} / ${classLimit} restantes`,
        changeMessage: "Clases restantes: %@",
      });
    }
    const rules = [];
    if (nonTransferable) rules.push("No transferible");
    if (nonRepeatable) rules.push("No repetible");
    if (rules.length) {
      auxiliaryFields.push({
        key: "reglas",
        label: "REGLAS",
        value: rules.join(" · "),
      });
    }
  } else {
    secondaryFields.push({ key: "estado", label: "ESTADO", value: "Sin membresía activa" });
  }

  if (nextBooking) {
    const bookingDate = new Date(nextBooking.date);
    const dateStr = bookingDate.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
    const timeStr = nextBooking.start_time ? String(nextBooking.start_time).substring(0, 5) : "";
    backFields.push({
      key: "next_class",
      label: "PRÓXIMA CLASE",
      value: `${nextBooking.class_name || "Clase"} — ${dateStr} ${timeStr}${nextBooking.instructor_name ? ` — ${nextBooking.instructor_name}` : ""}`,
      changeMessage: "%@",
    });
  }

  if (!showFullFrontTextFields) {
    if (hasMembership) {
      backFields.unshift(
        {
          key: "membership_plan_back",
          label: "PLAN",
          value: planDisplayName || `${membershipCategoryLabel}${isUnlimited ? " ilimitado" : ""}`,
        },
        {
          key: "membership_mode_back",
          label: "MODALIDAD",
          value: membershipCategoryLabel,
        },
      );
      if (membership.end_date) {
        const endDate = new Date(membership.end_date);
        const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
        backFields.unshift({
          key: "membership_valid_back",
          label: "VIGENTE HASTA",
          value: `${endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })} (${daysLeft}d)`,
        });
      }
      if (isUnlimited) {
        backFields.unshift({ key: "membership_classes_back", label: "CLASES", value: "♾️ Ilimitadas" });
      } else if (classLimit > 0) {
        backFields.unshift({
          key: "membership_classes_back",
          label: "CLASES",
          value: `${classesRemaining} / ${classLimit} restantes`,
        });
      }
      const rules = [];
      if (nonTransferable) rules.push("No transferible");
      if (nonRepeatable) rules.push("No repetible");
      if (rules.length) {
        backFields.unshift({
          key: "membership_rules_back",
          label: "REGLAS",
          value: rules.join(" · "),
        });
      }
    } else {
      backFields.unshift({ key: "membership_status_back", label: "ESTADO", value: "Sin membresía activa" });
    }
  }

  if (hasEventPass) {
    backFields.push(
      {
        key: "event_title_back",
        label: "EVENTO",
        value: activeEventPass.eventTitle || "Evento especial",
      },
      {
        key: "event_code_back",
        label: "CÓDIGO DE CHECK-IN",
        value: activeEventPass.passCode || "—",
      },
    );
    if (eventSchedule) {
      backFields.push({
        key: "event_schedule_back",
        label: "HORARIO",
        value: eventSchedule,
      });
    }
    if (activeEventPass?.eventLocation) {
      backFields.push({
        key: "event_location_back",
        label: "UBICACIÓN",
        value: activeEventPass.eventLocation,
      });
    }
    backFields.push(
      {
        key: "event_access_back",
        label: "ACCESO",
        value: "Pase personal de un solo acceso. No transferible.",
      },
      {
        key: "event_checkin_back",
        label: "CHECK-IN",
        value: "Presenta tu QR en recepción 10 minutos antes del evento.",
      },
    );
  }

  backFields.push(
    { key: "cliente", label: "CLIENTE", value: userName },
    { key: "puntos", label: "PUNTOS VARRE24", value: `${points.toLocaleString("es-MX")} pts` },
    { key: "web", label: "RESERVAR EN LÍNEA", value: `${SITE_URL}/app/bookings` },
    {
      key: "terms",
      label: "TÉRMINOS",
      value: hasEventPass
        ? "Pase válido para un acceso al evento indicado. Presenta el QR en recepción."
        : "Válido para clases de VARRE24. Presenta tu pase al ingresar.",
    }
  );

  const primaryFields = [
    {
      key: "headline",
      label: hasEventPass ? "EVENTO ACTIVO" : (hasMembership ? "PASE ACTIVO" : "MIEMBRO"),
      value: hasEventPass
        ? truncateWalletField(activeEventPass.eventTitle || "Evento especial", 20)
        : hasMembership
          ? truncateWalletField(membershipHeadline, 20)
          : (memberDisplayName || "Miembro"),
      changeMessage: hasEventPass
        ? "Evento activo: %@"
        : hasMembership
          ? "Tu pase ahora es %@"
          : undefined,
    },
  ];

  const compactPrimaryFields = hasEventPass
    ? []
    : [
      {
        key: "compact_title",
        label: hasMembership ? "PLAN" : "MIEMBRO",
        value: hasMembership
          ? truncateWalletField(planDisplayName || membershipHeadline, 22)
          : truncateWalletField(memberDisplayName || "Miembro", 22),
      },
    ];

  const compactSecondaryFields = [];
  if (hasEventPass) {
    compactSecondaryFields.push({
      key: "compact_event_title",
      label: "EVENTO",
      value: truncateWalletField(activeEventPass?.eventTitle || "Evento especial", 20),
    });
    compactSecondaryFields.push({
      key: "compact_event_date",
      label: "FECHA",
      value: truncateWalletField(eventDateShort, 16),
    });
  } else if (hasMembership && membership.end_date) {
    const endDate = new Date(membership.end_date);
    const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
    compactSecondaryFields.push({
      key: "compact_valid_until",
      label: "VIGENCIA",
      value: `${endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} (${daysLeft}d)`,
    });
  }

  // Build pass.json
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: APPLE_PASS_TYPE_ID,
    serialNumber,
    teamIdentifier: APPLE_TEAM_ID,
    organizationName: "VARRE24",
    description: hasEventPass
      ? `Evento — ${activeEventPass?.eventTitle || "VARRE24"}`
      : `${membershipCategoryLabel} — VARRE24`,
    logoText: "",
    foregroundColor: passForeground,
    backgroundColor: passBackground,
    labelColor: passAccent,
    storeCard: {
      headerFields: [
        { key: "points", label: "PUNTOS", value: points, textAlignment: "PKTextAlignmentRight", changeMessage: "Ahora tienes %@ puntos" },
      ],
      primaryFields: hasEventPass
        ? (showFullFrontTextFields ? primaryFields : compactPrimaryFields)
        : (showFullFrontTextFields ? primaryFields : []),
      secondaryFields: hasEventPass
        ? (showFullFrontTextFields ? secondaryFields : compactSecondaryFields)
        : secondaryFields,
      auxiliaryFields: hasEventPass
        ? (showFullFrontTextFields ? auxiliaryFields : compactAuxiliaryFields)
        : auxiliaryFields,
      backFields,
    },
    barcode: {
      message: qrCode,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    },
    barcodes: [
      {
        message: qrCode,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
      },
    ],
    webServiceURL: `${SITE_URL}/api/wallet`,
    authenticationToken: APPLE_AUTH_TOKEN,
    relevantDate: eventRelevantDate,
  };
  if (eventExpirationDate) {
    passJson.expirationDate = eventExpirationDate;
  }

  // Read image assets with dedicated retina variants to avoid pixelation in Wallet.
  const assetCategory =
    hasEventPass
      ? "event"
      : membershipCategory === "pilates"
        ? "pilates"
        : membershipCategory === "bienestar"
          ? "bienestar"
          : "mixto";

  const iconPath = findAssetFile([
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "wallet-icon-mixto.png",
    "pn-logo.png",
  ]);
  const icon2xPath = findAssetFile([
    `wallet-icon-${assetCategory}@2x.png`,
    "wallet-icon-event@2x.png",
    "wallet-icon-mixto@2x.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "wallet-icon-mixto.png",
    "pn-logo.png",
  ]);
  const icon3xPath = findAssetFile([
    `wallet-icon-${assetCategory}@3x.png`,
    "wallet-icon-event@3x.png",
    "wallet-icon-mixto@3x.png",
    `wallet-icon-${assetCategory}@2x.png`,
    "wallet-icon-event@2x.png",
    "wallet-icon-mixto@2x.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "wallet-icon-mixto.png",
    "pn-logo.png",
  ]);

  const logoPath = findAssetFile([
    "wallet-logo.png",
    "pn-logo-full.png",
    "pn-logo.png",
    "wallet-logo-black.png",
  ]);
  const logo2xPath = findAssetFile([
    "wallet-logo@2x.png",
    "wallet-logo.png",
    "pn-logo-full.png",
    "pn-logo.png",
    "wallet-logo-black@2x.png",
    "wallet-logo-black.png",
  ]);
  const logo3xPath = findAssetFile([
    "wallet-logo@3x.png",
    "wallet-logo@2x.png",
    "wallet-logo.png",
    "pn-logo-full.png",
    "pn-logo.png",
    "wallet-logo-black@3x.png",
    "wallet-logo-black@2x.png",
    "wallet-logo-black.png",
  ]);

  const thumbPath = findAssetFile([
    `wallet-thumb-${assetCategory}.png`,
    "wallet-thumb-event.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "pn-logo.png",
  ]);
  const thumb2xPath = findAssetFile([
    `wallet-thumb-${assetCategory}@2x.png`,
    "wallet-thumb-event@2x.png",
    `wallet-thumb-${assetCategory}.png`,
    "wallet-thumb-event.png",
    `wallet-icon-${assetCategory}@2x.png`,
    "wallet-icon-event@2x.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "pn-logo.png",
  ]);

  let dynamicStripName = "none";
  let stripPath = null;
  let strip2xPath = null;
  let strip3xPath = null;
  if (!hasEventPass) {
    const stripCategory =
      membershipCategory === "pilates" ? "pilates"
        : membershipCategory === "bienestar" ? "bienestar"
          : "mixto";
    dynamicStripName = shouldUseStampStrip
      ? `wallet-strip-${stripCategory}-t${stripStampState.total}-r${stripStampState.remaining}.png`
      : `wallet-strip-${stripCategory}.png`;
    const dynamicStripPath = shouldUseStampStrip
      ? findAssetFile([dynamicStripName])
      : null;
    const stripCandidates = [`wallet-strip-${stripCategory}.png`, "wallet-strip-mixto.png"];
    const strip2xCandidates = [`wallet-strip-${stripCategory}@2x.png`, "wallet-strip-mixto@2x.png"];
    const strip3xCandidates = [`wallet-strip-${stripCategory}@3x.png`, "wallet-strip-mixto@3x.png"];
    stripPath = dynamicStripPath || findAssetFile(stripCandidates);
    strip2xPath = dynamicStripPath
      ? findAssetFile([dynamicStripName.replace(".png", "@2x.png")])
      : findAssetFile(strip2xCandidates);
    strip3xPath = dynamicStripPath
      ? findAssetFile([dynamicStripName.replace(".png", "@3x.png")])
      : findAssetFile(strip3xCandidates);
  }

  const readAssetBuffer = (assetPath) => (assetPath && fs.existsSync(assetPath) ? fs.readFileSync(assetPath) : null);
  const iconBuffer = readAssetBuffer(iconPath);
  const icon2xBuffer = readAssetBuffer(icon2xPath) || iconBuffer;
  const icon3xBuffer = readAssetBuffer(icon3xPath) || icon2xBuffer || iconBuffer;
  const logoBuffer = readAssetBuffer(logoPath);
  const logo2xBuffer = readAssetBuffer(logo2xPath) || logoBuffer;
  const logo3xBuffer = readAssetBuffer(logo3xPath) || logo2xBuffer || logoBuffer;
  const thumbBuffer = readAssetBuffer(thumbPath);
  const thumb2xBuffer = readAssetBuffer(thumb2xPath) || thumbBuffer;
  const stripBuffer = readAssetBuffer(stripPath);
  const strip2xBuffer = readAssetBuffer(strip2xPath) || stripBuffer;
  const strip3xBuffer = readAssetBuffer(strip3xPath) || strip2xBuffer || stripBuffer;

  console.log(
    "[Apple Wallet] Assets found — icon:", !!iconBuffer,
    "icon@2x:", !!icon2xBuffer,
    "icon@3x:", !!icon3xBuffer,
    "logo:", !!logoBuffer,
    "logo@2x:", !!logo2xBuffer,
    "logo@3x:", !!logo3xBuffer,
    "thumbnail:", !!thumbBuffer,
    "thumbnail@2x:", !!thumb2xBuffer,
    "strip:", !!stripBuffer,
    "stripState:", `${stripStampState.remaining}/${stripStampState.total}`,
    "stripAsset:", dynamicStripName,
  );

  // Build file map for the pass
  const files = {};
  const passJsonBuffer = Buffer.from(JSON.stringify(passJson));
  files["pass.json"] = passJsonBuffer;
  if (iconBuffer) {
    files["icon.png"] = iconBuffer;
    files["icon@2x.png"] = icon2xBuffer || iconBuffer;
    files["icon@3x.png"] = icon3xBuffer || icon2xBuffer || iconBuffer;
  }
  if (logoBuffer) {
    files["logo.png"] = logoBuffer;
    files["logo@2x.png"] = logo2xBuffer || logoBuffer;
    files["logo@3x.png"] = logo3xBuffer || logo2xBuffer || logoBuffer;
  }
  if (thumbBuffer) {
    files["thumbnail.png"] = thumbBuffer;
    files["thumbnail@2x.png"] = thumb2xBuffer || thumbBuffer;
  }
  if (stripBuffer) files["strip.png"] = stripBuffer;
  if (strip2xBuffer) files["strip@2x.png"] = strip2xBuffer;
  if (strip3xBuffer) files["strip@3x.png"] = strip3xBuffer;

  // Build manifest.json (SHA1 hashes of each file)
  const manifest = {};
  for (const [name, buf] of Object.entries(files)) {
    manifest[name] = crypto.createHash("sha1").update(buf).digest("hex");
  }
  const manifestBuffer = Buffer.from(JSON.stringify(manifest));
  files["manifest.json"] = manifestBuffer;

  // Sign manifest with Apple certificates to create PKCS#7 signature
  // Use pre-loaded PEM variables (from files or base64 env vars)
  const signerCertPem = APPLE_SIGNER_CERT_PEM;
  const signerKeyPem = APPLE_SIGNER_KEY_PEM;
  const wwdrPem = APPLE_WWDR_CERT_PEM;

  console.log("[Apple Wallet] PEM sizes — cert:", signerCertPem.length, "key:", signerKeyPem.length, "wwdr:", wwdrPem.length);

  // Use openssl to create detached PKCS#7 signature
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkpass-"));
  const manifestPath = path.join(tmpDir, "manifest.json");
  const certPath = path.join(tmpDir, "signer.pem");
  const keyPath = path.join(tmpDir, "signer.key");
  const wwdrPath = path.join(tmpDir, "wwdr.pem");
  const sigPath = path.join(tmpDir, "signature");

  fs.writeFileSync(manifestPath, manifestBuffer);
  fs.writeFileSync(certPath, signerCertPem);
  fs.writeFileSync(keyPath, signerKeyPem);
  fs.writeFileSync(wwdrPath, wwdrPem);

  const opensslCmd = `openssl smime -binary -sign -certfile "${wwdrPath}" -signer "${certPath}" -inkey "${keyPath}" -in "${manifestPath}" -out "${sigPath}" -outform DER${APPLE_CERT_PASSWORD ? ` -passin pass:${APPLE_CERT_PASSWORD}` : ""}`;
  console.log("[Apple Wallet] Signing manifest with openssl...");
  try {
    execSync(opensslCmd, { stdio: "pipe" });
    console.log("[Apple Wallet] ✅ Signature created successfully");
  } catch (opensslErr) {
    const errMsg = opensslErr.stderr?.toString() || opensslErr.message;
    console.error("[Apple Wallet] ❌ OpenSSL signing failed:", errMsg);
    // Clean up temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`OpenSSL signing failed: ${errMsg}`);
  }

  const signatureBuffer = fs.readFileSync(sigPath);
  files["signature"] = signatureBuffer;

  // Clean up temp files
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // Create ZIP (.pkpass)
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { store: true }); // no compression for .pkpass
    const chunks = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    for (const [name, buf] of Object.entries(files)) {
      archive.append(buf, { name });
    }
    archive.finalize();
  });
}

// ── Apple Wallet endpoints ─────────────────────────────────────────────────

// GET /api/wallet/apple/pkpass — generate and download .pkpass (or web pass fallback)
app.get("/api/wallet/apple/pkpass", authMiddleware, async (req, res) => {
  try {
    const snapshot = await getWalletSnapshotForUser(req.userId);
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    const { userName, points, qrCode, membership, nextBooking } = snapshot;

    // If Apple Developer certs are configured, generate real .pkpass
    if (isAppleWalletConfigured()) {
      console.log("[Apple Wallet] ✅ Certs detected — generating real .pkpass for user:", req.userId);
      try {
        const pkpassBuffer = await generateApplePkpass({
          userId: req.userId,
          userName,
          points,
          qrCode,
          membership,
          nextBooking,
          activeEventPass: null,
        });
        console.log("[Apple Wallet] ✅ .pkpass generated, size:", pkpassBuffer.length, "bytes");
        res.setHeader("Content-Type", "application/vnd.apple.pkpass");
        res.setHeader("Content-Disposition", `attachment; filename="pilatesroom-pass.pkpass"`);
        res.setHeader("Content-Length", pkpassBuffer.length);
        return res.send(pkpassBuffer);
      } catch (pkpassErr) {
        console.error("[Apple Wallet] ❌ .pkpass generation failed:", pkpassErr.message);
        console.error("[Apple Wallet] ❌ Full error:", pkpassErr.stack || pkpassErr);
        // Return JSON error so frontend knows what happened
        return res.status(500).json({
          message: "Error generando pase .pkpass",
          error: pkpassErr.message,
          fallback: "webpass",
        });
      }
    }

    // No certs configured — return web pass HTML
    console.log("[Apple Wallet] ⚠️ Certs not configured — using web pass fallback.",
      "TEAM:", APPLE_TEAM_ID ? "✅" : "❌",
      "PASS_TYPE:", APPLE_PASS_TYPE_ID ? "✅" : "❌",
      "CERT:", APPLE_SIGNER_CERT_PEM ? "✅" : "❌",
      "KEY:", APPLE_SIGNER_KEY_PEM ? "✅" : "❌",
      "WWDR:", APPLE_WWDR_CERT_PEM ? "✅" : "❌"
    );

    // Fallback: generate a beautiful standalone HTML pass page
    const nextBookingHtml = nextBooking
      ? `<div class="field"><span class="label">Próxima clase</span><span class="value">${nextBooking.class_name || ""}</span></div>
         <div class="field"><span class="label">Fecha</span><span class="value">${nextBooking.date ? new Date(nextBooking.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : ""} ${nextBooking.start_time || ""}</span></div>`
      : "";
    const membershipHtml = membership
      ? `<div class="field"><span class="label">Plan</span><span class="value">${membership.plan_name}</span></div>
         <div class="field"><span class="label">Clases restantes</span><span class="value">${membership.classes_remaining ?? "∞"} / ${membership.class_limit ?? "∞"}</span></div>
         <div class="field"><span class="label">Vigencia</span><span class="value">${membership.end_date ? new Date(membership.end_date).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span></div>`
      : `<div class="field"><span class="label">Plan</span><span class="value">Sin membresía activa</span></div>`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="VARRE24">
<title>VARRE24 — ${userName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.pass{width:100%;max-width:380px;border-radius:24px;overflow:hidden;background:linear-gradient(160deg,#260910 0%,#3B0E1A 50%,#260910 100%);box-shadow:0 20px 60px rgba(225,92,184,.2),0 0 0 1px rgba(202,113,225,.15)}
.header{padding:24px 24px 16px;display:flex;align-items:center;justify-content:space-between}
.logo{font-size:18px;font-weight:800;background:linear-gradient(135deg,#3B0E1A,#C9A5A8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.badge{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:rgba(202,113,225,.7);border:1px solid rgba(202,113,225,.3);padding:4px 10px;border-radius:20px}
.points-section{text-align:center;padding:8px 24px 24px}
.points-label{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C9A5A8;margin-bottom:4px}
.points{font-size:72px;font-weight:900;background:linear-gradient(135deg,#3B0E1A,#C9A5A8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1}
.points-sub{font-size:13px;color:rgba(255,255,255,.5);margin-top:4px}
.qr-section{display:flex;justify-content:center;padding:0 24px 24px}
.qr-wrap{background:#fff;border-radius:20px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.3)}
.qr-wrap img{width:160px;height:160px;display:block}
.qr-hint{text-align:center;font-size:11px;color:rgba(255,255,255,.35);padding:0 24px 20px;line-height:1.5}
.fields{padding:0 24px 24px;display:flex;flex-direction:column;gap:12px}
.field{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(255,255,255,.05);border-radius:14px;border:1px solid rgba(255,255,255,.06)}
.label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.45)}
.value{font-size:14px;font-weight:600;color:#fff;text-align:right}
.footer{text-align:center;padding:0 24px 24px;display:flex;gap:8px;justify-content:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 20px;border-radius:14px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s}
.btn-primary{background:linear-gradient(135deg,#3B0E1A,#C9A5A8);color:#fff;flex:1}
.btn-primary:hover{opacity:.9}
.btn-outline{background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.1);flex:1}
.btn-outline:hover{background:rgba(255,255,255,.1)}
.name{text-align:center;font-size:16px;font-weight:700;padding:0 24px 4px;color:#fff}
</style>
</head>
<body>
<div class="pass">
  <div class="header">
    <div class="logo">VARRE24</div>
    <div class="badge">Club</div>
  </div>
  <div class="name">${userName}</div>
  <div class="points-section">
    <div class="points-label">Puntos acumulados</div>
    <div class="points">${points}</div>
    <div class="points-sub">VARRE24</div>
  </div>
  <div class="qr-section">
    <div class="qr-wrap">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrCode)}&bgcolor=FFFFFF&color=1a0b26" alt="QR Code" />
    </div>
  </div>
  <div class="qr-hint">Tu código de acceso VARRE24</div>
  <div class="fields">
    ${membershipHtml}
    ${nextBookingHtml}
  </div>
  <div class="footer">
    <button class="btn btn-primary" onclick="window.print()">🖨 Imprimir</button>
    <button class="btn btn-outline" onclick="alert('Consejo: En Safari, toca Compartir → Añadir a pantalla de inicio para tener tu pase siempre a la mano')">📱 Guardar</button>
  </div>
</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("Apple Wallet pkpass error:", err.message);
    return res.status(500).json({ message: "Error generando pase de Apple Wallet" });
  }
});

// GET /api/wallet/events/apple/pkpass — generate and download event-specific .pkpass
app.get("/api/wallet/events/apple/pkpass", authMiddleware, async (req, res) => {
  try {
    const eventIdRaw = String(req.query?.eventId || "").trim();
    const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventIdRaw)
      ? eventIdRaw
      : null;
    if (!eventId) return res.status(400).json({ message: "eventId inválido" });

    const snapshot = await getWalletSnapshotForUser(req.userId, { eventId });
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    const { userName, points, qrCode, activeEventPass } = snapshot;
    if (!activeEventPass) return res.status(404).json({ message: "No existe pase activo para ese evento" });
    const eventDateObj = activeEventPass?.eventDate ? new Date(activeEventPass.eventDate) : null;
    const hasValidEventDate = !!eventDateObj && !Number.isNaN(eventDateObj.getTime());
    const eventDateLong = hasValidEventDate
      ? eventDateObj.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
      : "Fecha por confirmar";
    const eventStartTimeLabel = activeEventPass?.eventStartTime ? String(activeEventPass.eventStartTime).slice(0, 5) : "";
    const eventEndTimeLabel = activeEventPass?.eventEndTime ? String(activeEventPass.eventEndTime).slice(0, 5) : "";
    const eventTimeLong = eventStartTimeLabel && eventEndTimeLabel
      ? `${eventStartTimeLabel} - ${eventEndTimeLabel}`
      : (eventStartTimeLabel || "Horario por confirmar");
    const eventLocationLong = truncateWalletField(activeEventPass?.eventLocation || "VARRE24", 38);

    if (isAppleWalletConfigured()) {
      const pkpassBuffer = await generateApplePkpass({
        userId: req.userId,
        userName,
        points,
        qrCode,
        membership: null,
        nextBooking: null,
        activeEventPass,
      });
      res.setHeader("Content-Type", "application/vnd.apple.pkpass");
      res.setHeader("Content-Disposition", `attachment; filename="pilatesroom-event-pass.pkpass"`);
      res.setHeader("Content-Length", pkpassBuffer.length);
      return res.send(pkpassBuffer);
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Pase de Evento — VARRE24</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.pass{width:100%;max-width:390px;border-radius:24px;overflow:hidden;background:linear-gradient(165deg,#260910 0%,#3B0E1A 56%,#260910 100%);box-shadow:0 22px 60px rgba(225,92,184,.2),0 0 0 1px rgba(202,113,225,.18)}
.header{padding:20px 22px 10px}
.badge{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;border-radius:999px;background:rgba(231,235,110,.13);color:#C9A5A8;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.title{margin-top:10px;font-weight:800;font-size:22px;line-height:1.1;color:#F3EFE9}
.meta{padding:0 22px 6px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.meta-item{border:1px solid rgba(249,247,232,.16);border-radius:12px;padding:10px 11px;background:rgba(255,255,255,.02)}
.meta-label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#C9A5A8;font-weight:700}
.meta-value{font-size:13px;line-height:1.3;color:#F3EFE9;margin-top:4px}
.qr{display:flex;justify-content:center;padding:16px 20px 10px}
.qr img{background:#fff;border-radius:18px;padding:12px}
.code{padding:0 22px 22px;text-align:center;font-size:13px;color:#F3EFE9}
.code strong{color:#C9A5A8;letter-spacing:.04em}
</style>
</head>
<body>
  <div class="pass">
    <div class="header">
      <span class="badge">Pase de evento</span>
      <div class="title">${activeEventPass.eventTitle || "Evento VARRE24"}</div>
    </div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">Fecha</div>
        <div class="meta-value">${eventDateLong || "Por confirmar"}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Horario</div>
        <div class="meta-value">${eventTimeLong || "Por confirmar"}</div>
      </div>
      <div class="meta-item" style="grid-column:1 / span 2;">
        <div class="meta-label">Sede</div>
        <div class="meta-value">${eventLocationLong || "VARRE24"}</div>
      </div>
    </div>
    <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(activeEventPass.passCode || qrCode)}&bgcolor=FFFFFF&color=1F0047" alt="QR"/></div>
    <div class="code">Código de acceso: <strong>${activeEventPass.passCode || "—"}</strong></div>
  </div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("Apple Wallet event pkpass error:", err.message);
    return res.status(500).json({ message: "Error generando pase de evento Apple Wallet" });
  }
});

// GET /api/wallet/apple/status — check Apple Wallet config (admin only)
app.get("/api/wallet/apple/status", adminMiddleware, async (_req, res) => {
  return res.json({
    configured: true, // Always true — we have web pass fallback even without Apple certs
    nativePkpass: isAppleWalletConfigured(),
    apnsConfigured: isAppleApnsConfigured(),
    teamId: APPLE_TEAM_ID ? "✅ set" : "❌ (web pass mode)",
    passTypeId: APPLE_PASS_TYPE_ID || "N/A (web pass mode)",
    keyId: APPLE_KEY_ID ? "✅ set" : "❌",
    apnsKey: APPLE_APNS_KEY_PEM ? `✅ loaded (${APPLE_APNS_KEY_PEM.length} chars)` : "❌",
    apnsHost: APPLE_APNS_HOST,
    signerCert: APPLE_SIGNER_CERT_PEM ? `✅ loaded (${APPLE_SIGNER_CERT_PEM.length} chars)` : "❌ (web pass mode)",
    signerKey: APPLE_SIGNER_KEY_PEM ? `✅ loaded (${APPLE_SIGNER_KEY_PEM.length} chars)` : "❌ (web pass mode)",
    wwdrCert: APPLE_WWDR_CERT_PEM ? `✅ loaded (${APPLE_WWDR_CERT_PEM.length} chars)` : "❌ (web pass mode)",
    certFiles: {
      cert: `${CERT_FILE_PATHS.cert} ${safeExists(CERT_FILE_PATHS.cert) ? "✅" : "❌"}`,
      key: `${CERT_FILE_PATHS.key} ${safeExists(CERT_FILE_PATHS.key) ? "✅" : "❌"}`,
      wwdr: `${CERT_FILE_PATHS.wwdr} ${safeExists(CERT_FILE_PATHS.wwdr) ? "✅" : "❌"}`,
    },
    certDirCandidates: WALLET_ASSET_DIR_CANDIDATES,
  });
});

// GET /api/wallet/apple/debug — detailed cert diagnostics (admin only)
app.get("/api/wallet/apple/debug", authMiddleware, async (req, res) => {
  // Check if user is admin
  try {
    const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
    if (userRes.rows[0]?.role !== "admin") return res.status(403).json({ message: "Solo admin" });
  } catch { return res.status(403).json({ message: "Error" }); }

  const checks = {
    configured: isAppleWalletConfigured(),
    apnsConfigured: isAppleApnsConfigured(),
    envVars: {
      APPLE_TEAM_ID: APPLE_TEAM_ID ? `✅ "${APPLE_TEAM_ID}"` : "❌ not set",
      APPLE_PASS_TYPE_ID: APPLE_PASS_TYPE_ID ? `✅ "${APPLE_PASS_TYPE_ID}"` : "❌ not set",
      APPLE_KEY_ID: APPLE_KEY_ID ? `✅ "${APPLE_KEY_ID}"` : "❌ not set",
      APPLE_CERT_PASSWORD: APPLE_CERT_PASSWORD ? "✅ set" : "⬜ not set (OK if key has no password)",
    },
    certFiles: {
      certPath: `${CERT_FILE_PATHS.cert} ${safeExists(CERT_FILE_PATHS.cert) ? "✅ exists" : "❌ not found"}`,
      keyPath: `${CERT_FILE_PATHS.key} ${safeExists(CERT_FILE_PATHS.key) ? "✅ exists" : "❌ not found"}`,
      wwdrPath: `${CERT_FILE_PATHS.wwdr} ${safeExists(CERT_FILE_PATHS.wwdr) ? "✅ exists" : "❌ not found"}`,
    },
    certDirCandidates: WALLET_ASSET_DIR_CANDIDATES,
    loadedPems: {
      signerCert: APPLE_SIGNER_CERT_PEM ? `✅ loaded (${APPLE_SIGNER_CERT_PEM.length} chars), starts: ${APPLE_SIGNER_CERT_PEM.substring(0, 40)}...` : "❌ not loaded",
      signerKey: APPLE_SIGNER_KEY_PEM ? `✅ loaded (${APPLE_SIGNER_KEY_PEM.length} chars), starts: ${APPLE_SIGNER_KEY_PEM.substring(0, 40)}...` : "❌ not loaded",
      wwdr: APPLE_WWDR_CERT_PEM ? `✅ loaded (${APPLE_WWDR_CERT_PEM.length} chars), starts: ${APPLE_WWDR_CERT_PEM.substring(0, 40)}...` : "❌ not loaded",
      apnsKey: APPLE_APNS_KEY_PEM ? `✅ loaded (${APPLE_APNS_KEY_PEM.length} chars), starts: ${APPLE_APNS_KEY_PEM.substring(0, 40)}...` : "❌ not loaded",
    },
    base64EnvFallback: {
      APPLE_SIGNER_CERT_BASE64: process.env.APPLE_SIGNER_CERT_BASE64 ? `✅ (${process.env.APPLE_SIGNER_CERT_BASE64.length} chars)` : "⬜ not set",
      APPLE_SIGNER_KEY_BASE64: process.env.APPLE_SIGNER_KEY_BASE64 ? `✅ (${process.env.APPLE_SIGNER_KEY_BASE64.length} chars)` : "⬜ not set",
      APPLE_WWDR_CERT_BASE64: process.env.APPLE_WWDR_CERT_BASE64 ? `✅ (${process.env.APPLE_WWDR_CERT_BASE64.length} chars)` : "⬜ not set",
      APPLE_APNS_KEY_BASE64: process.env.APPLE_APNS_KEY_BASE64 ? `✅ (${process.env.APPLE_APNS_KEY_BASE64.length} chars)` : "⬜ not set",
    },
    assetDir: findAssetDir(),
    assetsFound: {
      "pn-logo.png": fs.existsSync(path.join(findAssetDir(), "pn-logo.png")),
      "pn-logo-full.png": fs.existsSync(path.join(findAssetDir(), "pn-logo-full.png")),
    },
    opensslVersion: "unknown",
    keyValidation: "not tested",
    apnsKeyValidation: "not tested",
  };

  // Check openssl
  try {
    checks.opensslVersion = execSync("openssl version", { encoding: "utf8" }).trim();
  } catch (e) {
    checks.opensslVersion = "❌ openssl not found: " + e.message;
  }

  // Validate private key
  if (APPLE_SIGNER_KEY_PEM) {
    try {
      crypto.createPrivateKey(APPLE_SIGNER_KEY_PEM);
      checks.keyValidation = "✅ key is valid";
    } catch (keyErr) {
      checks.keyValidation = "❌ " + keyErr.message;
    }
  }

  if (APPLE_APNS_KEY_PEM) {
    try {
      crypto.createPrivateKey(APPLE_APNS_KEY_PEM);
      checks.apnsKeyValidation = "✅ key is valid";
    } catch (keyErr) {
      checks.apnsKeyValidation = "❌ " + keyErr.message;
    }
  }

  return res.json(checks);
});

// Apple Wallet Web Service endpoints (protocol V1)

// POST /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial
app.post("/api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  const { deviceId, serial, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  const pushToken = req.body?.pushToken || "";
  try {
    await pool.query(`
      INSERT INTO apple_wallet_devices (device_id, push_token, pass_type_id, serial_number)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (device_id, pass_type_id, serial_number) DO UPDATE SET push_token = $2, updated_at = NOW()
    `, [deviceId, pushToken, effectivePassTypeId, serial]);
    return res.status(201).send();
  } catch (err) {
    console.error("Apple register device error:", err);
    return res.status(500).send();
  }
});

// GET /api/wallet/v1/devices/:deviceId/registrations/:passTypeId
app.get("/api/wallet/v1/devices/:deviceId/registrations/:passTypeId", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  const { deviceId, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  const rawSince = String(req.query?.passesUpdatedSince || "").trim();
  const sinceDate = rawSince ? new Date(rawSince) : null;
  const hasValidSince = !!(sinceDate && !Number.isNaN(sinceDate.getTime()));
  try {
    const params = [deviceId, effectivePassTypeId];
    let query = `
      SELECT serial_number, updated_at
      FROM apple_wallet_devices
      WHERE device_id = $1 AND pass_type_id = $2
    `;
    if (hasValidSince) {
      params.push(sinceDate.toISOString());
      query += ` AND updated_at > $${params.length}`;
    }
    query += " ORDER BY updated_at DESC";
    const r = await pool.query(query, params);
    if (r.rows.length === 0) return res.status(204).send();
    const latestUpdatedAt = r.rows.reduce((latest, row) => {
      const current = row.updated_at ? new Date(row.updated_at) : null;
      if (!current || Number.isNaN(current.getTime())) return latest;
      if (!latest) return current;
      return current > latest ? current : latest;
    }, null);
    return res.json({
      serialNumbers: r.rows.map((d) => d.serial_number),
      lastUpdated: latestUpdatedAt?.toISOString() || new Date().toISOString(),
    });
  } catch (err) {
    console.error("Apple list passes error:", err);
    return res.status(500).send();
  }
});

// GET /api/wallet/v1/passes/:passTypeId/:serial — download updated pass
app.get("/api/wallet/v1/passes/:passTypeId/:serial", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  if (!isAppleWalletConfigured()) {
    return res.status(501).json({ message: "Apple Wallet signing not configured" });
  }
  const { serial, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  const userId = parseUserIdFromAppleWalletSerial(serial);
  if (!userId) return res.status(404).send();
  try {
    const snapshot = await getWalletSnapshotForUser(userId);
    if (!snapshot) return res.status(404).send();
    const { userName, points, qrCode, membership, nextBooking } = snapshot;
    const pkpassBuffer = await generateApplePkpass({
      userId,
      userName,
      points,
      qrCode,
      membership,
      nextBooking,
      activeEventPass: null,
    });
    const touchRes = await pool.query(
      "SELECT MAX(updated_at) AS updated_at FROM apple_wallet_devices WHERE pass_type_id = $1 AND serial_number = $2",
      [effectivePassTypeId, serial],
    ).catch(() => ({ rows: [] }));
    const lastUpdated = touchRes.rows[0]?.updated_at ? new Date(touchRes.rows[0].updated_at) : new Date();
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Last-Modified", lastUpdated.toUTCString());
    return res.send(pkpassBuffer);
  } catch (err) {
    console.error("Apple V1 pass download error:", err.message);
    return res.status(500).send();
  }
});

// DELETE /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial
app.delete("/api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  const { deviceId, serial, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  try {
    await pool.query(
      "DELETE FROM apple_wallet_devices WHERE device_id = $1 AND pass_type_id = $2 AND serial_number = $3",
      [deviceId, effectivePassTypeId, serial]
    );
    return res.status(200).send();
  } catch (err) {
    console.error("Apple unregister device error:", err);
    return res.status(500).send();
  }
});

// POST /api/wallet/v1/log — Apple Wallet error log
app.post("/api/wallet/v1/log", (req, res) => {
  console.log("Apple Wallet log:", JSON.stringify(req.body));
  return res.status(200).send();
});

// GET /api/admin/payment-webhook-events — últimos eventos recibidos de gateways
// (MercadoPago hoy; mañana Stripe/PayPal/etc). Útil para verificar que la firma
// HMAC se valide bien y que los webhooks lleguen. Solo admin.
app.get("/api/admin/payment-webhook-events", adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 200);
    const provider = req.query.provider ? String(req.query.provider) : null;
    const params = [];
    let where = "1=1";
    if (provider) { params.push(provider); where = `provider = $${params.length}`; }
    params.push(limit);
    const r = await pool.query(
      `SELECT id, provider, event_key, event_type,
              created_at AS received_at, processed_at,
              payload::text AS payload_raw
         FROM payment_webhook_events
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET payment-webhook-events error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/audit-log — registro de toda mutación admin (Grupo D)
app.get("/api/admin/audit-log", adminMiddleware, async (req, res) => {
  try {
    const { from, to, actor, method, q, limit = 200 } = req.query;
    const filters = ["1=1"];
    const params = [];
    if (from)   { params.push(from);   filters.push(`created_at >= $${params.length}`); }
    if (to)     { params.push(to);     filters.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`); }
    if (actor)  { params.push(actor);  filters.push(`actor_user_id = $${params.length}`); }
    if (method) { params.push(String(method).toUpperCase()); filters.push(`method = $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      filters.push(`(path ILIKE $${params.length} OR path_full ILIKE $${params.length} OR resource_id ILIKE $${params.length} OR actor_email ILIKE $${params.length})`);
    }
    const lim = Math.min(500, Math.max(1, parseInt(limit) || 200));
    params.push(lim);
    const r = await pool.query(
      `SELECT id, actor_user_id, actor_email, actor_role, method, path, path_full,
              resource_id, status_code, payload, ip, created_at
         FROM admin_audit_log
        WHERE ${filters.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params
    );
    const admins = await pool.query(
      `SELECT id, email, COALESCE(display_name, email) AS display_name, role
         FROM users
        WHERE role IN ('admin','super_admin','reception','instructor')
        ORDER BY role, display_name`
    );
    return res.json({ data: { entries: r.rows, admins: admins.rows } });
  } catch (err) {
    console.error("GET /api/admin/audit-log error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/wallet/notifications — latest wallet push/sync logs
app.get("/api/admin/wallet/notifications", adminMiddleware, async (req, res) => {
  try {
    const parsedLimit = Number(req.query.limit ?? 30);
    const limit = Math.min(120, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 30));
    const r = await pool.query(
      `SELECT l.*,
              u.display_name,
              u.email
         FROM wallet_notification_logs l
         LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.created_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("[Admin wallet notifications] error:", err.message);
    return res.status(500).json({ message: "Error obteniendo historial de notificaciones de Wallet" });
  }
});

// POST /api/admin/wallet/notify/:userId — force pass update notifications
app.post("/api/admin/wallet/notify/:userId", adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason = "manual_admin_notify" } = req.body || {};
    const result = await notifyWalletPassesUpdatedForUser(userId, { reason });
    return res.json({ data: result });
  } catch (err) {
    console.error("[Admin wallet notify] error:", err.message);
    return res.status(500).json({ message: "Error notificando wallet", detail: err.message });
  }
});

// ─── Routes: /api/videos ────────────────────────────────────────────────────

// GET /api/videos/categories
app.get("/api/videos/categories", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ct.id, ct.name, COUNT(v.id) AS video_count
       FROM class_types ct
       JOIN videos v ON v.class_type_id = ct.id AND v.is_published = true
       GROUP BY ct.id, ct.name
       ORDER BY ct.name`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("Videos/categories error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/videos?search=&category=&limit=
app.get("/api/videos", authMiddleware, async (req, res) => {
  try {
    const { search = "", category = "", limit } = req.query;
    let query = `
      SELECT v.*,
             ct.name AS category_name,
             i.display_name AS instructor_name
      FROM videos v
      LEFT JOIN class_types ct ON v.class_type_id = ct.id
      LEFT JOIN instructors i ON v.instructor_id = i.id
      WHERE v.is_published = true
    `;
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (v.title ILIKE $${params.length} OR v.description ILIKE $${params.length})`;
    }
    if (category) {
      params.push(category);
      query += ` AND ct.id = $${params.length}`;
    }
    query += " ORDER BY v.is_featured DESC, v.sort_order ASC, v.created_at DESC";
    if (limit) { params.push(parseInt(limit)); query += ` LIMIT $${params.length}`; }
    const r = await pool.query(query, params);
    // Check membership access
    const memRes = await pool.query(
      "SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [req.userId]
    );
    const hasMembership = memRes.rows.length > 0;
    const rows = r.rows.map(v => {
      // Derive video_url from drive_file_id (proxy) if available
      let videoUrl = v.video_url;
      if (v.drive_file_id) {
        videoUrl = `/api/drive/video/${v.drive_file_id}`;
      } else if (videoUrl) {
        const m = videoUrl.match(/drive\.google\.com\/file\/d\/([^/]+)\/preview/);
        if (m) videoUrl = `/api/drive/video/${m[1]}`;
      }
      return { ...v, video_url: videoUrl, has_access: v.access_type === "free" || v.access_type === "gratuito" || hasMembership };
    });
    return res.json({ data: rows });
  } catch (err) {
    console.error("Videos error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/videos/:id
app.get("/api/videos/:id", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT v.*,
              ct.name AS category_name,
              i.display_name AS instructor_name, i.bio AS instructor_bio
       FROM videos v
       LEFT JOIN class_types ct ON v.class_type_id = ct.id
       LEFT JOIN instructors i ON v.instructor_id = i.id
       WHERE v.id = $1 AND v.is_published = true`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Video no encontrado" });
    const video = r.rows[0];
    // Derive video_url from drive_file_id (proxy) if available
    if (video.drive_file_id) {
      video.video_url = `/api/drive/video/${video.drive_file_id}`;
    } else if (video.video_url) {
      const m = video.video_url.match(/drive\.google\.com\/file\/d\/([^\/]+)\/preview/);
      if (m) video.video_url = `/api/drive/video/${m[1]}`;
    }
    const memRes = await pool.query(
      "SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [req.userId]
    );
    const hasMembership = memRes.rows.length > 0;
    video.has_access = video.access_type === "free" || video.access_type === "gratuito" || hasMembership;
    // Log view
    await pool.query("UPDATE videos SET view_count = view_count + 1 WHERE id = $1", [req.params.id]);
    return res.json({ data: video });
  } catch (err) {
    console.error("Videos/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/videos/:id/view
app.post("/api/videos/:id/view", authMiddleware, async (req, res) => {
  try {
    await pool.query("UPDATE videos SET view_count = view_count + 1 WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.json({ ok: true }); }
});

// POST /api/videos/:id/purchase
app.post("/api/videos/:id/purchase", authMiddleware, async (req, res) => {
  try {
    const vRes = await pool.query(
      "SELECT * FROM videos WHERE id = $1 AND is_published = true AND sales_enabled = true",
      [req.params.id]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ message: "Video no disponible para compra" });
    const video = vRes.rows[0];
    const r = await pool.query(
      `INSERT INTO video_purchases (video_id, user_id, status, amount_mxn, payment_method)
       VALUES ($1, $2, 'pending_payment', $3, 'transfer')
       ON CONFLICT (video_id, user_id) DO UPDATE SET status = EXCLUDED.status
       RETURNING *`,
      [req.params.id, req.userId, video.sales_price_mxn]
    );
    const bankInfo = await getConfiguredBankInfo(pool);
    return res.status(201).json({
      data: {
        ...r.rows[0],
        bank_details: {
          ...bankInfo,
          amount: Number(video.sales_price_mxn || 0),
          currency: "MXN",
        },
      },
    });
  } catch (err) {
    console.error("Video/purchase error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/videos/purchases/:id/proof  (multipart)
app.post("/api/videos/purchases/:id/proof", authMiddleware, upload.single("proof"), async (req, res) => {
  try {
    await pool.query(
      "UPDATE video_purchases SET status = 'pending_verification', proof_uploaded_at = NOW() WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    return res.json({ message: "Comprobante recibido" });
  } catch (err) {
    console.error("Video/purchase proof error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/users ─────────────────────────────────────────────────────

// PUT /api/users/:id
// POST /api/users/:id/photo — upload user profile photo (Drive con fallback base64)
app.post("/api/users/:id/photo", authMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const userId = req.params.id;

    // Permisos: solo el dueño o admin
    const selfRes = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
    const callerRole = selfRes.rows[0]?.role || "client";
    const isAdminCaller = ["admin", "super_admin"].includes(callerRole);
    if (userId !== req.userId && !isAdminCaller) {
      return res.status(403).json({ message: "Acceso denegado" });
    }
    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ message: "El archivo debe ser una imagen" });
    }

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_DRIVE_FOLDER_ID &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    let photoUrl;
    if (isDriveConfigured) {
      try {
        const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
            grant_type: "refresh_token",
          }),
        });
        const { access_token } = await tokenResp.json();

        const boundary = "user_photo_" + Date.now();
        const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
        const metadata = JSON.stringify({
          name: `user_${userId}_${Date.now()}.${ext}`,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
        });
        const body = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${req.file.mimetype}\r\n\r\n`),
          req.file.buffer,
          Buffer.from(`\r\n--${boundary}--`),
        ]);

        const uploadResp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
          method: "POST",
          headers: { Authorization: `Bearer ${access_token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        });
        const uploadJson = await uploadResp.json();
        if (!uploadJson.id) throw new Error("Error al subir imagen a Drive");

        await fetch(`https://www.googleapis.com/drive/v3/files/${uploadJson.id}/permissions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ role: "reader", type: "anyone" }),
        });

        photoUrl = `/api/drive/image/${uploadJson.id}`;
      } catch (driveErr) {
        console.warn("[user photo] Drive upload falló, usando base64:", driveErr.message);
      }
    }

    if (!photoUrl) {
      if (req.file.size > 2 * 1024 * 1024) {
        return res.status(413).json({ message: "Imagen muy grande para almacenamiento local (máx 2MB)" });
      }
      photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    const r = await pool.query(
      `UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, email, display_name, phone, photo_url, role`,
      [photoUrl, userId]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({ data: { user: camelRow(r.rows[0]), photo_url: photoUrl, photoUrl } });
  } catch (err) {
    console.error("User photo upload error:", err);
    return res.status(500).json({ message: err.message || "Error al subir foto" });
  }
});

app.put("/api/users/:id", authMiddleware, async (req, res) => {
  // Allow own profile edit OR admin editing any user
  try {
    const selfRes = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
    const callerRole = selfRes.rows[0]?.role || "client";
    const isAdminCaller = ["admin", "super_admin"].includes(callerRole);
    if (req.params.id !== req.userId && !isAdminCaller) {
      return res.status(403).json({ message: "Acceso denegado" });
    }
    const {
      displayName, phone, dateOfBirth, gender,
      emergencyContactName, emergencyContactPhone, healthNotes,
      receiveReminders, receivePromotions, receiveWeeklySummary,
      acceptsCommunications,
      role,
    } = req.body;
    // Non-admins cannot change role
    const newRole = isAdminCaller && role ? role : null;
    const targetId = req.params.id;
    const r = await pool.query(
      `UPDATE users SET
         display_name              = COALESCE($1, display_name),
         phone                     = COALESCE($2, phone),
         date_of_birth             = COALESCE($3, date_of_birth),
         emergency_contact_name    = COALESCE($4, emergency_contact_name),
         emergency_contact_phone   = COALESCE($5, emergency_contact_phone),
         health_notes              = COALESCE($6, health_notes),
         receive_reminders         = COALESCE($7, receive_reminders),
         receive_promotions        = COALESCE($8, receive_promotions),
         receive_weekly_summary    = COALESCE($9, receive_weekly_summary),
         accepts_communications    = COALESCE($10, accepts_communications),
         role                      = COALESCE($11, role),
         gender                    = COALESCE($12, gender),
         updated_at                = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        displayName || null, normalizePhoneForStorage(phone), dateOfBirth || null,
        emergencyContactName || null, emergencyContactPhone || null, healthNotes || null,
        receiveReminders ?? null, receivePromotions ?? null, receiveWeeklySummary ?? null,
        acceptsCommunications ?? null,
        newRole,
        gender || null,
        targetId,
      ]
    );
    // Si el rol cambió, invalida el caché de role para ese usuario.
    if (newRole) invalidateRoleCache(targetId);
    return res.json({ user: mapUser(r.rows[0]) });
  } catch (err) {
    console.error("PUT users/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/users/me/credits — todos los créditos vigentes del usuario (FIFO)
app.get("/api/users/me/credits", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.id, c.discount_percent, c.expires_at, c.created_at,
              ru.display_name AS referred_name
         FROM referral_credits c
         JOIN referrals ref ON c.source_referral_id = ref.id
         LEFT JOIN users ru ON ref.referred_user_id = ru.id
        WHERE c.user_id = $1
          AND c.used_at IS NULL
          AND c.voided_at IS NULL
          AND c.expires_at > NOW()
        ORDER BY c.created_at ASC`,
      [req.userId]
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("/me/credits error:", err);
    return res.status(500).json({ message: "Error" });
  }
});

// ─── Routes: /api/admin/class-types ─────────────────────────────────────────

// GET /api/admin/class-types
app.get("/api/admin/class-types", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM class_types ORDER BY sort_order, name");
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("GET admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/class-types
app.post("/api/admin/class-types", adminMiddleware, async (req, res) => {
  const { name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "name requerido" });
  try {
    const r = await pool.query(
      `INSERT INTO class_types (name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name.trim(), subtitle || null, description || null,
      category || "pilates", intensity || "media",
      level || "Todos los niveles", duration_min || 50, capacity || 10,
      color || "#C9A5A8", emoji || "🏃", sort_order ?? 0]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/class-types/:id
app.put("/api/admin/class-types/:id", adminMiddleware, async (req, res) => {
  const { name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, is_active, sort_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE class_types SET
         name         = COALESCE($1, name),
         subtitle     = COALESCE($2, subtitle),
         description  = COALESCE($3, description),
         category     = COALESCE($4, category),
         intensity    = COALESCE($5, intensity),
         level        = COALESCE($6, level),
         duration_min = COALESCE($7, duration_min),
         capacity     = COALESCE($8, capacity),
         color        = COALESCE($9, color),
         emoji        = COALESCE($10, emoji),
         is_active    = COALESCE($11, is_active),
         sort_order   = COALESCE($12, sort_order),
         updated_at   = NOW()
       WHERE id = $13 RETURNING *`,
      [name || null, subtitle || null, description || null,
      category || null, intensity || null, level || null,
      duration_min || null, capacity || null, color || null,
      emoji || null, is_active ?? null, sort_order ?? null,
      req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/class-types/:id
app.delete("/api/admin/class-types/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM class_types WHERE id = $1", [req.params.id]);
    return res.json({ message: "Eliminado" });
  } catch (err) {
    console.error("DELETE admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/schedule-slots ──────────────────────────────────────

// GET /api/admin/schedule-slots
app.get("/api/admin/schedule-slots", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ss.*, ct.color as class_color, ct.emoji as class_emoji
       FROM schedule_slots ss
       LEFT JOIN class_types ct ON ss.class_type_id = ct.id
       WHERE ss.is_active = true
       ORDER BY ss.time_slot, ss.day_of_week`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/schedule-slots
app.post("/api/admin/schedule-slots", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_type_id, class_type_name, instructor_name } = req.body;
  if (!time_slot?.trim() || !day_of_week) return res.status(400).json({ message: "time_slot y day_of_week requeridos" });
  try {
    // Resolve name from class_type_id if provided
    let ctName = class_type_name || null;
    if (class_type_id && !ctName) {
      const ct = await pool.query("SELECT name FROM class_types WHERE id = $1", [class_type_id]);
      ctName = ct.rows[0]?.name || null;
    }
    const r = await pool.query(
      `INSERT INTO schedule_slots (time_slot, day_of_week, class_type_id, class_type_name, instructor_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ON CONSTRAINT idx_schedule_slots_slot DO UPDATE
         SET class_type_id = EXCLUDED.class_type_id,
             class_type_name = EXCLUDED.class_type_name,
             instructor_name = EXCLUDED.instructor_name
       RETURNING *`,
      [time_slot.trim(), parseInt(day_of_week), class_type_id || null, ctName, instructor_name || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/schedule-slots/:id
app.put("/api/admin/schedule-slots/:id", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_type_id, class_type_name, instructor_name, is_active } = req.body;
  try {
    let ctName = class_type_name || null;
    if (class_type_id && !ctName) {
      const ct = await pool.query("SELECT name FROM class_types WHERE id = $1", [class_type_id]);
      ctName = ct.rows[0]?.name || null;
    }
    const r = await pool.query(
      `UPDATE schedule_slots SET
         time_slot       = COALESCE($1, time_slot),
         day_of_week     = COALESCE($2, day_of_week),
         class_type_id   = COALESCE($3, class_type_id),
         class_type_name = COALESCE($4, class_type_name),
         instructor_name = COALESCE($5, instructor_name),
         is_active       = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [time_slot || null, day_of_week ? parseInt(day_of_week) : null,
      class_type_id || null, ctName, instructor_name || null, is_active ?? null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/schedule-slots/:id
app.delete("/api/admin/schedule-slots/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedule_slots WHERE id = $1", [req.params.id]);
    return res.json({ message: "Eliminado" });
  } catch (err) {
    console.error("DELETE admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/plans (CRUD) ────────────────────────────────────────

// POST /api/admin/plans
app.post("/api/admin/plans", adminMiddleware, async (req, res) => {
  const {
    name, description, price, currency, duration_days, class_limit, class_category,
    features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key,
    discount_price,
  } = req.body;
  if (!name?.trim() || price === undefined) return res.status(400).json({ message: "name y price requeridos" });
  try {
    const validCats = ["pilates", "bienestar", "funcional", "mixto", "all"];
    const cat = validCats.includes(class_category) ? class_category : "all";
    const nonTransferable = parseBooleanFlag(is_non_transferable);
    const nonRepeatable = parseBooleanFlag(is_non_repeatable);
    const safeRepeatKey = nonRepeatable ? String(repeat_key ?? "").trim() || null : null;
    const r = await pool.query(
      `INSERT INTO plans
        (name, description, price, currency, duration_days, class_limit, class_category, features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key, discount_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [name.trim(), description || null, price, currency || "MXN",
      duration_days || 30, class_limit || null,
        cat, JSON.stringify(features || []), is_active ?? true, sort_order ?? 0, nonTransferable, nonRepeatable, safeRepeatKey,
        discount_price != null && discount_price !== "" ? parseFloat(discount_price) : null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/plans error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/plans/:id
app.put("/api/admin/plans/:id", adminMiddleware, async (req, res) => {
  const {
    name, description, price, currency, duration_days, class_limit, class_category,
    features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key,
    discount_price,
  } = req.body;
  try {
    const validCats = ["pilates", "bienestar", "funcional", "mixto", "all"];
    const cat = validCats.includes(class_category) ? class_category : null;
    const nonTransferable = parseBooleanFlag(is_non_transferable);
    const nonRepeatable = parseBooleanFlag(is_non_repeatable);
    const safeRepeatKey = nonRepeatable ? String(repeat_key ?? "").trim() || null : null;
    const r = await pool.query(
      `UPDATE plans SET
         name          = COALESCE($1, name),
         description   = COALESCE($2, description),
         price         = COALESCE($3, price),
         currency      = COALESCE($4, currency),
         duration_days = COALESCE($5, duration_days),
         class_limit   = $6,
         class_category= COALESCE($7, class_category),
         features      = COALESCE($8, features),
         is_active     = COALESCE($9, is_active),
         sort_order    = COALESCE($10, sort_order),
         is_non_transferable = COALESCE($11, is_non_transferable),
         is_non_repeatable   = COALESCE($12, is_non_repeatable),
         repeat_key          = CASE WHEN COALESCE($12, is_non_repeatable) = true THEN $13 ELSE NULL END,
         discount_price      = $14,
         updated_at    = NOW()
       WHERE id = $15 RETURNING *`,
      [name || null, description || null, price ?? null, currency || null,
      duration_days || null, class_limit ?? null,
        cat, features ? JSON.stringify(features) : null,
      is_active ?? null, sort_order ?? null, nonTransferable, nonRepeatable, safeRepeatKey,
        discount_price != null && discount_price !== "" ? parseFloat(discount_price) : null,
        req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/plans error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/plans/:id
app.delete("/api/admin/plans/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("UPDATE plans SET is_active = false WHERE id = $1", [req.params.id]);
    return res.json({ message: "Plan desactivado" });
  } catch (err) {
    console.error("DELETE admin/plans error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/schedule (schedule_templates) ───────────────────────

// GET /api/admin/schedule
app.get("/api/admin/schedule", adminMiddleware, async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM schedule_templates ORDER BY time_slot ASC, day_of_week ASC"
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/schedule
app.post("/api/admin/schedule", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_label, shift } = req.body;
  if (!time_slot || !day_of_week || !class_label) {
    return res.status(400).json({ message: "time_slot, day_of_week y class_label requeridos" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO schedule_templates (time_slot, day_of_week, class_label, shift)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (time_slot, day_of_week) DO UPDATE
         SET class_label = EXCLUDED.class_label, shift = EXCLUDED.shift, updated_at = NOW()
       RETURNING *`,
      [time_slot, Number(day_of_week), class_label.toUpperCase(), shift || "morning"]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/schedule/:id
app.put("/api/admin/schedule/:id", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_label, shift, is_active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE schedule_templates SET
         time_slot   = COALESCE($1, time_slot),
         day_of_week = COALESCE($2, day_of_week),
         class_label = COALESCE($3, class_label),
         shift       = COALESCE($4, shift),
         is_active   = COALESCE($5, is_active),
         updated_at  = NOW()
       WHERE id = $6 RETURNING *`,
      [time_slot || null, day_of_week ? Number(day_of_week) : null,
      class_label ? class_label.toUpperCase() : null,
      shift || null, is_active ?? null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/schedule/:id
app.delete("/api/admin/schedule/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedule_templates WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/packages ──────────────────────────────────────────────────

// GET /api/packages  (público — landing + checkout)
app.get("/api/packages", async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM packages WHERE is_active = true ORDER BY category ASC, sort_order ASC"
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/packages
app.post("/api/admin/packages", adminMiddleware, async (req, res) => {
  const { name, num_classes, price, category, validity_days, sort_order } = req.body;
  if (!name?.trim() || !num_classes || price === undefined || !category) {
    return res.status(400).json({ message: "name, num_classes, price y category requeridos" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO packages (name, num_classes, price, category, validity_days, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), num_classes, Number(price), category, validity_days || 30, sort_order || 0]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/packages/:id
app.put("/api/admin/packages/:id", adminMiddleware, async (req, res) => {
  const { name, num_classes, price, category, validity_days, is_active, sort_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE packages SET
         name          = COALESCE($1, name),
         num_classes   = COALESCE($2, num_classes),
         price         = COALESCE($3, price),
         category      = COALESCE($4, category),
         validity_days = COALESCE($5, validity_days),
         is_active     = COALESCE($6, is_active),
         sort_order    = COALESCE($7, sort_order),
         updated_at    = NOW()
       WHERE id = $8 RETURNING *`,
      [name || null, num_classes || null,
      price !== undefined ? Number(price) : null,
      category || null, validity_days ?? null,
      is_active ?? null, sort_order ?? null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/packages/:id
app.delete("/api/admin/packages/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM packages WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE admin/packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin (protected admin routes) ────────────────────────────

// GET /api/users/:id — get single user (admin)
app.get("/api/users/:id", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ data: mapUser(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/class-types — public alias for admin/class-types
app.get("/api/class-types", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM class_types WHERE is_active = true ORDER BY sort_order ASC");
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/public/mp-config — devuelve la Public Key de MercadoPago.
// Es PÚBLICA por diseño (se usa en SDK del navegador) y aquí queda lista para
// cuando integremos Bricks / Checkout embebido. Devuelve string vacío si la
// variable no está configurada.
app.get("/api/public/mp-config", (_req, res) => {
  return res.json({ data: { publicKey: MP_PUBLIC_KEY, currency: MP_CURRENCY } });
});

// GET /api/public/instructors — public (no auth) active instructors for homepage
app.get("/api/public/instructors", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT i.id, i.display_name, i.bio, i.specialties,
              ${INSTRUCTOR_PHOTO_SQL} AS photo_url,
              i.photo_focus_x, i.photo_focus_y
         FROM instructors i WHERE i.is_active = true ORDER BY i.created_at ASC`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/public/review-tags — public (no auth) review tags for client review form
app.get("/api/public/review-tags", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM review_tags ORDER BY name");
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/class-types — alias CRUD (admin)
app.post("/api/class-types", adminMiddleware, async (req, res) => {
  const { name, color, category, defaultDuration, maxCapacity, isActive } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "name requerido" });
  const validCategories = ["pilates", "bienestar", "funcional", "mixto", "all"];
  const cat = validCategories.includes(category) ? category : "pilates";
  try {
    const r = await pool.query(
      `INSERT INTO class_types (name, color, category, duration_min, capacity, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,0) RETURNING *`,
      [name.trim(), color || "#C9A5A8", cat, defaultDuration || 60, maxCapacity || 10, isActive !== false]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/class-types/:id — alias CRUD (admin)
app.put("/api/class-types/:id", adminMiddleware, async (req, res) => {
  const { name, color, category, defaultDuration, maxCapacity, isActive } = req.body;
  const validCategories = ["pilates", "bienestar", "funcional", "mixto", "all"];
  const cat = validCategories.includes(category) ? category : null;
  try {
    const r = await pool.query(
      `UPDATE class_types SET name=COALESCE($1,name), color=COALESCE($2,color),
       category=COALESCE($3,category),
       duration_min=COALESCE($4,duration_min), capacity=COALESCE($5,capacity),
       is_active=COALESCE($6,is_active), updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name || null, color || null, cat, defaultDuration || null, maxCapacity || null, isActive ?? null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/class-types/:id — alias CRUD (admin)
app.delete("/api/class-types/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM class_types WHERE id = $1", [req.params.id]);
    return res.json({ message: "Eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/classes — admin creates a class (alias)
app.post("/api/classes", adminMiddleware, async (req, res) => {
  try {
    const { classTypeId, instructorId, startTime, endTime, maxCapacity, capacity, notes } = req.body;
    if (!classTypeId) return res.status(400).json({ message: "classTypeId requerido" });
    if (!instructorId) return res.status(400).json({ message: "instructorId requerido" });

    // startTime may come as a full ISO/datetime-local string "YYYY-MM-DDTHH:mm"
    // The classes table uses separate DATE and TIME columns
    let dateStr, startTimeStr, endTimeStr;
    if (startTime && startTime.includes("T")) {
      const [d, t] = startTime.split("T");
      dateStr = d;
      startTimeStr = t.slice(0, 5); // "HH:mm"
    } else {
      return res.status(400).json({ message: "startTime debe ser datetime (YYYY-MM-DDTHH:mm)" });
    }
    if (endTime && endTime.includes("T")) {
      endTimeStr = endTime.split("T")[1].slice(0, 5);
    } else if (endTime && endTime.length === 5) {
      endTimeStr = endTime; // already "HH:mm"
    } else {
      // default +55 min
      const [h, m] = startTimeStr.split(":").map(Number);
      const total = h * 60 + m + 55;
      endTimeStr = String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    }
    const cap = maxCapacity ?? capacity ?? 10;
    const r = await pool.query(
      `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled') RETURNING *`,
      [classTypeId, instructorId, dateStr, startTimeStr, endTimeStr, cap, notes || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { console.error("POST /classes error:", err); return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/classes/:id/cancel
app.put("/api/classes/:id/cancel", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE classes SET status='cancelled', updated_at=NOW() WHERE id=$1 RETURNING *", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Clase no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/classes/week — clear classes in date range
// DELETE /api/admin/classes/force-range — borra clases en [startDate, endDate]
// AUNQUE haya reservas activas. Elimina primero las bookings asociadas
// (status independiente) y luego las clases, en una transacción. NO toca
// membresías ni devuelve créditos. Útil para limpiar test data.
app.delete("/api/admin/classes/force-range", adminMiddleware, async (req, res) => {
  const { startDate, endDate } = req.body || {};
  const start = typeof startDate === "string" ? startDate.slice(0, 10) : null;
  const end = typeof endDate === "string" ? endDate.slice(0, 10) : null;
  if (!start || !end) return res.status(400).json({ message: "startDate y endDate requeridos" });
  if (start > end) return res.status(400).json({ message: "Rango inválido" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Capturar IDs antes para reportar
    const classRows = await client.query(
      "SELECT id FROM classes WHERE date >= $1 AND date <= $2",
      [start, end]
    );
    const classIds = classRows.rows.map((r) => r.id);
    if (classIds.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ deleted_classes: 0, deleted_bookings: 0, classIds: [] });
    }
    // Borrar bookings ligadas a esas clases. Sin retornar créditos a membresías:
    // el admin pidió explícitamente que no se ajustaran.
    const bookingsDel = await client.query(
      "DELETE FROM bookings WHERE class_id = ANY($1::uuid[]) RETURNING id",
      [classIds]
    );
    // Tablas hijas opcionales — savepoint para no abortar la transacción si la
    // tabla no existe en este schema o no tiene la columna class_id.
    for (const sql of [
      "DELETE FROM reviews WHERE class_id = ANY($1::uuid[])",
      "DELETE FROM waitlist WHERE class_id = ANY($1::uuid[])",
      "DELETE FROM class_attendees WHERE class_id = ANY($1::uuid[])",
    ]) {
      await client.query("SAVEPOINT sp_optional");
      try {
        await client.query(sql, [classIds]);
        await client.query("RELEASE SAVEPOINT sp_optional");
      } catch (_e) {
        await client.query("ROLLBACK TO SAVEPOINT sp_optional");
      }
    }
    // Borrar las clases
    const classesDel = await client.query(
      "DELETE FROM classes WHERE id = ANY($1::uuid[]) RETURNING id",
      [classIds]
    );
    await client.query("COMMIT");
    return res.json({
      deleted_classes: classesDel.rowCount,
      deleted_bookings: bookingsDel.rowCount,
      classIds,
      startDate: start,
      endDate: end,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("DELETE /admin/classes/force-range error:", err);
    return res.status(500).json({ message: err.message || "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/admin/classes/duplicate-week — replica la semana origen N semanas adelante.
// Body: { sourceWeekStart: "YYYY-MM-DD" (lunes), weeksAhead: 1..12 }
// Para cada semana destino k (1..N), inserta una copia de cada clase del rango
// [sourceWeekStart, sourceWeekStart+6] con `date` desplazada k*7 días.
// Salta inserciones que generarían duplicado exacto (clase con mismo tipo,
// instructor, fecha y hora ya existe). Devuelve totales.
app.post("/api/admin/classes/duplicate-week", adminMiddleware, async (req, res) => {
  const sourceStart = typeof req.body?.sourceWeekStart === "string"
    ? req.body.sourceWeekStart.slice(0, 10) : null;
  const weeksAhead = Math.max(1, Math.min(12, parseInt(req.body?.weeksAhead || "1", 10) || 1));
  if (!sourceStart || !/^\d{4}-\d{2}-\d{2}$/.test(sourceStart)) {
    return res.status(400).json({ message: "sourceWeekStart inválido (formato YYYY-MM-DD)" });
  }
  const sourceEndDate = new Date(sourceStart + "T00:00:00");
  sourceEndDate.setDate(sourceEndDate.getDate() + 6);
  const sourceEnd = sourceEndDate.toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Tomamos solo las clases NO canceladas como plantilla
    const sourceRes = await client.query(
      `SELECT class_type_id, instructor_id, date, start_time, end_time,
              max_capacity, status, notes, level
         FROM classes
        WHERE date >= $1 AND date <= $2 AND status != 'cancelled'`,
      [sourceStart, sourceEnd]
    );
    if (sourceRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "La semana origen no tiene clases para duplicar." });
    }

    let created = 0;
    let skipped = 0;
    const perWeek = [];
    for (let k = 1; k <= weeksAhead; k++) {
      let weekCreated = 0;
      let weekSkipped = 0;
      for (const row of sourceRes.rows) {
        const srcDate = row.date instanceof Date
          ? row.date
          : new Date(String(row.date).slice(0, 10) + "T00:00:00");
        const newDate = new Date(srcDate);
        newDate.setDate(srcDate.getDate() + 7 * k);
        const newDateStr = newDate.toISOString().slice(0, 10);
        // Verifica duplicado: misma clase ya existe en el target
        const dupCheck = await client.query(
          `SELECT 1 FROM classes
            WHERE class_type_id = $1 AND date = $2
              AND start_time = $3 AND status != 'cancelled'
            LIMIT 1`,
          [row.class_type_id, newDateStr, row.start_time]
        );
        if (dupCheck.rows.length) { weekSkipped++; continue; }
        await client.query(
          `INSERT INTO classes
            (class_type_id, instructor_id, date, start_time, end_time,
             max_capacity, status, notes, level)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [row.class_type_id, row.instructor_id, newDateStr, row.start_time, row.end_time,
           row.max_capacity, row.status || "scheduled", row.notes, row.level]
        );
        weekCreated++;
      }
      created += weekCreated;
      skipped += weekSkipped;
      perWeek.push({ weekOffset: k, created: weekCreated, skipped: weekSkipped });
    }
    await client.query("COMMIT");
    return res.json({
      data: {
        sourceWeekStart: sourceStart,
        weeksAhead,
        created,
        skipped,
        perWeek,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /admin/classes/duplicate-week error:", err);
    return res.status(500).json({ message: err.message || "Error interno" });
  } finally {
    client.release();
  }
});

app.delete("/api/classes/week", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    const start = typeof startDate === "string" ? startDate.slice(0, 10) : null;
    const end = typeof endDate === "string" ? endDate.slice(0, 10) : null;

    if (!start || !end) {
      return res.status(400).json({ message: "startDate y endDate requeridos" });
    }
    if (start > end) {
      return res.status(400).json({ message: "Rango de fechas inválido" });
    }

    const activeBookingsRes = await pool.query(
      `SELECT COUNT(*)::INT AS total
       FROM bookings b
       JOIN classes c ON c.id = b.class_id
       WHERE c.date >= $1 AND c.date <= $2
         AND b.status != 'cancelled'`,
      [start, end]
    );
    const activeBookings = Number(activeBookingsRes.rows?.[0]?.total ?? 0);
    if (activeBookings > 0) {
      return res.status(409).json({
        message: "No se puede limpiar esta semana porque hay reservas activas.",
        activeBookings,
      });
    }

    const deleted = await pool.query(
      "DELETE FROM classes WHERE date >= $1 AND date <= $2 RETURNING id",
      [start, end]
    );
    return res.json({
      deleted: deleted.rowCount ?? deleted.rows.length,
      startDate: start,
      endDate: end,
    });
  } catch (err) {
    console.error("DELETE /classes/week error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

function toDbDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addMinutesToTimeString(timeValue, minutesToAdd) {
  const [hours, minutes] = String(timeValue || "00:00").split(":").map(Number);
  const totalMinutes = (hours * 60) + minutes + minutesToAdd;
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalizedMinutes / 60)).padStart(2, "0")}:${String(normalizedMinutes % 60).padStart(2, "0")}`;
}

function parseTimeSlotTo24Hour(timeValue) {
  const raw = String(timeValue || "").trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3];

  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// POST /api/classes/generate — bulk generate
app.post("/api/classes/generate", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, classTypeId, instructorId, daysOfWeek, startTime, endTime, maxCapacity = 10 } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate y endDate requeridos" });
    if (!classTypeId) return res.status(400).json({ message: "classTypeId requerido" });
    if (!instructorId) return res.status(400).json({ message: "instructorId requerido" });
    if (!Array.isArray(daysOfWeek) || !daysOfWeek.length) return res.status(400).json({ message: "Selecciona al menos un día" });
    if (!/^\d{2}:\d{2}$/.test(String(startTime || "")) || !/^\d{2}:\d{2}$/.test(String(endTime || ""))) {
      return res.status(400).json({ message: "startTime y endTime deben tener formato HH:mm" });
    }

    const created = [];
    // Append T00:00:00 to parse as local midnight (not UTC)
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");

    // If classTypeId + daysOfWeek provided → generate from form data
    if (classTypeId && Array.isArray(daysOfWeek) && daysOfWeek.length && startTime && endTime) {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const jsDay = d.getDay(); // 0=Sun,1=Mon...
        if (!daysOfWeek.includes(jsDay)) continue;
        const classDate = toDbDateString(d);
        const exists = await pool.query(
          "SELECT id FROM classes WHERE date = $1 AND start_time = $2 AND class_type_id = $3",
          [classDate, startTime, classTypeId]
        );
        if (exists.rows.length) continue;
        const r = await pool.query(
          `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
           VALUES ($1,$2,$3,$4,$5,$6,'scheduled') RETURNING *`,
          [classTypeId, instructorId, classDate, startTime, endTime, maxCapacity]
        );
        created.push(r.rows[0]);
      }
      return res.json({ created: created.length, data: created });
    }

    // Fallback: generate from schedule_templates
    const slotsRes = await pool.query("SELECT * FROM schedule_templates WHERE is_active = true");
    const classTypeRes = await pool.query("SELECT id, name, category FROM class_types WHERE is_active = true");
    const classTypes = classTypeRes.rows;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
      const daySlots = slotsRes.rows.filter(s => s.day_of_week === dayOfWeek);
      for (const slot of daySlots) {
        const startTimeValue = parseTimeSlotTo24Hour(slot.time_slot);
        if (!startTimeValue) continue;
        const classDate = toDbDateString(d);
        const endTimeValue = addMinutesToTimeString(startTimeValue, 55);
        const label = slot.class_label?.toLowerCase();
        let ct = classTypes.find(c => c.category?.toLowerCase() === label || c.name?.toLowerCase().includes(label));
        if (!ct) ct = classTypes[0];
        if (!ct) continue;
        const exists = await pool.query(
          "SELECT id FROM classes WHERE date = $1 AND start_time = $2 AND class_type_id = $3",
          [classDate, startTimeValue, ct.id]
        );
        if (exists.rows.length) continue;
        const r = await pool.query(
          `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
           VALUES ($1,$2,$3,$4,$5,10,'scheduled') RETURNING *`,
          [ct.id, instructorId, classDate, startTimeValue, endTimeValue]
        );
        created.push(r.rows[0]);
      }
    }
    return res.json({ created: created.length, data: created });
  } catch (err) { console.error("generate classes error:", err); return res.status(500).json({ message: "Error interno" }); }
});

// ─── Schedules (schedule_slots) CRUD ────────────────────────────────────────

// GET /api/schedules
app.get("/api/schedules", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM schedule_slots ORDER BY day_of_week, time_slot");
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/schedules
app.post("/api/schedules", adminMiddleware, async (req, res) => {
  try {
    const { timeSlot, dayOfWeek, classTypeName, classTypeId, instructorName, isActive = true } = req.body;
    if (!timeSlot || !dayOfWeek) return res.status(400).json({ message: "timeSlot y dayOfWeek requeridos" });
    const r = await pool.query(
      `INSERT INTO schedule_slots (time_slot, day_of_week, class_type_id, class_type_name, instructor_name, is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [timeSlot, dayOfWeek, classTypeId || null, classTypeName || null, instructorName || null, isActive]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/schedules/:id
app.put("/api/schedules/:id", adminMiddleware, async (req, res) => {
  try {
    const { timeSlot, dayOfWeek, classTypeName, classTypeId, instructorName, isActive } = req.body;
    const r = await pool.query(
      `UPDATE schedule_slots SET time_slot=$1, day_of_week=$2, class_type_id=$3, class_type_name=$4, instructor_name=$5, is_active=$6
       WHERE id=$7 RETURNING *`,
      [timeSlot, dayOfWeek, classTypeId || null, classTypeName || null, instructorName || null, isActive !== false, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Slot no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/schedules/:id
app.delete("/api/schedules/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedule_slots WHERE id = $1", [req.params.id]);
    return res.json({ message: "Slot eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/pos/checkout — alias for /pos/sale
app.post("/api/pos/checkout", adminMiddleware, async (req, res) => {
  try {
    const { userId, items, paymentMethod = "efectivo", discountCode } = req.body;
    const result = await processPosSale({ userId, items, paymentMethod, discountCode });
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    return res.status(201).json({ data: result.data });
  } catch (err) {
    console.error("pos/checkout error:", err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    return res.status(status).json({ message: err?.message || "Error interno" });
  }
});

// ─── Loyalty config & rewards admin ─────────────────────────────────────────

// GET/PUT /api/loyalty/config
app.get("/api/loyalty/config", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
    const defaults = { enabled: true, points_per_class: 10, points_per_peso: 1, welcome_bonus: 50, birthday_bonus: 100 };
    return res.json({ data: r.rows.length ? { ...defaults, ...r.rows[0].value } : defaults });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/loyalty/config", adminMiddleware, async (req, res) => {
  try {
    // Strip referral_bonus if accidentally sent
    const { referral_bonus, pointsPerReferral, ...clean } = req.body;
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('loyalty_config', $1)
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [JSON.stringify(clean)]
    );
    invalidateSettingsCache("loyalty_config");
    return res.json({ data: clean });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/loyalty/rewards — admin CRUD for loyalty rewards
app.post("/api/loyalty/rewards", adminMiddleware, async (req, res) => {
  try {
    const { name, description, points_cost, reward_type = "custom", reward_value = "", is_active = true, stock = null } = req.body;
    if (!name || !points_cost) return res.status(400).json({ message: "name y points_cost requeridos" });
    const r = await pool.query(
      "INSERT INTO loyalty_rewards (name, description, points_cost, reward_type, reward_value, stock, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [name, description || null, points_cost, reward_type, reward_value || null, stock || null, is_active]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { console.error("loyalty rewards POST:", err); return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/loyalty/rewards/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, description, points_cost, reward_type, reward_value, stock, is_active } = req.body;
    const r = await pool.query(
      "UPDATE loyalty_rewards SET name=$1, description=$2, points_cost=$3, reward_type=$4, reward_value=$5, stock=$6, is_active=$7 WHERE id=$8 RETURNING *",
      [name, description || null, points_cost, reward_type || "custom", reward_value || null, stock || null, is_active !== false, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Recompensa no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { console.error("loyalty rewards PUT:", err); return res.status(500).json({ message: "Error interno" }); }
});

app.delete("/api/loyalty/rewards/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM loyalty_rewards WHERE id=$1", [req.params.id]);
    return res.json({ message: "Recompensa eliminada" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/loyalty/points/:userId
app.get("/api/loyalty/points/:userId", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN type='earn' OR type='adjust' THEN points ELSE -points END),0) AS balance FROM loyalty_transactions WHERE user_id=$1",
      [req.params.userId]
    );
    return res.json({ data: { balance: parseInt(r.rows[0].balance) } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Reports sub-routes ──────────────────────────────────────────────────────

app.get("/api/reports/overview", adminMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const REAL_BOOKING = "b.status IN ('confirmed','checked_in','no_show')";
    const CLASS_DONE = "(c.status = 'completed' OR (c.status = 'scheduled' AND c.date < CURRENT_DATE))";
    // Lugares/personas por reserva: alumna con invitada = 2, walk-in/normal = 1.
    const SLOTS = "(CASE WHEN b.user_id IS NOT NULL AND b.guest_name IS NOT NULL AND b.guest_name <> '' THEN 2 ELSE 1 END)";
    const [members, revenue, bookings, classes, newMembers, reviews] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM memberships WHERE status='active'"),
      // Ingresos del mes: órdenes aprobadas + membresías de alta manual admin.
      pool.query(
        `SELECT
           (SELECT COALESCE(SUM(total_amount),0) FROM orders
              WHERE status='approved' AND created_at >= $1)
         + (SELECT COALESCE(SUM(COALESCE(NULLIF(p.discount_price,0), p.price)),0)
              FROM memberships m JOIN plans p ON p.id=m.plan_id
             WHERE m.order_id IS NULL AND m.created_at >= $1) AS total`,
        [monthStart]
      ),
      // reservas y asistencia de las clases programadas DENTRO del mes actual
      pool.query(
        // Cuenta PERSONAS (lugares), no filas: una alumna con invitada son 2.
        `SELECT
            COALESCE(SUM(${SLOTS}) FILTER (WHERE ${REAL_BOOKING}), 0)                          AS total,
            COALESCE(SUM(${SLOTS}) FILTER (WHERE b.status = 'checked_in'), 0)                   AS attended,
            COALESCE(SUM(${SLOTS}) FILTER (WHERE b.status = 'no_show'), 0)                      AS no_shows,
            COALESCE(SUM(${SLOTS}) FILTER (WHERE b.status = 'checked_in' AND ${CLASS_DONE}), 0) AS attended_past,
            COALESCE(SUM(${SLOTS}) FILTER (WHERE ${REAL_BOOKING} AND ${CLASS_DONE}), 0)         AS booked_past
           FROM bookings b
           JOIN classes c ON c.id = b.class_id
          WHERE c.date >= $1::date AND c.date < ($1::date + INTERVAL '1 month')`,
        [monthStart]
      ),
      pool.query("SELECT COUNT(*) FROM classes WHERE status='scheduled' AND date >= CURRENT_DATE"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='client' AND created_at>=$1", [monthStart]),
      // reseñas: histórico completo (la vista no acota a un mes)
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE is_approved = false) AS pending,
                COUNT(*) FILTER (WHERE created_at >= $1)    AS this_month,
                COALESCE(AVG(rating), 0) AS average
           FROM reviews`,
        [monthStart]
      ),
    ]);
    const monthlyBookings = parseInt(bookings.rows[0].total || 0);
    const attended = parseInt(bookings.rows[0].attended || 0);
    const noShows = parseInt(bookings.rows[0].no_shows || 0);
    const attendedPast = parseInt(bookings.rows[0].attended_past || 0);
    const bookedPast = parseInt(bookings.rows[0].booked_past || 0);
    const classOccupancyRate = bookedPast > 0
      ? Number(((attendedPast / bookedPast) * 100).toFixed(1))
      : null; // null = aún no hay clases impartidas este mes

    return res.json({
      data: {
        activeMembers: parseInt(members.rows[0].count),
        monthlyRevenue: parseFloat(revenue.rows[0].total),
        monthlyBookings,
        monthlyAttended: attended,
        monthlyNoShows: noShows,
        upcomingClasses: parseInt(classes.rows[0].count),
        classOccupancyRate,
        classesBookedPast: bookedPast,
        newMembersThisMonth: parseInt(newMembers.rows[0].count || 0),
        churnRate: 0,
        reviewsTotal: parseInt(reviews.rows[0].total || 0),
        reviewsPending: parseInt(reviews.rows[0].pending || 0),
        reviewsThisMonth: parseInt(reviews.rows[0].this_month || 0),
        reviewsAverage: Number(parseFloat(reviews.rows[0].average || 0).toFixed(1)),
      }
    });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/revenue", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      // Ingresos por mes = órdenes aprobadas + membresías de alta manual
      // (admin, sin order_id). Antes solo contaba orders y ocultaba la
      // operación manual del estudio.
      `WITH months AS (
         SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.n) AS month_start
         FROM generate_series(0, 11) AS gs(n)
       ),
       orders_by_month AS (
         SELECT DATE_TRUNC('month', created_at) AS month_start,
                COALESCE(SUM(total_amount), 0) AS total,
                COUNT(*) AS count
           FROM orders
          WHERE status = 'approved'
          GROUP BY 1
       ),
       manual_by_month AS (
         SELECT DATE_TRUNC('month', m.created_at) AS month_start,
                COALESCE(SUM(COALESCE(NULLIF(p.discount_price,0), p.price)), 0) AS total,
                COUNT(*) AS count
           FROM memberships m JOIN plans p ON p.id = m.plan_id
          WHERE m.order_id IS NULL
          GROUP BY 1
       )
       SELECT m.month_start AS month,
              COALESCE(o.total, 0) + COALESCE(mm.total, 0) AS amount,
              COALESCE(o.count, 0) + COALESCE(mm.count, 0) AS count
         FROM months m
         LEFT JOIN orders_by_month o  ON o.month_start  = m.month_start
         LEFT JOIN manual_by_month mm ON mm.month_start = m.month_start
        ORDER BY m.month_start ASC`
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// Detalle de órdenes aprobadas en un rango de fechas (para el filtro de
// Reportes). start/end son "YYYY-MM-DD" inclusivos. Devuelve la lista + total.
app.get("/api/reports/orders", adminMiddleware, async (req, res) => {
  try {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const start = dateRe.test(String(req.query.start || "")) ? req.query.start : null;
    const end = dateRe.test(String(req.query.end || "")) ? req.query.end : null;
    if (!start || !end) {
      return res.status(400).json({ message: "Parámetros start y end (YYYY-MM-DD) requeridos" });
    }
    const r = await pool.query(
      `SELECT o.id, o.order_number, o.total_amount, o.payment_method,
              o.created_at, o.approved_at,
              u.display_name AS client_name, u.email AS client_email,
              p.name AS plan_name
         FROM orders o
         JOIN users u ON u.id = o.user_id
         LEFT JOIN plans p ON p.id = o.plan_id
        WHERE o.status = 'approved'
          AND o.created_at >= $1::date
          AND o.created_at < ($2::date + INTERVAL '1 day')
        ORDER BY o.created_at DESC`,
      [start, end]
    );
    const total = r.rows.reduce((s, x) => s + Number(x.total_amount || 0), 0);
    return res.json({ data: { orders: r.rows, total, count: r.rows.length } });
  } catch (err) {
    console.error("[GET /reports/orders]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

app.get("/api/reports/classes", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      // bookings/attended/no_shows cuentan PERSONAS (alumna+invitada = 2).
      `SELECT ct.name,
              COUNT(DISTINCT c.id)::INT AS classes_total,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'scheduled' AND c.date >= CURRENT_DATE)::INT AS classes_upcoming,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'completed' OR (c.status = 'scheduled' AND c.date < CURRENT_DATE))::INT AS classes_done,
              COALESCE(SUM(CASE WHEN b.user_id IS NOT NULL AND b.guest_name IS NOT NULL AND b.guest_name <> '' THEN 2 ELSE 1 END) FILTER (WHERE b.status IN ('confirmed','checked_in','no_show')), 0)::INT AS bookings,
              COALESCE(SUM(CASE WHEN b.user_id IS NOT NULL AND b.guest_name IS NOT NULL AND b.guest_name <> '' THEN 2 ELSE 1 END) FILTER (WHERE b.status = 'checked_in'), 0)::INT AS attended,
              COALESCE(SUM(CASE WHEN b.user_id IS NOT NULL AND b.guest_name IS NOT NULL AND b.guest_name <> '' THEN 2 ELSE 1 END) FILTER (WHERE b.status = 'no_show'), 0)::INT AS no_shows,
              COUNT(b.id) FILTER (WHERE b.status = 'cancelled')::INT AS cancelled
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       LEFT JOIN bookings b ON b.class_id = c.id
       GROUP BY ct.name
       ORDER BY bookings DESC, classes_total DESC
       LIMIT 10`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/retention", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) AS new_this_month
       FROM users WHERE role='client'`
    );
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/instructors", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT i.id,
              i.display_name AS name,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'scheduled' AND c.date >= CURRENT_DATE)::INT AS classes_upcoming,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'completed' OR (c.status = 'scheduled' AND c.date < CURRENT_DATE))::INT AS classes_done,
              COUNT(DISTINCT b.user_id) FILTER (WHERE b.status IN ('confirmed','checked_in','no_show'))::INT AS unique_students,
              COUNT(b.id) FILTER (WHERE b.status = 'checked_in')::INT AS attended
       FROM instructors i
       LEFT JOIN classes c ON c.instructor_id = i.id
       LEFT JOIN bookings b ON b.class_id = c.id
       WHERE i.is_active = true
       GROUP BY i.id, i.display_name
       ORDER BY classes_done DESC, classes_upcoming DESC, i.display_name ASC`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Reviews public endpoints & admin ───────────────────────────────────────

// GET /api/reviews (public, approved only; admin sees all via /api/admin/reviews)
app.get("/api/reviews", async (req, res) => {
  try {
    const { limit = 50, approved } = req.query;
    let q = `SELECT rv.*, u.display_name AS user_name FROM reviews rv LEFT JOIN users u ON rv.user_id=u.id WHERE 1=1`;
    const params = [];
    if (approved !== "false") { q += ` AND rv.is_approved=true`; }
    params.push(parseInt(limit)); q += ` ORDER BY rv.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/reviews/stats
app.get("/api/reviews/stats", async (req, res) => {
  try {
    const r = await pool.query("SELECT AVG(rating) AS average, COUNT(*) AS total FROM reviews WHERE is_approved=true");
    const dist = await pool.query("SELECT rating, COUNT(*) FROM reviews WHERE is_approved=true GROUP BY rating ORDER BY rating DESC");
    return res.json({ data: { average: parseFloat(r.rows[0].average || 0).toFixed(1), total: parseInt(r.rows[0].total), distribution: dist.rows } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// Review tags (admin)
app.get("/api/review-tags", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM review_tags ORDER BY name").catch(() => ({ rows: [] }));
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.post("/api/review-tags", adminMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    const r = await pool.query(
      "INSERT INTO review_tags (name, color) VALUES ($1,$2) RETURNING *",
      [name, color || "#C9A5A8"]
    ).catch(() => ({ rows: [{ id: "1", name, color }] }));
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/review-tags/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    const r = await pool.query(
      "UPDATE review_tags SET name=$1, color=$2 WHERE id=$3 RETURNING *",
      [name, color || "#C9A5A8", req.params.id]
    ).catch(() => ({ rows: [{ id: req.params.id, name, color }] }));
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.delete("/api/review-tags/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM review_tags WHERE id=$1", [req.params.id]).catch(() => { });
    return res.json({ message: "Tag eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Settings ────────────────────────────────────────────────────────────────

const PUBLIC_SETTINGS_KEYS = new Set([
  "policies_settings",
  "cancellation_window",
]);

// ─── Settings cache (in-memory, TTL-based, invalidated on write) ────────────
const SETTINGS_CACHE_TTL_MS = 60_000; // 1 minute
const settingsCache = new Map(); // key → { value, expiresAt }

function invalidateSettingsCache(key) {
  if (key) { settingsCache.delete(key); } else { settingsCache.clear(); }
}

async function getSettingValueWithDefaults(key) {
  const cached = settingsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return mergeSettingsWithDefaults(key, cached.value);
  }
  const r = await pool.query("SELECT value FROM settings WHERE key=$1", [key]);
  const raw = r.rows.length ? r.rows[0].value : null;
  settingsCache.set(key, { value: raw, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS });
  return mergeSettingsWithDefaults(key, raw);
}

// Cuenta cuántas cancelaciones de USUARIO ha hecho este alumno **en la membresía
// indicada**. La política: las primeras N cancelaciones de cada membresía son
// "gratis" (devuelven crédito); a partir de la N+1 se descuenta el crédito sin
// devolverlo. N viene de settings.cancellation_window.free_cancellations_per_membership
// (default 2). Se mantiene `free_cancellations_per_month` como llave fallback para
// instalaciones legacy y como alias del valor.
//
// - userId: requerido.
// - membershipId: requerido para evaluación real durante DELETE. Si se omite
//   (p.ej. desde la pantalla del cliente sin contexto de membresía), se elige
//   la membresía activa más reciente del usuario; si no hay ninguna, se devuelve
//   used=0 con la cuota completa.
//
// Devuelve { used, free_per_membership, free_per_month, remaining, membership_id }.
// `free_per_month` se conserva por compatibilidad con clientes ya desplegados.
async function getCancellationQuota(userId, membershipId = null, q = pool) {
  const cfg = await getSettingValueWithDefaults("cancellation_window");
  const rawFree = cfg.free_cancellations_per_membership ?? cfg.free_cancellations_per_month ?? 2;
  const freePerMembership = Math.max(0, Math.min(99, Number(rawFree)));

  // Resolver membresía objetivo si no se proporcionó.
  let targetMembershipId = membershipId;
  if (!targetMembershipId) {
    const memRes = await q.query(
      `SELECT id
         FROM memberships
        WHERE user_id = $1
          AND status = 'active'
          AND (end_date IS NULL OR end_date >= CURRENT_DATE)
        ORDER BY end_date DESC NULLS LAST, created_at DESC
        LIMIT 1`,
      [userId]
    );
    targetMembershipId = memRes.rows[0]?.id ?? null;
  }

  if (!targetMembershipId) {
    return {
      used: 0,
      free_per_membership: freePerMembership,
      free_per_month: freePerMembership,
      remaining: freePerMembership,
      membership_id: null,
    };
  }

  const r = await q.query(
    `SELECT COUNT(*)::int AS n
       FROM bookings
      WHERE user_id = $1
        AND membership_id = $2
        AND cancelled_by = 'user'`,
    [userId, targetMembershipId]
  );
  const used = r.rows[0].n;
  return {
    used,
    free_per_membership: freePerMembership,
    free_per_month: freePerMembership, // alias legacy
    remaining: Math.max(0, freePerMembership - used),
    membership_id: targetMembershipId,
  };
}

app.get("/api/public/settings/:key", async (req, res) => {
  try {
    const { key } = req.params;
    if (!PUBLIC_SETTINGS_KEYS.has(key)) {
      return res.status(403).json({ message: "Configuración no pública" });
    }
    const value = await getSettingValueWithDefaults(key);
    return res.json({ data: value });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

app.get("/api/settings/:key", adminMiddleware, async (req, res) => {
  try {
    const value = await getSettingValueWithDefaults(req.params.key);
    return res.json({ data: value });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/settings/:key", adminMiddleware, async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ message: "Falta `value` en el body" });
    }
    const merged = mergeSettingsWithDefaults(req.params.key, value);
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()",
      [req.params.key, JSON.stringify(merged)]
    );
    invalidateSettingsCache(req.params.key);
    return res.json({ data: { key: req.params.key, value: merged } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Membership date helper ──────────────────────────────────────────────────
// Adds N months (calendar-based) to a YYYY-MM-DD string.
// e.g. addMonths("2026-03-24", 1) → "2026-04-24"
// Handles month-end: addMonths("2026-01-31", 1) → "2026-02-28"
function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // If the day overflowed (e.g. Jan 31 → Mar 3), clamp to last day of target month
  if (d.getDate() !== day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

// Calculates membership end date: plans with duration_days <= 7 use days, otherwise 1 calendar month
function calcMembershipEndDate(startStr, plan) {
  const days = plan.duration_days || 30;
  if (days <= 7) {
    const d = new Date(startStr + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  // Calendar month: 30 days = 1 month, 60 = 2, etc.
  const months = Math.max(1, Math.round(days / 30));
  return addMonths(startStr, months);
}

// ─── Evolution API (WhatsApp) ─────────────────────────────────────────────────

// Helper: normalise phone to WhatsApp format (521XXXXXXXXXX for MX)
function normalisePhone(raw) {
  let phone = String(raw).replace(/\D/g, "");
  if (phone.startsWith("52") && phone.length === 12) return phone;
  if (phone.length === 10) return "52" + phone;
  return phone;
}

// Helper: normalise phone for DB storage (+52XXXXXXXXXX for MX)
function normalizePhoneForStorage(raw) {
  if (!raw) return null;
  let phone = String(raw).trim().replace(/[\s\-()]/g, "");
  if (phone.startsWith("+")) return phone; // already has country code
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return "+52" + digits;
  if (digits.length === 12 && digits.startsWith("52")) return "+" + digits;
  return phone; // return as-is if unrecognized format
}

const EVOLUTION_SEND_DELAY_MS = Number(process.env.EVOLUTION_SEND_DELAY_MS || 1200);
let evolutionSendQueue = Promise.resolve();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendWhatsAppNow(number, text) {
  if (!EVOLUTION_CONFIGURED) {
    const e = new Error("Evolution API no configurada (faltan EVOLUTION_API_URL / EVOLUTION_API_KEY).");
    e.code = "EVOLUTION_NOT_CONFIGURED";
    throw e;
  }
  const payload = { number, text };
  return evolutionApi.post(`/message/sendText/${EVOLUTION_INSTANCE}`, payload);
}

function queueWhatsAppSend(number, text) {
  const run = evolutionSendQueue.then(async () => {
    const jitter = Math.floor(Math.random() * 250);
    return sendWhatsAppNow(number, text).finally(async () => {
      await sleep(Math.max(300, EVOLUTION_SEND_DELAY_MS + jitter));
    });
  });
  // Keep queue alive even if one send fails
  evolutionSendQueue = run.catch(() => { });
  return run;
}

async function getSettingsValue(key, fallback = null) {
  try {
    const cached = settingsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value ?? fallback;
    }
    const r = await pool.query("SELECT value FROM settings WHERE key = $1 LIMIT 1", [key]);
    const raw = r.rows.length ? r.rows[0].value : null;
    settingsCache.set(key, { value: raw, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS });
    return raw ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function renderTemplateVars(template, vars = {}) {
  if (typeof template !== "string" || !template.trim()) return "";
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

async function sendConfiguredWhatsAppTemplate({ templateKey, phone, vars = {}, fallbackMessage = "" }) {
  if (!phone) return { sent: false, reason: "no_phone" };
  const notificationSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  if (notificationSettings?.whatsapp_reminders === false) {
    return { sent: false, reason: "whatsapp_disabled" };
  }
  const templates = await getSettingsValue("notification_templates", DEFAULT_NOTIFICATION_TEMPLATES);
  const templateBody = templates?.[templateKey]?.body || "";
  const rendered = renderTemplateVars(templateBody, vars).trim();
  const text = rendered || String(fallbackMessage || "").trim();
  if (!text) return { sent: false, reason: "empty_message" };
  await queueWhatsAppSend(normalisePhone(phone), text);
  return { sent: true };
}

async function areEmailNotificationsEnabled() {
  const notificationSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  return notificationSettings?.email_reminders !== false;
}

// Webhook (no auth) — receives Evolution API events
app.post("/api/webhook/evolution", async (req, res) => {
  try {
    const body = req.body;
    console.log("[EVOLUTION WEBHOOK]", JSON.stringify(body).slice(0, 400));
    // TODO: handle inbound messages / delivery receipts
    return res.sendStatus(200);
  } catch (err) {
    console.error("[EVOLUTION WEBHOOK ERROR]", err.message);
    return res.sendStatus(200);
  }
});

// GET /api/evolution/status
app.get("/api/evolution/status", adminMiddleware, async (req, res) => {
  if (!EVOLUTION_CONFIGURED) {
    return res.json({
      data: {
        connected: false,
        state: "not_configured",
        instanceExists: false,
        configured: false,
        message: "Evolution API aún no está configurada. Define EVOLUTION_API_URL y EVOLUTION_API_KEY en Railway.",
      },
    });
  }
  try {
    // Check if instance exists first
    let instanceExists = false;
    try {
      const listRes = await evolutionApi.get("/instance/fetchInstances");
      const instances = listRes.data?.data || listRes.data || [];
      instanceExists = Array.isArray(instances)
        ? instances.some((i) =>
          i.instance?.instanceName === EVOLUTION_INSTANCE ||
          i.instanceName === EVOLUTION_INSTANCE ||
          i.name === EVOLUTION_INSTANCE
        )
        : false;
    } catch (_) { instanceExists = false; }

    if (!instanceExists) {
      return res.json({ data: { connected: false, state: "disconnected", instanceExists: false } });
    }

    const r = await evolutionApi.get(`/instance/connectionState/${EVOLUTION_INSTANCE}`);
    const state = r.data?.instance?.state || r.data?.state || "unknown";

    let qrCode = null;
    if (state === "connecting" || state === "qr") {
      try {
        const qrRes = await evolutionApi.get(`/instance/connect/${EVOLUTION_INSTANCE}`);
        qrCode = normalizeQrDataUrl(pickEvolutionQrPayload(qrRes.data));
      } catch (_) { }
    }

    return res.json({
      data: {
        connected: state === "open",
        state: state === "open" ? "connected" : state === "qr" || state === "connecting" ? "qr_pending" : "disconnected",
        number: r.data?.instance?.profileName || null,
        instanceExists: true,
        qrCode,
      },
    });
  } catch (err) {
    console.error("[EVOLUTION STATUS]", err.response?.data || err.message);
    return res.json({ data: { connected: false, state: "disconnected", instanceExists: false } });
  }
});

// POST /api/evolution/connect — create instance (or fetch QR if already exists)
app.post("/api/evolution/connect", adminMiddleware, async (req, res) => {
  if (!EVOLUTION_CONFIGURED) {
    return res.status(503).json({
      data: { state: "not_configured", connected: false },
      message: "WhatsApp (Evolution API) aún no está configurado. Define EVOLUTION_API_URL y EVOLUTION_API_KEY en Railway para habilitar el envío automático.",
    });
  }
  try {
    const isAlreadyInUseError = (status, rawMessage) =>
      status === 409 || status === 403 || /already in use|in use|ya existe/i.test(rawMessage || "");

    // Try creating the instance
    let createData = null;
    let createErrStatus = null;
    let createErrMessage = "";
    let createAlreadyInUse = false;
    try {
      const createRes = await evolutionApi.post("/instance/create", {
        instanceName: EVOLUTION_INSTANCE,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      });
      createData = createRes.data;
    } catch (createErr) {
      createErrStatus = createErr.response?.status ?? null;
      createErrMessage = JSON.stringify(createErr.response?.data || createErr.message || "");
      createAlreadyInUse = isAlreadyInUseError(createErrStatus, createErrMessage);
      // "already in use" is an expected case when the instance already exists.
      if (!createAlreadyInUse) {
        console.error("[EVOLUTION CREATE]", createErr.response?.data || createErr.message);
      } else {
        console.log("[EVOLUTION CREATE] Instance already exists, proceeding to connect:", EVOLUTION_INSTANCE);
      }
    }

    // Extract QR from create response (Evolution v2 returns it inline)
    let qrCode =
      normalizeQrDataUrl(pickEvolutionQrPayload(createData));

    // If not in create response, try the connect endpoint
    if (!qrCode) {
      try {
        const qrRes = await evolutionApi.get(`/instance/connect/${EVOLUTION_INSTANCE}`);
        console.log("[EVOLUTION QR RESPONSE]", JSON.stringify(qrRes.data).slice(0, 300));
        qrCode = normalizeQrDataUrl(pickEvolutionQrPayload(qrRes.data));
      } catch (qrErr) {
        console.error("[EVOLUTION QR FETCH]", qrErr.response?.data || qrErr.message);
      }
    }

    if (!qrCode) {
      // If there is no QR, check if the instance is already linked/open.
      try {
        const stateResp = await evolutionApi.get(`/instance/connectionState/${EVOLUTION_INSTANCE}`);
        const currentState = stateResp.data?.instance?.state || stateResp.data?.state || "unknown";
        if (currentState === "open") {
          return res.json({
            data: {
              state: "connected",
              connected: true,
              message: "WhatsApp ya está conectado en esta instancia",
            },
          });
        }
      } catch (_) {
        // ignore and continue with error mapping below
      }

      if (createAlreadyInUse) {
        return res.status(409).json({
          message: `No se pudo obtener QR para la instancia "${EVOLUTION_INSTANCE}". Ese nombre ya está en uso. Cambia EVOLUTION_INSTANCE_NAME en Railway por un nombre único (ej. pilates-room-studio-2026).`,
        });
      }
      return res.status(502).json({ message: "Evolution respondió sin QR. Intenta nuevamente en unos segundos." });
    }

    return res.json({ data: { qrCode, state: "qr_pending", message: "Escanea el código QR con WhatsApp" } });
  } catch (err) {
    console.error("[EVOLUTION CONNECT]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al conectar con Evolution API" });
  }
});

// POST /api/evolution/disconnect
// Toleramos los casos donde Evolution ya tiene la instancia cerrada o eliminada:
//  - 404: instancia no existe → ya estaba desconectado
//  - 400 con mensaje "not connected": instancia existe pero sin sesión → ya estaba desconectado
//  - 401/403: credenciales mal configuradas → escalar
//  - resto: 500 con el detalle real
app.post("/api/evolution/disconnect", adminMiddleware, async (req, res) => {
  if (!EVOLUTION_CONFIGURED) {
    return res.status(503).json({ message: "Evolution API no está configurado." });
  }
  try {
    await evolutionApi.delete(`/instance/logout/${EVOLUTION_INSTANCE}`);
    return res.json({ data: { message: "WhatsApp desconectado correctamente" } });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const rawMsg = (data?.response?.message || data?.message || err.message || "").toString();
    const alreadyClosed = status === 404 || (status === 400 && /not connected|already (logged out|disconnected)|no session/i.test(rawMsg));
    if (alreadyClosed) {
      return res.json({ data: { message: "Ya estaba desconectado" } });
    }
    console.error("[EVOLUTION DISCONNECT]", status, data || err.message);
    return res.status(500).json({ message: `Error al desconectar WhatsApp: ${rawMsg || "respuesta inválida de Evolution"}` });
  }
});

// POST /api/evolution/reset
// Borra la instancia entera del lado de Evolution. Útil cuando el admin quiere
// vincular un número distinto: hace logout (si aplica) y elimina la instancia,
// para que el siguiente /connect cree una limpia con QR nuevo.
app.post("/api/evolution/reset", adminMiddleware, async (req, res) => {
  if (!EVOLUTION_CONFIGURED) {
    return res.status(503).json({ message: "Evolution API no está configurado." });
  }
  const tolerate = async (fn) => {
    try { await fn(); } catch (err) {
      const status = err.response?.status;
      if (status === 404 || status === 400) return; // ya estaba cerrada / no existe
      throw err;
    }
  };
  try {
    await tolerate(() => evolutionApi.delete(`/instance/logout/${EVOLUTION_INSTANCE}`));
    await tolerate(() => evolutionApi.delete(`/instance/delete/${EVOLUTION_INSTANCE}`));
    return res.json({ data: { message: "Instancia eliminada. Genera un nuevo QR para vincular otro número." } });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error("[EVOLUTION RESET]", status, data || err.message);
    return res.status(500).json({ message: "Error al reiniciar la instancia de WhatsApp." });
  }
});

// POST /api/evolution/send-test  { phone: "5219XXXXXXXXX" }
app.post("/api/evolution/send-test", adminMiddleware, async (req, res) => {
  if (!EVOLUTION_CONFIGURED) {
    return res.status(503).json({ message: "Evolution API no está configurado." });
  }
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Se requiere número de teléfono" });
    const number = normalisePhone(phone);
    await queueWhatsAppSend(
      number,
      "✅ Mensaje de prueba desde VARRE24. ¡WhatsApp conectado correctamente!",
    );
    return res.json({ data: { message: "Mensaje de prueba enviado correctamente" } });
  } catch (err) {
    console.error("[EVOLUTION SEND-TEST]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al enviar mensaje de prueba" });
  }
});

// POST /api/evolution/send-message  { phone, message }
app.post("/api/evolution/send-message", adminMiddleware, async (req, res) => {
  if (!EVOLUTION_CONFIGURED) {
    return res.status(503).json({ message: "Evolution API no está configurado." });
  }
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ message: "Se requieren teléfono y mensaje" });
    const number = normalisePhone(phone);
    await queueWhatsAppSend(number, message);
    return res.json({ data: { message: "Mensaje enviado", number } });
  } catch (err) {
    console.error("[EVOLUTION SEND-MSG]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al enviar mensaje" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Comunicados personalizados (admin → clientes)
// Soporta filtros por audiencia: all, with_active_membership, accepts_communications
// Envía por email y/o WhatsApp con throttling para no saturar Evolution.
// ──────────────────────────────────────────────────────────────────────────
async function resolveBroadcastAudience(audience) {
  let where = "u.role = 'client' AND u.status IS DISTINCT FROM 'deleted'";
  if (audience === "with_active_membership") {
    where += " AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.status = 'active')";
  } else if (audience === "accepts_communications") {
    where += " AND u.accepts_communications = true";
  } else if (audience === "without_membership") {
    where += " AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.status = 'active')";
  }
  const r = await pool.query(`SELECT u.id, u.email, u.display_name, u.phone FROM users u WHERE ${where}`);
  return r.rows;
}

// POST /api/admin/broadcast/email
app.post("/api/admin/broadcast/email", adminMiddleware, async (req, res) => {
  try {
    const { audience = "accepts_communications", subject, body, headline, ctaUrl, ctaText } = req.body || {};
    if (!subject || !body) return res.status(400).json({ message: "subject y body son requeridos" });
    const recipients = await resolveBroadcastAudience(audience);
    if (recipients.length === 0) return res.json({ data: { sent: 0, failed: 0, total: 0 } });

    let sent = 0, failed = 0;
    for (const u of recipients) {
      if (!u.email) { failed += 1; continue; }
      try {
        await sendCustomBroadcast({
          to: u.email,
          name: u.display_name || "",
          subject,
          body,
          headline,
          ctaUrl,
          ctaText,
        });
        sent += 1;
      } catch (err) {
        console.error("[broadcast email]", u.email, err.message);
        failed += 1;
      }
      // Throttling: 80ms entre envíos para no saturar Resend (≈12/s sostenido)
      await sleep(80);
    }
    return res.json({ data: { sent, failed, total: recipients.length } });
  } catch (err) {
    console.error("Broadcast email error:", err);
    return res.status(500).json({ message: err.message || "Error al enviar comunicado" });
  }
});

// POST /api/admin/broadcast/whatsapp
app.post("/api/admin/broadcast/whatsapp", adminMiddleware, async (req, res) => {
  try {
    if (!EVOLUTION_CONFIGURED) {
      return res.status(503).json({ message: "WhatsApp no está configurado. Configura Evolution API en Settings." });
    }
    const { audience = "accepts_communications", message } = req.body || {};
    if (!message || message.trim().length < 2) return res.status(400).json({ message: "message es requerido" });
    const recipients = await resolveBroadcastAudience(audience);
    if (recipients.length === 0) return res.json({ data: { sent: 0, failed: 0, total: 0 } });

    let sent = 0, failed = 0;
    for (const u of recipients) {
      if (!u.phone) { failed += 1; continue; }
      const firstName = (u.display_name || "").split(" ")[0] || "Hola";
      const personalized = String(message).replace(/\{name\}/gi, firstName);
      try {
        await sendWhatsAppNow(u.phone, personalized);
        sent += 1;
      } catch (err) {
        console.error("[broadcast wa]", u.phone, err.message);
        failed += 1;
      }
      // Throttling agresivo: 1.2s entre envíos para no quemar la conexión.
      await sleep(1200);
    }
    return res.json({ data: { sent, failed, total: recipients.length } });
  } catch (err) {
    console.error("Broadcast WA error:", err);
    return res.status(500).json({ message: err.message || "Error al enviar WhatsApp" });
  }
});

// GET /api/admin/broadcast/audience-count?audience=...
app.get("/api/admin/broadcast/audience-count", adminMiddleware, async (req, res) => {
  try {
    const audience = String(req.query.audience || "accepts_communications");
    const recipients = await resolveBroadcastAudience(audience);
    return res.json({ data: { count: recipients.length } });
  } catch (err) {
    return res.status(500).json({ message: "Error" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Cumpleaños — listado y felicitación con email + WhatsApp en un solo POST
// ──────────────────────────────────────────────────────────────────────────

// GET /api/admin/birthdays?window=30
// Devuelve clientes con cumpleaños en los próximos N días (default 30),
// ordenados por proximidad. Calcula días faltantes vía month/day.
app.get("/api/admin/birthdays", adminMiddleware, async (req, res) => {
  try {
    const windowDays = Math.max(1, Math.min(365, Number(req.query.window || 30)));
    const r = await pool.query(
      `WITH dob AS (
         SELECT id, display_name, email, phone,
                CASE WHEN photo_url LIKE 'data:%'
                     THEN '/api/users/' || id || '/photo?v=' || floor(extract(epoch FROM updated_at))::bigint
                     ELSE photo_url END AS photo_url,
                date_of_birth,
                EXTRACT(MONTH FROM date_of_birth)::int AS m,
                EXTRACT(DAY   FROM date_of_birth)::int AS d
           FROM users
          WHERE role = 'client' AND date_of_birth IS NOT NULL
       ),
       calc AS (
         SELECT *,
                CASE
                  WHEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, m, LEAST(d, 28)) >= CURRENT_DATE
                    THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,     m, LEAST(d, 28))
                    ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int + 1, m, LEAST(d, 28))
                END AS next_birthday
           FROM dob
       )
       SELECT id, display_name, email, phone, photo_url, date_of_birth, next_birthday,
              (next_birthday - CURRENT_DATE)::int AS days_until,
              EXTRACT(YEAR FROM AGE(date_of_birth))::int AS current_age
         FROM calc
        WHERE (next_birthday - CURRENT_DATE) <= $1
        ORDER BY next_birthday ASC
        LIMIT 100`,
      [windowDays]
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("Birthdays list error:", err.message);
    return res.status(500).json({ message: "Error al cargar cumpleaños" });
  }
});

// POST /api/admin/birthdays/:userId/greet
// body: { message, sendEmail = true, sendWhatsapp = true }
// Envía felicitación por ambos canales al mismo tiempo.
app.post("/api/admin/birthdays/:userId/greet", adminMiddleware, async (req, res) => {
  try {
    const { message, sendEmail = true, sendWhatsapp = true, ctaUrl, ctaText } = req.body || {};
    if (!message || message.trim().length < 2) {
      return res.status(400).json({ message: "El mensaje es requerido" });
    }
    const u = await pool.query(
      "SELECT id, display_name, email, phone FROM users WHERE id = $1",
      [req.params.userId]
    );
    if (!u.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const user = u.rows[0];

    const results = { email: null, whatsapp: null };

    // Email
    if (sendEmail && user.email) {
      try {
        await sendBirthdayGreeting({
          to: user.email,
          name: user.display_name || "Alumna",
          message,
          ctaUrl,
          ctaText,
        });
        results.email = { ok: true };
      } catch (err) {
        console.error("[birthday email]", err.message);
        results.email = { ok: false, error: err.message };
      }
    }

    // WhatsApp
    if (sendWhatsapp && user.phone) {
      if (!EVOLUTION_CONFIGURED) {
        results.whatsapp = { ok: false, error: "Evolution API no configurado" };
      } else {
        try {
          const firstName = (user.display_name || "").split(" ")[0] || "Hola";
          const personalized = String(message).replace(/\{name\}/gi, firstName);
          await sendWhatsAppNow(user.phone, personalized);
          results.whatsapp = { ok: true };
        } catch (err) {
          console.error("[birthday wa]", err.message);
          results.whatsapp = { ok: false, error: err.message };
        }
      }
    }

    return res.json({ data: { user_id: user.id, results } });
  } catch (err) {
    console.error("Birthday greet error:", err);
    return res.status(500).json({ message: err.message || "Error al enviar felicitación" });
  }
});

// POST /api/evolution/notify-clients — legacy alias deshabilitado
app.post("/api/evolution/notify-clients", adminMiddleware, async (req, res) => {
  return res.status(410).json({
    message: "Endpoint legacy. Usa /api/admin/broadcast/whatsapp.",
  });
});

// ─── Videos purchases approve/reject ────────────────────────────────────────

app.post("/api/videos/purchases/:id/approve", adminMiddleware, async (req, res) => {
  try {
    const { admin_notes } = req.body;
    const r = await pool.query(
      "UPDATE video_purchases SET status='active', admin_notes=$1, verified_at=NOW() WHERE id=$2 RETURNING *",
      [admin_notes || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Compra no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.post("/api/videos/purchases/:id/reject", adminMiddleware, async (req, res) => {
  try {
    const { admin_notes } = req.body;
    const r = await pool.query(
      "UPDATE video_purchases SET status='rejected', admin_notes=$1, verified_at=NOW() WHERE id=$2 RETURNING *",
      [admin_notes || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Compra no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// Admin Videos — also available at /api/videos (CRUD) for admin use

// POST /api/videos/upload  — upload video file (+ optional thumbnail) to Google Drive
app.post("/api/videos/upload", adminMiddleware, uploadVideo.fields([{ name: "video", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]), async (req, res) => {
  try {
    const videoFile = req.files?.video?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];
    if (!videoFile) return res.status(400).json({ message: "Se requiere el archivo de video" });

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
    if (!isDriveConfigured) {
      return res.status(503).json({ message: "Google Drive no configurado. Define GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN en Railway." });
    }

    const accessToken = await getGoogleDriveAccessToken();

    // Upload video using resumable upload (streams from disk in 5 MB chunks)
    const videoResult = await uploadFileToDriveResumable(
      videoFile.path,
      videoFile.originalname,
      videoFile.mimetype,
      accessToken
    );
    // Clean up temp file
    fs.unlink(videoFile.path, () => { });
    await makeGoogleDriveFilePublic(videoResult.id, accessToken);

    // Upload thumbnail (optional) — small file, use buffer multipart
    let thumbnailUrl = `https://drive.google.com/thumbnail?id=${videoResult.id}&sz=w640`;
    let thumbnailDriveId = "";
    if (thumbnailFile) {
      const thumbBuffer = fs.readFileSync(thumbnailFile.path);
      const thumbResult = await uploadBufferToDrive(
        thumbBuffer,
        thumbnailFile.originalname,
        thumbnailFile.mimetype,
        accessToken
      );
      fs.unlink(thumbnailFile.path, () => { });
      await makeGoogleDriveFilePublic(thumbResult.id, accessToken);
      thumbnailUrl = `https://drive.google.com/thumbnail?id=${thumbResult.id}&sz=w640`;
      thumbnailDriveId = thumbResult.id;
    }

    return res.json({
      drive_file_id: videoResult.id,
      cloudinary_id: videoResult.id,           // same value for compat
      thumbnail_url: thumbnailUrl,
      thumbnail_drive_id: thumbnailDriveId,
      secure_url: `https://drive.google.com/file/d/${videoResult.id}/view`,
      embed_url: `https://drive.google.com/file/d/${videoResult.id}/preview`,
      duration_seconds: 0,
    });
  } catch (err) {
    // Clean up temp files on error
    if (req.files?.video?.[0]?.path) fs.unlink(req.files.video[0].path, () => { });
    if (req.files?.thumbnail?.[0]?.path) fs.unlink(req.files.thumbnail[0].path, () => { });
    console.error("Video upload error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al subir video: " + (err?.response?.data?.error?.message || err.message) });
  }
});

app.post("/api/videos", adminMiddleware, async (req, res) => {
  try {
    const {
      title, description, subtitle, tagline, days, brand_color,
      drive_file_id, cloudinary_id, thumbnail_url, thumbnail_drive_id,
      class_type_id, instructor_id, duration_seconds,
      access_type = "free", is_published = false, is_featured = false, sort_order = 0,
      sales_enabled = false, sales_unlocks_video = false, sales_price_mxn, sales_class_credits, sales_cta_text,
      category_id,
    } = req.body;
    if (!title) return res.status(400).json({ message: "title es requerido" });
    const r = await pool.query(
      `INSERT INTO videos (
         title, description, subtitle, tagline, days, brand_color,
         drive_file_id, cloudinary_id, thumbnail_url, thumbnail_drive_id,
         class_type_id, instructor_id, duration_seconds,
         access_type, is_published, is_featured, sort_order,
         sales_enabled, sales_unlocks_video, sales_price_mxn, sales_class_credits, sales_cta_text
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        title, description || null, subtitle || null, tagline || null, days || null, brand_color || null,
        drive_file_id || null, cloudinary_id || drive_file_id || null, thumbnail_url || null, thumbnail_drive_id || null,
        class_type_id || category_id || null, instructor_id || null, duration_seconds || 0,
        access_type, is_published, is_featured, sort_order,
        sales_enabled, sales_unlocks_video, sales_price_mxn || null, sales_class_credits || null, sales_cta_text || null,
      ]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST /videos error:", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

app.put("/api/videos/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      title, description, subtitle, tagline, days, brand_color,
      drive_file_id, cloudinary_id, thumbnail_url, thumbnail_drive_id,
      class_type_id, instructor_id, duration_seconds,
      access_type, is_published, is_featured, sort_order,
      sales_enabled, sales_unlocks_video, sales_price_mxn, sales_class_credits, sales_cta_text,
      category_id,
    } = req.body;
    const r = await pool.query(
      `UPDATE videos SET
         title=$1, description=$2, subtitle=$3, tagline=$4, days=$5, brand_color=$6,
         drive_file_id=COALESCE($7, drive_file_id),
         cloudinary_id=COALESCE($8, cloudinary_id),
         thumbnail_url=COALESCE($9, thumbnail_url),
         thumbnail_drive_id=COALESCE($10, thumbnail_drive_id),
         class_type_id=$11, instructor_id=$12,
         duration_seconds=COALESCE($13, duration_seconds),
         access_type=COALESCE($14, access_type),
         is_published=COALESCE($15, is_published),
         is_featured=COALESCE($16, is_featured),
         sort_order=COALESCE($17, sort_order),
         sales_enabled=COALESCE($18, sales_enabled),
         sales_unlocks_video=COALESCE($19, sales_unlocks_video),
         sales_price_mxn=$20, sales_class_credits=$21, sales_cta_text=$22,
         updated_at=NOW()
       WHERE id=$23 RETURNING *`,
      [
        title, description || null, subtitle || null, tagline || null, days || null, brand_color || null,
        drive_file_id || null, cloudinary_id || drive_file_id || null,
        thumbnail_url || null, thumbnail_drive_id || null,
        class_type_id || category_id || null, instructor_id || null,
        duration_seconds ?? null,
        access_type || null, is_published ?? null, is_featured ?? null, sort_order ?? null,
        sales_enabled ?? null, sales_unlocks_video ?? null,
        sales_price_mxn ?? null, sales_class_credits ?? null, sales_cta_text ?? null,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Video no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT /videos/:id error:", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

app.delete("/api/videos/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM videos WHERE id=$1", [req.params.id]);
    return res.json({ message: "Video eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Homepage Video Cards ────────────────────────────────────────────────────
// GET /api/homepage-video-cards  (public)
app.get("/api/homepage-video-cards", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM homepage_video_cards ORDER BY sort_order ASC");
    // Normalize any old Google Drive preview URLs to proxy URLs
    const rows = r.rows.map(card => {
      if (card.video_url) {
        const m = card.video_url.match(/drive\.google\.com\/file\/d\/([^/]+)\/preview/);
        if (m) card.video_url = `/api/drive/video/${m[1]}`;
      }
      return card;
    });
    return res.json({ data: rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/homepage-video-cards/:id  (admin — text fields)
app.put("/api/homepage-video-cards/:id", adminMiddleware, async (req, res) => {
  try {
    const { title, description, emoji, thumbnail_url } = req.body;
    if (!title || !description) return res.status(400).json({ message: "title y description requeridos" });
    const r = await pool.query(
      `UPDATE homepage_video_cards
       SET title=$1, description=$2, emoji=$3, thumbnail_url=COALESCE($4, thumbnail_url), updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [title.trim(), description.trim(), (emoji || "🎬").trim(), thumbnail_url || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/homepage-video-cards/:id/thumbnail — upload a thumbnail image (admin)
app.post("/api/homepage-video-cards/:id/thumbnail", adminMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const cardId = req.params.id;

    // Upload image to Google Drive (reuse existing OAuth setup)
    const isDriveConfigured = Boolean(
      process.env.GOOGLE_DRIVE_FOLDER_ID &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    let thumbnailUrl;
    if (isDriveConfigured) {
      // Get access token
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
      });
      const { access_token } = await tokenResp.json();

      // Upload to Drive
      const boundary = "thumbnail_boundary_" + Date.now();
      const metadata = JSON.stringify({
        name: `thumbnail_card_${cardId}_${Date.now()}.${req.file.originalname.split(".").pop()}`,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${req.file.mimetype}\r\n\r\n`),
        req.file.buffer,
        Buffer.from(`\r\n--${boundary}--`),
      ]);

      const uploadResp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      const uploadJson = await uploadResp.json();
      if (!uploadJson.id) throw new Error("Error al subir imagen a Drive");

      // Make public
      await fetch(`https://www.googleapis.com/drive/v3/files/${uploadJson.id}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });

      // Use proxy URL for consistency
      thumbnailUrl = `/api/drive/image/${uploadJson.id}`;
    } else {
      // Fallback: store as base64 data URI (small images only)
      thumbnailUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    const r = await pool.query(
      `UPDATE homepage_video_cards SET thumbnail_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [thumbnailUrl, cardId]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("Thumbnail upload error:", err);
    return res.status(500).json({ message: err.message || "Error al subir miniatura" });
  }
});

// DELETE /api/homepage-video-cards/:id/thumbnail — remove thumbnail (admin)
app.delete("/api/homepage-video-cards/:id/thumbnail", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE homepage_video_cards SET thumbnail_url=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Direct-to-Drive Upload (server proxies upload to avoid CORS) ───────────

// POST /api/drive/init-upload — creates a Google Drive resumable session, returns sessionId
app.post("/api/drive/init-upload", adminMiddleware, async (req, res) => {
  try {
    const { fileName, mimeType, fileSize } = req.body;
    if (!fileName || !mimeType) {
      return res.status(400).json({ message: "fileName y mimeType son requeridos" });
    }

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
    if (!isDriveConfigured) {
      return res.status(503).json({ message: "Google Drive no configurado" });
    }

    const accessToken = await getGoogleDriveAccessToken();
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
    const metadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };

    // Initiate a resumable upload session on Google Drive
    const initResp = await axios.post(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
      metadata,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          ...(fileSize ? { "X-Upload-Content-Length": String(fileSize) } : {}),
        },
      }
    );

    const uploadUrl = initResp.headers.location;
    if (!uploadUrl) {
      return res.status(500).json({ message: "No se obtuvo URL de subida de Google Drive" });
    }

    // Store session in memory (short-lived) for the chunk upload endpoint
    const sessionId = crypto.randomBytes(16).toString("hex");
    driveUploadSessions.set(sessionId, { uploadUrl, accessToken, mimeType, fileSize: Number(fileSize) || 0, createdAt: Date.now() });
    // Clean up old sessions after 2 hours
    setTimeout(() => driveUploadSessions.delete(sessionId), 2 * 60 * 60 * 1000);

    return res.json({ data: { sessionId } });
  } catch (err) {
    console.error("Drive init-upload error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al iniciar subida: " + (err?.response?.data?.error?.message || err.message) });
  }
});

// In-memory map to store active Drive upload sessions
const driveUploadSessions = new Map();

// PUT /api/drive/upload-chunk/:sessionId — proxy a chunk from browser to Google Drive
// The browser sends chunks of ~5MB via this endpoint; the server forwards them to Drive.
// This avoids CORS issues (browser → our server → googleapis.com)
app.put("/api/drive/upload-chunk/:sessionId", adminMiddleware, async (req, res) => {
  const session = driveUploadSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ message: "Sesión de upload no encontrada o expirada" });

  const contentRange = req.headers["content-range"] || "";
  const contentLength = req.headers["content-length"] || "";
  const contentType = req.headers["content-type"] || session.mimeType;

  try {
    // Collect the chunk from the browser request
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Forward to Google Drive
    const driveResp = await axios.put(session.uploadUrl, body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        ...(contentRange ? { "Content-Range": contentRange } : {}),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (s) => s === 200 || s === 201 || s === 308,
    });

    if (driveResp.status === 200 || driveResp.status === 201) {
      // Upload complete — return the file data
      driveUploadSessions.delete(req.params.sessionId);
      return res.json({ done: true, data: driveResp.data });
    }

    // 308 Resume Incomplete — return range info so browser knows where to continue
    const range = driveResp.headers.range || "";
    return res.json({ done: false, range });
  } catch (err) {
    console.error("Drive upload-chunk error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al subir chunk: " + (err?.response?.data?.error?.message || err.message) });
  }
});

// POST /api/drive/make-public/:fileId — make a Drive file publicly readable
app.post("/api/drive/make-public/:fileId", adminMiddleware, async (req, res) => {
  try {
    const accessToken = await getGoogleDriveAccessToken();
    await makeGoogleDriveFilePublic(req.params.fileId, accessToken);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Drive make-public error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al hacer público el archivo" });
  }
});

// GET /api/drive/video/:fileId — stream a public Google Drive video (proxy)
app.get("/api/drive/video/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.length < 10) return res.status(400).end();

    const accessToken = await getGoogleDriveAccessToken();

    // First, get file metadata to know the mimeType & size
    const metaResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,size,name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { mimeType, size, name } = metaResp.data;
    const totalSize = parseInt(size, 10);

    // Support Range requests for seeking
    const rangeHeader = req.headers.range;
    let start = 0;
    let end = totalSize - 1;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      if (start >= totalSize || end >= totalSize) {
        res.writeHead(416, { "Content-Range": `bytes */${totalSize}` });
        return res.end();
      }
    }

    const chunkSize = end - start + 1;
    const driveHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Range: `bytes=${start}-${end}`,
    };

    const driveResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: driveHeaders, responseType: "stream" }
    );

    const statusCode = rangeHeader ? 206 : 200;
    res.writeHead(statusCode, {
      "Content-Type": mimeType || "video/mp4",
      "Content-Length": chunkSize,
      "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
      "Content-Disposition": `inline; filename="${name || "video.mp4"}"`,
    });

    driveResp.data.pipe(res);
  } catch (err) {
    console.error("Drive video proxy error:", err?.response?.data || err.message);
    if (!res.headersSent) res.status(500).json({ message: "Error al obtener video" });
  }
});

// GET /api/drive/image/:fileId — proxy a public Google Drive image
app.get("/api/drive/image/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.length < 10) return res.status(400).end();
    const accessToken = await getGoogleDriveAccessToken();
    const metaResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { mimeType, name } = metaResp.data;
    const driveResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` }, responseType: "stream" }
    );
    res.set({
      "Content-Type": mimeType || "image/jpeg",
      "Cache-Control": "public, max-age=604800",
      "Content-Disposition": `inline; filename="${name || "image.jpg"}"`,
    });
    driveResp.data.pipe(res);
  } catch (err) {
    console.error("Drive image proxy error:", err?.response?.data || err.message);
    if (!res.headersSent) res.status(500).json({ message: "Error al obtener imagen" });
  }
});

// POST /api/homepage-video-cards/:id/set-drive-video — save Drive file ID to card
app.post("/api/homepage-video-cards/:id/set-drive-video", adminMiddleware, async (req, res) => {
  try {
    const { driveFileId } = req.body;
    if (!driveFileId) return res.status(400).json({ message: "driveFileId requerido" });

    // Store the proxy URL instead of the Google Drive preview URL
    const videoUrl = `/api/drive/video/${driveFileId}`;
    const r = await pool.query(
      `UPDATE homepage_video_cards SET video_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [videoUrl, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/homepage-video-cards/migrate-urls — convert old Google Drive preview URLs to proxy URLs
app.post("/api/homepage-video-cards/migrate-urls", adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE homepage_video_cards
       SET video_url = '/api/drive/video/' || regexp_replace(video_url, '^https://drive\\.google\\.com/file/d/([^/]+)/preview$', '\\1'),
           updated_at = NOW()
       WHERE video_url LIKE 'https://drive.google.com/file/d/%/preview'
       RETURNING id, video_url`
    );
    return res.json({ migrated: result.rowCount, rows: result.rows });
  } catch (err) {
    console.error("Migration error:", err.message);
    return res.status(500).json({ message: "Error al migrar URLs" });
  }
});

// POST /api/homepage-video-cards/:id/upload  (admin — upload video file, max 500 MB)
app.post("/api/homepage-video-cards/:id/upload", adminMiddleware, (req, res, next) => {
  uploadVideo.single("video")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: `El archivo es demasiado grande. Máximo ${VIDEO_MAX_MB} MB.` });
      }
      return res.status(400).json({ message: err.message || "Error al procesar archivo" });
    }
    next();
  });
}, async (req, res) => {
  try {
    const videoFile = req.file;
    if (!videoFile) return res.status(400).json({ message: "Se requiere un archivo de video" });

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    let videoUrl;

    if (isDriveConfigured) {
      // Upload to Google Drive using resumable upload (streams in 5 MB chunks)
      const accessToken = await getGoogleDriveAccessToken();
      const result = await uploadFileToDriveResumable(
        videoFile.path,
        `homepage_card_${req.params.id}_${Date.now()}_${videoFile.originalname}`,
        videoFile.mimetype,
        accessToken
      );
      // Clean up temp file
      fs.unlink(videoFile.path, () => { });
      await makeGoogleDriveFilePublic(result.id, accessToken);
      videoUrl = `/api/drive/video/${result.id}`;
    } else {
      if (videoFile.path) fs.unlink(videoFile.path, () => { });
      return res.status(503).json({
        message: "Google Drive no está configurado. Configura GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REFRESH_TOKEN para subir videos.",
      });
    }

    // Save video_url to DB
    const r = await pool.query(
      `UPDATE homepage_video_cards SET video_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [videoUrl, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    // Clean up temp file on error
    if (req.file?.path) fs.unlink(req.file.path, () => { });
    console.error("Homepage card video upload error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al subir video: " + (err?.response?.data?.error?.message || err.message) });
  }
});

// DELETE /api/homepage-video-cards/:id/video  (admin — remove video)
app.delete("/api/homepage-video-cards/:id/video", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE homepage_video_cards SET video_url=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/admin/health/memory — radiografía rápida de uso de RAM/proceso.
// Útil para descartar fugas cuando el dashboard del proveedor muestra cifras
// que no cuadran con el tráfico real. Solo admin.
app.get("/api/admin/health/memory", adminMiddleware, async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const toMB = (n) => Math.round(n / 1024 / 1024 * 10) / 10;
    let poolStats = null;
    try {
      poolStats = {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      };
    } catch (_) {}
    return res.json({
      data: {
        uptimeSec: Math.round(process.uptime()),
        node: process.version,
        memoryMB: {
          rss: toMB(mem.rss),
          heapTotal: toMB(mem.heapTotal),
          heapUsed: toMB(mem.heapUsed),
          external: toMB(mem.external),
          arrayBuffers: toMB(mem.arrayBuffers),
        },
        pgPool: poolStats,
        inMemoryQueues: {
          rateLimitBuckets: rateLimitBuckets.size,
          roleCache: roleCache.size,
          settingsCache: settingsCache.size,
          walletSyncQueue: walletSyncQueue.size,
          driveUploadSessions: driveUploadSessions.size,
        },
        pid: process.pid,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Error interno" });
  }
});

// GET /api/admin/stats
app.get("/api/admin/stats", adminMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const [classesToday, activeMembers, monthlyRevenue, pendingAlerts] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM classes WHERE date = $1", [today]),
      pool.query("SELECT COUNT(*) FROM memberships WHERE status = 'active'"),
      // Ingresos del mes = órdenes aprobadas (pagos por la app) + membresías
      // dadas de alta manualmente por admin (sin order_id). Antes solo contaba
      // las órdenes y ocultaba toda la operación manual del estudio.
      pool.query(
        `SELECT
           (SELECT COALESCE(SUM(total_amount),0) FROM orders
              WHERE status='approved' AND created_at >= $1)
         + (SELECT COALESCE(SUM(COALESCE(NULLIF(p.discount_price,0), p.price)),0)
              FROM memberships m JOIN plans p ON p.id=m.plan_id
             WHERE m.order_id IS NULL AND m.created_at >= $1) AS total`,
        [monthStart]
      ),
      // Mismo criterio de "pendiente" que la pestaña Pendientes de Pagos:
      // por verificar + esperando pago en efectivo (la alumna paga en estudio).
      pool.query(`SELECT COUNT(*) FROM orders
                   WHERE status = 'pending_verification'
                      OR (status = 'pending_payment' AND payment_method = 'cash')`),
    ]);

    return res.json({
      classesToday: parseInt(classesToday.rows[0].count),
      activeMembers: parseInt(activeMembers.rows[0].count),
      monthlyRevenue: parseFloat(monthlyRevenue.rows[0].total),
      pendingAlerts: parseInt(pendingAlerts.rows[0].count),
    });
  } catch (err) {
    console.error("admin/stats error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/users?role=&search=
app.get("/api/users", adminMiddleware, async (req, res) => {
  try {
    const { role, search = "" } = req.query;
    let q = `SELECT id, display_name, email, phone, role, created_at FROM users WHERE 1=1`;
    const params = [];
    if (role) { params.push(role); q += ` AND role = $${params.length}`; }
    const searchValue = String(search ?? "").trim();
    if (searchValue) {
      params.push(`%${searchValue}%`);
      const textIdx = params.length;
      const digitSearch = searchValue.replace(/\D/g, "");
      let phoneClause = "";
      if (digitSearch) {
        params.push(`%${digitSearch}%`);
        phoneClause = ` OR regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $${params.length}`;
      }
      q += ` AND (display_name ILIKE $${textIdx} OR email ILIKE $${textIdx}${phoneClause})`;
    }
    q += " ORDER BY display_name ASC LIMIT 200";
    const r = await pool.query(q, params);
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("GET /api/users error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/users — admin creates a client
app.post("/api/users", adminMiddleware, async (req, res) => {
  try {
    const { email: rawEmail, displayName, phone, role = "client", dateOfBirth, emergencyContactName, emergencyContactPhone, healthNotes } = req.body;
    if (!rawEmail || !displayName) return res.status(400).json({ message: "Email y nombre requeridos" });
    // Normalizar igual que /auth/login y /auth/register, si no la alumna no
    // podría iniciar sesión (login busca con email en minúsculas).
    const email = String(rawEmail).toLowerCase().trim();
    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.rows.length) return res.status(409).json({ message: "Email ya registrado" });
    const tempPassword = Math.random().toString(36).slice(2, 10);
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.default.hash(tempPassword, 10);
    const r = await pool.query(
      `INSERT INTO users (display_name, email, phone, role, password_hash, date_of_birth, emergency_contact_name, emergency_contact_phone, health_notes, accepts_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING *`,
      [displayName.trim(), email, phone || null, role, hash, dateOfBirth || null, emergencyContactName || null, emergencyContactPhone || null, healthNotes || null]
    );
    return res.status(201).json({ user: mapUser(r.rows[0]), tempPassword });
  } catch (err) {
    console.error("POST /api/users error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/users/:id/credit-history — historial de movimientos de crédito
// de una alumna, juntando TODAS sus membresías. Sirve para que la dueña valide,
// por ejemplo, que una invitada efectivamente descontó 2 créditos. Cada fila
// trae el saldo antes/después, el motivo, y la invitada/clase si aplica.
app.get("/api/admin/users/:id/credit-history", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT l.id, l.membership_id, l.old_value, l.new_value, l.delta,
              l.reason, l.notes, l.created_at, l.booking_id,
              u.display_name AS actor_name,
              p.name AS plan_name,
              b.guest_name,
              cl.date AS class_date, cl.start_time AS class_time
         FROM membership_credit_log l
         JOIN memberships m ON m.id = l.membership_id
         LEFT JOIN users u  ON u.id = l.actor_user_id
         LEFT JOIN plans p  ON p.id = m.plan_id
         LEFT JOIN bookings b ON b.id = l.booking_id
         LEFT JOIN classes cl ON cl.id = b.class_id
        WHERE m.user_id = $1
        ORDER BY l.created_at DESC
        LIMIT 500`,
      [req.params.id]
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("[GET /admin/users/:id/credit-history]", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/users/:id/reset-password — el admin restablece la contraseña
// de una alumna y obtiene una contraseña temporal para entregársela. Útil
// cuando la alumna no recuerda su contraseña o no puede entrar. Invalida los
// tokens de reset pendientes. Devuelve { tempPassword } (solo al admin).
app.post("/api/admin/users/:id/reset-password", adminMiddleware, async (req, res) => {
  try {
    const u = await pool.query("SELECT id, display_name, email FROM users WHERE id = $1", [req.params.id]);
    if (!u.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    // Permitir una contraseña custom opcional; si no, generar una temporal legible.
    const custom = typeof req.body?.password === "string" ? req.body.password.trim() : "";
    const tempPassword = custom && custom.length >= 8
      ? custom
      : `Pilates${Math.floor(1000 + Math.random() * 9000)}`; // ej. Pilates4821
    const hash = await bcrypt.hash(tempPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, req.params.id]);
    // Invalidar tokens de recuperación pendientes (la contraseña ya cambió).
    await pool.query("UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false", [req.params.id]).catch(() => {});
    return res.json({
      data: {
        tempPassword,
        email: u.rows[0].email,
        name: u.rows[0].display_name,
      },
      message: "Contraseña restablecida",
    });
  } catch (err) {
    console.error("POST /admin/users/:id/reset-password error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/users/:id
app.delete("/api/users/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    return res.json({ message: "Usuario eliminado" });
  } catch (err) {
    console.error("DELETE /api/users/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Memberships admin CRUD ──────────────────────────────────────────────────

// GET /api/memberships — admin list all
app.get("/api/memberships", adminMiddleware, async (req, res) => {
  try {
    const { status, userId, limit = 100 } = req.query;
    let q = `SELECT m.*, u.display_name AS user_name, p.name AS plan_name,
                    p.class_limit, p.duration_days, p.class_category
             FROM memberships m
             LEFT JOIN users u ON m.user_id = u.id
             LEFT JOIN plans p ON m.plan_id = p.id
             WHERE 1=1`;
    const params = [];
    if (userId) { params.push(userId); q += ` AND m.user_id = $${params.length}`; }
    if (status) { params.push(status); q += ` AND m.status = $${params.length}`; }
    params.push(parseInt(limit)); q += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({
      data: r.rows.map(m => ({
        id: m.id,
        userId: m.user_id,
        userName: m.user_name ?? m.user_id,
        planId: m.plan_id,
        planName: m.plan_name ?? m.plan_id,
        classCategory: m.class_category ?? "all",
        status: m.status,
        paymentMethod: m.payment_method,
        startDate: m.start_date,
        endDate: m.end_date,
        // 9999 = unlimited → null para que el admin UI muestre "∞"
        classesRemaining: m.classes_remaining != null && Number(m.classes_remaining) >= 9999
          ? null
          : m.classes_remaining,
        classLimit: m.class_limit != null && Number(m.class_limit) >= 9999
          ? null
          : m.class_limit,
        createdAt: m.created_at,
      }))
    });
  } catch (err) {
    console.error("GET /memberships error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/memberships — admin assigns membership to a user
app.post("/api/memberships", adminMiddleware, async (req, res) => {
  try {
    const { userId, planId, paymentMethod: rawPM = "cash", startDate, complementType } = req.body;
    const paymentMethod = normalizePaymentMethod(rawPM);
    if (!userId || !planId) return res.status(400).json({ message: "userId y planId requeridos" });
    const planRes = await pool.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
    if (!planRes.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    const plan = planRes.rows[0];
    // El admin está activando manualmente: una orden ABANDONADA (pending_payment,
    // un carrito que la alumna empezó y nunca pagó) NO debe bloquear la
    // activación de un plan no repetible (ej. Clase de prueba). La cancelamos
    // para que no cuente como conflicto. Las pagadas/en verificación/aprobadas
    // SÍ siguen bloqueando (evita doble alta).
    await pool.query(
      `UPDATE orders SET status='cancelled', updated_at=NOW(),
              admin_notes = COALESCE(admin_notes,'') || ' [auto-cancelada: activación manual de membresía]'
        WHERE user_id = $1 AND status = 'pending_payment'
          AND (
            plan_id = $2
            OR (COALESCE($3,'') <> '' AND plan_id IN (SELECT id FROM plans WHERE repeat_key = $3))
          )`,
      [userId, planId, plan.repeat_key || ""]
    ).catch((e) => console.error("[memberships] cancelar pending_payment:", e.message));
    const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId, plan });
    if (nonRepeatableConflict) {
      return res.status(409).json({ message: nonRepeatableConflict.message });
    }
    const startStr = startDate ? String(startDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const endStr = calcMembershipEndDate(startStr, plan);
    const compInfo = complementType ? COMPLEMENT_MAP[complementType] : null;
    const complementNote = compInfo ? `Complemento: ${compInfo.name} — ${compInfo.specialist}` : null;
    const r = await pool.query(
      `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, notes)
       VALUES ($1,$2,'active',$3,$4,$5,$6,$7) RETURNING *`,
      [userId, planId, paymentMethod, startStr, endStr, plan.class_limit ?? null, complementNote]
    );

    // ── Create consultation if complement was selected ────────────────
    if (compInfo && r.rows[0]) {
      try {
        await pool.query(
          `INSERT INTO consultations (membership_id, user_id, complement_type, complement_name, specialist, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [r.rows[0].id, userId, complementType, compInfo.name, compInfo.specialist]
        );
      } catch (consultErr) {
        console.error("[consultations] insert error:", consultErr.message);
      }
    }

    // ── Email: membership activated ──────────────────────────────────────
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [userId]);
      if (uRes.rows[0]) {
        const u = uRes.rows[0];
        const startDisplay = startStr ? new Date(startStr).toLocaleDateString("es-MX") : "";
        const endDisplay = endStr ? new Date(endStr).toLocaleDateString("es-MX") : "";
        if (await areEmailNotificationsEnabled()) {
          sendMembershipActivated({
            to: u.email,
            name: u.display_name || "Alumna",
            planName: plan.name,
            startDate: startStr,
            endDate: endStr,
            classLimit: plan.class_limit ?? null,
          }).catch((e) => console.error("[Email] membership activated:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "membership_activated",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            plan: plan.name || "tu plan",
            startDate: startDisplay,
            endDate: endDisplay,
          },
          fallbackMessage: `Hola ${u.display_name || "Alumna"}, tu membresía ${plan.name || ""} ya está activa. Vigencia: ${startDisplay} al ${endDisplay}.`,
        }).catch((e) => console.error("[WA] membership activated:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] membership create query:", emailErr.message);
    }

    // ── Award loyalty points for membership purchase ────────────────────
    if (userId && parseFloat(plan.price) > 0) {
      try {
        const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
        const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
        const pts = Math.floor(parseFloat(plan.price) * (cfg.points_per_peso ?? 1));
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
            [userId, pts, `Membresía asignada — ${plan.name} ($${plan.price})`]
          );
        }
      } catch (e) { /* loyalty error shouldn't fail membership creation */ }
    }

    triggerWalletPassSync(userId, "membership_created");
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST /memberships error:", err);
    return res.status(500).json({ message: err.message || "Error interno" });
  }
});

// POST /api/admin/memberships/courtesy — otorgar clases de cortesía (gratis) a
// una alumna seleccionada. Crea una membresía activa con N créditos, sin pago y
// sin orden (no afecta ingresos). body: { userId, classes=1, days=30, note? }
app.post("/api/admin/memberships/courtesy", adminMiddleware, async (req, res) => {
  try {
    const userId = req.body?.userId;
    const classes = Math.max(1, Math.min(50, parseInt(req.body?.classes ?? 1, 10) || 1));
    const days = Math.max(1, Math.min(365, parseInt(req.body?.days ?? 30, 10) || 30));
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
    if (!userId) return res.status(400).json({ message: "userId requerido" });

    const u = await pool.query("SELECT id, email, display_name, phone FROM users WHERE id = $1", [userId]);
    if (!u.rows.length) return res.status(404).json({ message: "Alumna no encontrada" });

    // Plan oculto "Clases de cortesía" para satisfacer la FK (plan_id NOT NULL).
    // Inactivo: no aparece en checkout. El nº de clases va por membresía
    // (class_limit_override / classes_remaining), no por el plan.
    let planId;
    const found = await pool.query("SELECT id FROM plans WHERE name = 'Clases de cortesía' LIMIT 1");
    if (found.rows.length) {
      planId = found.rows[0].id;
    } else {
      const ins = await pool.query(
        `INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
         VALUES ('Clases de cortesía', 'Clases de cortesía otorgadas por el estudio', 0, 'MXN', 30, NULL, 'all', false, 999)
         RETURNING id`
      );
      planId = ins.rows[0].id;
    }

    const startStr = new Date().toISOString().slice(0, 10);
    const end = new Date(startStr + "T00:00:00");
    end.setDate(end.getDate() + days);
    const endStr = end.toISOString().slice(0, 10);
    const notes = note ? `Cortesía otorgada por admin — ${note}` : "Cortesía otorgada por admin";

    const m = await pool.query(
      `INSERT INTO memberships
         (user_id, plan_id, status, payment_method, start_date, end_date,
          classes_remaining, class_limit_override, plan_name_override, notes)
       VALUES ($1, $2, 'active', 'cash', $3, $4, $5, $5, 'Clases de cortesía', $6)
       RETURNING *`,
      [userId, planId, startStr, endStr, classes, notes]
    );

    // Rastro en el log de créditos (de 0 a N).
    try {
      await logCreditChange({
        membershipId: m.rows[0].id,
        oldValue: 0,
        newValue: classes,
        reason: "admin_courtesy_granted",
        actorUserId: req.userId,
        bookingId: null,
      });
    } catch (e) { console.error("[cortesia] credit log:", e.message); }

    // Avisar a la alumna (email + WhatsApp), best-effort.
    try {
      const usr = u.rows[0];
      const startDisplay = new Date(startStr).toLocaleDateString("es-MX");
      const endDisplay = new Date(endStr).toLocaleDateString("es-MX");
      if (await areEmailNotificationsEnabled()) {
        sendMembershipActivated({
          to: usr.email,
          name: usr.display_name || "Alumna",
          planName: `Clases de cortesía (${classes})`,
          startDate: startStr,
          endDate: endStr,
          classLimit: classes,
        }).catch((e) => console.error("[Email] cortesia:", e.message));
      }
      sendConfiguredWhatsAppTemplate({
        templateKey: "membership_activated",
        phone: usr.phone,
        vars: {
          name: usr.display_name || "Alumna",
          plan: `Clases de cortesía (${classes})`,
          startDate: startDisplay,
          endDate: endDisplay,
        },
        fallbackMessage: `Hola ${usr.display_name || "Alumna"}, te regalamos ${classes} clase${classes === 1 ? "" : "s"} de cortesía 🎁. Vigencia: ${startDisplay} al ${endDisplay}. Resérvalas desde la app.`,
      }).catch((e) => console.error("[WA] cortesia:", e.message));
    } catch (e) { console.error("[cortesia] notify:", e.message); }

    triggerWalletPassSync(userId, "courtesy_granted");
    return res.status(201).json({ data: m.rows[0], message: `${classes} clase(s) de cortesía otorgada(s)` });
  } catch (err) {
    console.error("POST /admin/memberships/courtesy error:", err);
    return res.status(500).json({ message: err.message || "Error interno" });
  }
});

// PUT /api/memberships/:id/activate
app.put("/api/memberships/:id/activate", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE memberships SET status = 'active', updated_at = NOW() WHERE id = $1
       RETURNING *, (SELECT name FROM plans WHERE id = memberships.plan_id) AS plan_name,
                    (SELECT class_limit FROM plans WHERE id = memberships.plan_id) AS plan_class_limit`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
    const mem = r.rows[0];

    // ── Email: membership activated ──────────────────────────────────────
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [mem.user_id]);
      if (uRes.rows[0]) {
        const u = uRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendMembershipActivated({
            to: u.email,
            name: u.display_name || "Alumna",
            planName: mem.plan_name || mem.plan_name_override || "Tu membresía",
            startDate: mem.start_date,
            endDate: mem.end_date,
            classLimit: mem.plan_class_limit ?? mem.class_limit_override ?? null,
          }).catch((e) => console.error("[Email] membership activate:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "membership_activated",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            plan: mem.plan_name || mem.plan_name_override || "tu plan",
            startDate: mem.start_date ? new Date(mem.start_date).toLocaleDateString("es-MX") : "",
            endDate: mem.end_date ? new Date(mem.end_date).toLocaleDateString("es-MX") : "",
          },
          fallbackMessage: `Hola ${u.display_name || "Alumna"}, tu membresía ${mem.plan_name || mem.plan_name_override || ""} ya está activa.`,
        }).catch((e) => console.error("[WA] membership activate:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] activate query:", emailErr.message);
    }

    triggerWalletPassSync(mem.user_id, "membership_activated");
    return res.json({ data: mem });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/memberships/:id/cancel
app.put("/api/memberships/:id/cancel", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE memberships SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
    triggerWalletPassSync(r.rows[0].user_id, "membership_cancelled");
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/memberships/:id — borrado físico (admin)
// Elimina el registro de la tabla memberships. Útil para limpiar membresías
// de prueba/error. Si la membresía tiene bookings ligadas, primero se intenta
// desligarlas (booking.membership_id = NULL) usando savepoint por si la columna
// no existe en este schema. NO devuelve créditos (es solo limpieza de registro).
app.delete("/api/memberships/:id", adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const head = await client.query("SELECT user_id FROM memberships WHERE id = $1", [req.params.id]);
    if (!head.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Membresía no encontrada" });
    }
    const userId = head.rows[0].user_id;
    // Desligar bookings que apuntan a esta membresía (si la columna existe)
    await client.query("SAVEPOINT sp_unlink");
    try {
      await client.query("UPDATE bookings SET membership_id = NULL WHERE membership_id = $1", [req.params.id]);
      await client.query("RELEASE SAVEPOINT sp_unlink");
    } catch (_e) {
      await client.query("ROLLBACK TO SAVEPOINT sp_unlink");
    }
    await client.query("DELETE FROM memberships WHERE id = $1", [req.params.id]);
    await client.query("COMMIT");
    triggerWalletPassSync(userId, "membership_deleted");
    return res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("DELETE /api/memberships/:id error:", err);
    return res.status(500).json({ message: err.message || "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/admin/memberships/owner-corrections
// Apply a hand-provided list of {nameQuery, classesRemaining} from the studio
// owner. For each entry: find the user by name (case-insensitive partial match),
// find their newest active membership, set classes_remaining, log the change.
// Body: { corrections: [{ nameQuery: "María Guadalupe", classesRemaining: 9 }, ...] }
// ?dryRun=true  →  preview only.
app.post("/api/admin/memberships/owner-corrections", adminMiddleware, async (req, res) => {
  const dryRun = String(req.query.dryRun || req.body?.dryRun || "").toLowerCase() === "true";
  const corrections = Array.isArray(req.body?.corrections) ? req.body.corrections : [];
  if (!corrections.length) {
    return res.status(400).json({ message: "corrections array requerido" });
  }
  const results = [];
  for (const entry of corrections) {
    const nameQuery = String(entry?.nameQuery || "").trim();
    const target = Number(entry?.classesRemaining);
    if (!nameQuery || !Number.isFinite(target) || target < 0) {
      results.push({ nameQuery, status: "error", message: "entrada inválida" });
      continue;
    }
    try {
      const matches = await pool.query(
        `SELECT u.id, u.display_name
           FROM users u
          WHERE unaccent(lower(u.display_name)) LIKE unaccent(lower($1))
          LIMIT 5`,
        [`%${nameQuery}%`]
      ).catch(async () => {
        // Fallback if unaccent extension missing
        return pool.query(
          `SELECT u.id, u.display_name
             FROM users u
            WHERE lower(u.display_name) LIKE lower($1)
            LIMIT 5`,
          [`%${nameQuery}%`]
        );
      });

      if (!matches.rows.length) {
        results.push({ nameQuery, status: "not_found" });
        continue;
      }
      if (matches.rows.length > 1) {
        results.push({
          nameQuery,
          status: "ambiguous",
          matches: matches.rows.map((u) => u.display_name),
        });
        continue;
      }
      const user = matches.rows[0];

      const memRes = await pool.query(
        `SELECT m.id, m.classes_remaining,
                COALESCE(p.name, m.plan_name_override, 'Membresía') AS plan_name
           FROM memberships m
           LEFT JOIN plans p ON p.id = m.plan_id
          WHERE m.user_id = $1 AND m.status = 'active'
          ORDER BY m.created_at DESC
          LIMIT 1`,
        [user.id]
      );
      if (!memRes.rows.length) {
        results.push({ nameQuery, userName: user.display_name, status: "no_active_membership" });
        continue;
      }
      const mem = memRes.rows[0];
      const before = mem.classes_remaining === null ? null : Number(mem.classes_remaining);

      if (before === target) {
        results.push({
          nameQuery,
          userName: user.display_name,
          planName: mem.plan_name,
          membershipId: mem.id,
          before,
          after: target,
          status: "already_correct",
        });
        continue;
      }

      if (!dryRun) {
        await pool.query(
          "UPDATE memberships SET classes_remaining = $1, updated_at = NOW() WHERE id = $2",
          [target, mem.id]
        );
        await logCreditChange({
          membershipId: mem.id,
          oldValue: before,
          newValue: target,
          reason: "owner_correction",
          actorUserId: req.userId,
          notes: `Corrección provista por la dueña del studio tras incidente de double-decrement. Match: "${nameQuery}" → ${user.display_name}`,
        });
      }

      results.push({
        nameQuery,
        userName: user.display_name,
        planName: mem.plan_name,
        membershipId: mem.id,
        before,
        after: target,
        diff: target - (before ?? 0),
        status: dryRun ? "would_apply" : "applied",
      });
    } catch (err) {
      results.push({ nameQuery, status: "error", message: err.message });
    }
  }
  return res.json({ data: { dryRun, results } });
});

// POST /api/admin/memberships/credit-reconcile-all
// Bulk-fix every active membership whose classes_remaining does not match what
// the bookings table says was actually consumed. Returns the list of changes.
// ?dryRun=true  →  preview only, no writes.
app.post("/api/admin/memberships/credit-reconcile-all", adminMiddleware, async (req, res) => {
  const dryRun = String(req.query.dryRun || req.body?.dryRun || "").toLowerCase() === "true";
  try {
    const memsRes = await pool.query(
      `SELECT m.id, m.user_id, m.classes_remaining,
              COALESCE(p.class_limit, m.class_limit_override) AS class_limit,
              COALESCE(u.display_name, 'Sin nombre')          AS user_name,
              COALESCE(p.name, m.plan_name_override, 'Membresía') AS plan_name
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
         LEFT JOIN users u ON u.id = m.user_id
        WHERE m.status = 'active'
          AND m.classes_remaining IS NOT NULL
          AND m.classes_remaining < 9999
          AND COALESCE(p.class_limit, m.class_limit_override) IS NOT NULL
          AND COALESCE(p.class_limit, m.class_limit_override) < 9999`
    );

    const changes = [];
    for (const mem of memsRes.rows) {
      const consumedRes = await pool.query(
        `SELECT COUNT(*)::INT AS consumed
           FROM bookings b
           JOIN classes c ON c.id = b.class_id
          WHERE b.membership_id = $1
            AND (
              b.status IN ('confirmed','checked_in','no_show')
              OR (
                b.status = 'cancelled'
                AND COALESCE(b.cancelled_by, 'user') = 'user'
                AND b.cancelled_at IS NOT NULL
                AND EXTRACT(EPOCH FROM (
                  ((c.date + c.start_time::time) AT TIME ZONE 'America/Mexico_City') - b.cancelled_at
                )) < 7200
              )
            )`,
        [mem.id]
      );
      const consumed = consumedRes.rows[0].consumed;
      const expected = Math.max(0, Number(mem.class_limit) - consumed);
      const current = Number(mem.classes_remaining);
      if (expected === current) continue;

      changes.push({
        membershipId: mem.id,
        userId: mem.user_id,
        userName: mem.user_name,
        planName: mem.plan_name,
        classLimit: Number(mem.class_limit),
        bookingsConsumed: consumed,
        before: current,
        after: expected,
        diff: expected - current,
      });

      if (!dryRun) {
        await pool.query(
          "UPDATE memberships SET classes_remaining = $1, updated_at = NOW() WHERE id = $2",
          [expected, mem.id]
        );
        await logCreditChange({
          membershipId: mem.id,
          oldValue: current,
          newValue: expected,
          reason: "bulk_reconcile_trigger_fix",
          actorUserId: req.userId,
          notes: `Corregido tras fix de double-decrement trigger. ${consumed} bookings consumed; class_limit=${mem.class_limit}`,
        });
      }
    }

    return res.json({
      data: {
        dryRun,
        totalAffected: changes.length,
        changes,
      },
    });
  } catch (err) {
    console.error("[POST /admin/memberships/credit-reconcile-all]", err);
    return res.status(500).json({ message: "Error interno", detail: err.message });
  }
});

// GET /api/memberships/:id/credit-reconcile — recalculate classes_remaining from bookings
// ?apply=true  →  write the corrected value back (and log it)
app.get("/api/memberships/:id/credit-reconcile", adminMiddleware, async (req, res) => {
  try {
    const memId = req.params.id;
    const memRes = await pool.query(
      `SELECT m.id, m.user_id, m.classes_remaining,
              COALESCE(p.class_limit, m.class_limit_override) AS class_limit
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
        WHERE m.id = $1`,
      [memId]
    );
    if (!memRes.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
    const mem = memRes.rows[0];
    if (mem.class_limit === null || mem.class_limit === undefined || Number(mem.class_limit) >= 9999) {
      return res.status(400).json({ message: "Membresía ilimitada — no aplica reconciliación" });
    }

    // Count bookings that consumed a credit against this membership
    const consumedRes = await pool.query(
      `SELECT COUNT(*)::INT AS consumed
         FROM bookings b
         JOIN classes c ON c.id = b.class_id
        WHERE b.membership_id = $1
          AND (
            b.status IN ('confirmed','checked_in','no_show')
            OR (
              b.status = 'cancelled'
              AND COALESCE(b.cancelled_by, 'user') = 'user'
              AND b.cancelled_at IS NOT NULL
              AND EXTRACT(EPOCH FROM (
                ((c.date + c.start_time::time) AT TIME ZONE 'America/Mexico_City') - b.cancelled_at
              )) < 7200
            )
          )`,
      [memId]
    );
    const consumed = consumedRes.rows[0].consumed;
    const expected = Math.max(0, Number(mem.class_limit) - consumed);
    const current = mem.classes_remaining === null ? null : Number(mem.classes_remaining);
    const diff = current === null ? null : expected - current;

    const apply = String(req.query.apply || "").toLowerCase() === "true";
    let applied = false;
    if (apply && current !== null && diff !== 0) {
      await pool.query(
        "UPDATE memberships SET classes_remaining = $1, updated_at = NOW() WHERE id = $2",
        [expected, memId]
      );
      await logCreditChange({
        membershipId: memId,
        oldValue: current,
        newValue: expected,
        reason: "reconcile_from_bookings",
        actorUserId: req.userId,
        notes: `${consumed} bookings consumed; class_limit=${mem.class_limit}`,
      });
      applied = true;
    }

    return res.json({
      data: {
        membershipId: memId,
        classLimit: Number(mem.class_limit),
        bookingsConsumed: consumed,
        currentClassesRemaining: current,
        expectedClassesRemaining: expected,
        diff,
        applied,
      },
    });
  } catch (err) {
    console.error("[GET /memberships/:id/credit-reconcile]", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/memberships/:id/credit-log — audit trail of classes_remaining changes
app.get("/api/memberships/:id/credit-log", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT l.*, u.display_name AS actor_name, u.email AS actor_email
         FROM membership_credit_log l
         LEFT JOIN users u ON u.id = l.actor_user_id
        WHERE l.membership_id = $1
        ORDER BY l.created_at DESC
        LIMIT 500`,
      [req.params.id]
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("[GET /memberships/:id/credit-log]", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/memberships/:id — update any field
app.put("/api/memberships/:id", adminMiddleware, async (req, res) => {
  try {
    const { status, classesRemaining, endDate, paymentMethod, adjustReason } = req.body;
    // Validar para que un valor inválido devuelva 400 claro y no "Error interno".
    const VALID_MEMBERSHIP_STATUS = ["pending_payment", "pending_activation", "active", "expired", "paused", "cancelled"];
    if (status != null && !VALID_MEMBERSHIP_STATUS.includes(status)) {
      return res.status(400).json({ message: `Estado de membresía inválido: ${status}` });
    }
    if (classesRemaining != null && !Number.isFinite(Number(classesRemaining))) {
      return res.status(400).json({ message: "El número de clases debe ser numérico" });
    }
    const beforeRes = await pool.query(
      "SELECT classes_remaining FROM memberships WHERE id = $1",
      [req.params.id]
    );
    if (!beforeRes.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
    const oldCredits = beforeRes.rows[0].classes_remaining;
    const r = await pool.query(
      `UPDATE memberships SET
         status = COALESCE($1, status),
         classes_remaining = COALESCE($2, classes_remaining),
         end_date = COALESCE($3, end_date),
         payment_method = COALESCE($4, payment_method),
         updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [status || null, classesRemaining ?? null, endDate || null, paymentMethod || null, req.params.id]
    );
    if (classesRemaining !== undefined && classesRemaining !== null &&
        Number(classesRemaining) !== Number(oldCredits)) {
      await logCreditChange({
        membershipId: req.params.id,
        oldValue: oldCredits === null ? null : Number(oldCredits),
        newValue: Number(classesRemaining),
        reason: "admin_manual_adjust",
        actorUserId: req.userId,
        notes: adjustReason || null,
      });
      await syncExhaustedMembershipStatus({ membershipId: req.params.id });
    }
    triggerWalletPassSync(r.rows[0].user_id, "membership_updated");
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("[PUT /memberships/:id]", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Plans admin CRUD ────────────────────────────────────────────────────────

// GET /api/plans — public
// (Already exists above as GET /api/plans)

// POST /api/plans — admin (mirror of /api/admin/plans)
// PUT /api/plans/:id
app.put("/api/plans/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      name, description, price, currency, durationDays, classLimit, classCategory,
      features, isActive, sortOrder, isNonTransferable, isNonRepeatable, repeatKey,
    } = req.body;
    const rawDiscount = req.body.discountPrice ?? req.body.discount_price;
    const discountPrice =
      rawDiscount === "" || rawDiscount === null || rawDiscount === undefined
        ? null
        : Number(rawDiscount);
    const validCats = ["pilates", "bienestar", "funcional", "mixto", "all"];
    const cat = validCats.includes(classCategory) ? classCategory : null;
    const nonTransferable = parseBooleanFlag(isNonTransferable ?? req.body.is_non_transferable);
    const nonRepeatable = parseBooleanFlag(isNonRepeatable ?? req.body.is_non_repeatable);
    const safeRepeatKey = nonRepeatable
      ? String(repeatKey ?? req.body.repeat_key ?? "").trim() || null
      : null;
    // features can be array or comma-string — always store as jsonb array
    const featuresArr = Array.isArray(features)
      ? features
      : typeof features === "string" && features.trim()
        ? features.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const r = await pool.query(
      `UPDATE plans SET name=$1, description=$2, price=$3, currency=$4, duration_days=$5,
       class_limit=$6, features=$7, is_active=$8, sort_order=$9,
       class_category=COALESCE($10, class_category),
       is_non_transferable=$11, is_non_repeatable=$12, repeat_key=$13,
       discount_price=$14, updated_at=NOW()
       WHERE id=$15 RETURNING *`,
      [
        name,
        description || null,
        price,
        currency || "MXN",
        durationDays || 30,
        classLimit ?? null,
        JSON.stringify(featuresArr),
        isActive !== false,
        sortOrder || 0,
        cat,
        nonTransferable,
        nonRepeatable,
        safeRepeatKey,
        Number.isFinite(discountPrice) ? discountPrice : null,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("[PUT /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/plans/:id
app.delete("/api/plans/:id", adminMiddleware, async (req, res) => {
  const cascade = parseBooleanFlag(
    req.query?.cascade ?? req.query?.purgeRelated ?? req.body?.cascade ?? req.body?.purgeRelated
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (cascade) {
      await client.query(
        `UPDATE memberships
            SET order_id = NULL
          WHERE order_id IN (SELECT id FROM orders WHERE plan_id = $1)`,
        [req.params.id]
      ).catch(() => { });
      await client.query("DELETE FROM discount_codes WHERE plan_id = $1", [req.params.id]).catch(() => { });
      await client.query("DELETE FROM memberships WHERE plan_id = $1", [req.params.id]).catch(() => { });
      await client.query("DELETE FROM orders WHERE plan_id = $1", [req.params.id]).catch(() => { });
    }

    const del = await client.query("DELETE FROM plans WHERE id = $1 RETURNING id", [req.params.id]);
    if (!del.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Plan no encontrado" });
    }

    await client.query("COMMIT");
    if (cascade) {
      return res.json({ message: "Plan y datos relacionados eliminados" });
    }
    return res.json({ message: "Plan eliminado" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => { });
    if (!cascade && err?.code === "23503") {
      try {
        await pool.query("UPDATE plans SET is_active = false, updated_at = NOW() WHERE id = $1", [req.params.id]);
        return res.json({ message: "Plan desactivado (tiene registros asociados)" });
      } catch (softErr) {
        console.error("[DELETE /plans soft-delete]", softErr?.message || softErr);
      }
    }
    console.error("[DELETE /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/plans
app.post("/api/plans", adminMiddleware, async (req, res) => {
  try {
    const {
      name, description, price, currency = "MXN", durationDays = 30, classLimit,
      classCategory, features, isActive = true, sortOrder = 0,
      isNonTransferable, isNonRepeatable, repeatKey,
    } = req.body;
    if (!name) return res.status(400).json({ message: "Nombre requerido" });
    const rawDiscount = req.body.discountPrice ?? req.body.discount_price;
    const discountPrice =
      rawDiscount === "" || rawDiscount === null || rawDiscount === undefined
        ? null
        : Number(rawDiscount);
    const validCats = ["pilates", "bienestar", "funcional", "mixto", "all"];
    const cat = validCats.includes(classCategory) ? classCategory : "all";
    const nonTransferable = parseBooleanFlag(isNonTransferable ?? req.body.is_non_transferable);
    const nonRepeatable = parseBooleanFlag(isNonRepeatable ?? req.body.is_non_repeatable);
    const safeRepeatKey = nonRepeatable
      ? String(repeatKey ?? req.body.repeat_key ?? "").trim() || null
      : null;
    const featuresArr = Array.isArray(features)
      ? features
      : typeof features === "string" && features.trim()
        ? features.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const r = await pool.query(
      `INSERT INTO plans
        (name, description, price, currency, duration_days, class_limit, class_category, features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key, discount_price)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        name,
        description || null,
        price || 0,
        currency,
        durationDays,
        classLimit ?? null,
        cat,
        JSON.stringify(featuresArr),
        isActive,
        sortOrder,
        nonTransferable,
        nonRepeatable,
        safeRepeatKey,
        Number.isFinite(discountPrice) ? discountPrice : null,
      ]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("[POST /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Bookings admin ──────────────────────────────────────────────────────────

// GET /api/bookings — admin sees all
app.get("/api/bookings", adminMiddleware, async (req, res) => {
  try {
    const { status, classId, userId, limit = 100 } = req.query;
    let q = `SELECT b.*, u.display_name AS user_name, (c.date || 'T' || c.start_time) AS start_time, ct.name AS class_name
             FROM bookings b
             LEFT JOIN users u ON b.user_id = u.id
             LEFT JOIN classes c ON b.class_id = c.id
             LEFT JOIN class_types ct ON c.class_type_id = ct.id
             WHERE 1=1`;
    const params = [];
    if (userId) { params.push(userId); q += ` AND b.user_id = $${params.length}`; }
    if (status) { params.push(status); q += ` AND b.status = $${params.length}`; }
    if (classId) { params.push(classId); q += ` AND b.class_id = $${params.length}`; }
    params.push(parseInt(limit)); q += ` ORDER BY b.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({ data: r.rows.map(b => ({ ...b, userName: b.user_name, className: b.class_name, startTime: b.start_time })) });
  } catch (err) {
    console.error("GET /bookings error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/bookings/:id/guest — admin agrega / edita la invitada de una
// reserva existente. Si la reserva no tenía invitada: descuenta 1 crédito (a
// menos que la membresía sea ilimitada) y ocupa +1 lugar. Si ya tenía
// invitada: solo actualiza nombre/teléfono. NO está permitido en trial.
// Acepta opcionalmente skipCredits=true para forzar sin tocar créditos.
app.put("/api/admin/bookings/:id/guest", adminMiddleware, async (req, res) => {
  const guestNameRaw = typeof req.body?.guestName === "string" ? req.body.guestName.trim() : "";
  if (!guestNameRaw) return res.status(400).json({ message: "guestName requerido" });
  const guestPhone = typeof req.body?.guestPhone === "string" && req.body.guestPhone.trim()
    ? req.body.guestPhone.trim().slice(0, 40) : null;
  const skipCredits = req.body?.skipCredits === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT b.*, c.max_capacity, c.current_bookings, c.status AS class_status, c.date
         FROM bookings b
         JOIN classes c ON b.class_id = c.id
        WHERE b.id = $1 FOR UPDATE OF b, c`,
      [req.params.id]
    );
    if (!r.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Reserva no encontrada" }); }
    const booking = r.rows[0];
    if (booking.status === "cancelled" || booking.class_status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Reserva o clase canceladas" });
    }

    let membership = null;
    if (booking.membership_id) {
      const m = await client.query("SELECT id, classes_remaining, plan_id FROM memberships WHERE id = $1 FOR UPDATE", [booking.membership_id]);
      membership = m.rows[0] ?? null;
    }
    if (membership) {
      const planRow = await client.query("SELECT * FROM plans WHERE id = $1", [membership.plan_id]);
      if (planRow.rows[0] && isTrialPlan({ ...membership, plan_name: planRow.rows[0].name, class_limit: planRow.rows[0].class_limit })) {
        await client.query("ROLLBACK");
        return res.status(403).json({ code: "GUEST_NOT_ALLOWED_IN_TRIAL", message: "La Clase Muestra no admite invitada." });
      }
    }

    const hadGuest = !!booking.guest_name;
    if (!hadGuest) {
      const used = Number(booking.current_bookings) || 0;
      if (used + 1 > Number(booking.max_capacity)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ code: "NOT_ENOUGH_SPOTS_FOR_GUEST", message: "No hay lugar libre para sumar invitada." });
      }
      if (!skipCredits && membership && !isUnlimitedClasses(membership.classes_remaining) && Number(membership.classes_remaining) < 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({ code: "NOT_ENOUGH_CREDITS_FOR_GUEST", message: "La clienta no tiene crédito suficiente para sumar invitada." });
      }
    }

    await client.query(
      "UPDATE bookings SET guest_name = $1, guest_phone = $2, updated_at = NOW() WHERE id = $3",
      [guestNameRaw.slice(0, 120), guestPhone, booking.id]
    );

    if (!hadGuest) {
      await client.query("UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = $1", [booking.class_id]);
      if (!skipCredits && membership && !isUnlimitedClasses(membership.classes_remaining)) {
        const oldVal = Number(membership.classes_remaining);
        const newVal = Math.max(0, oldVal - 1);
        await client.query("UPDATE memberships SET classes_remaining = $1, updated_at = NOW() WHERE id = $2", [newVal, membership.id]);
        await logCreditChange({
          client, membershipId: membership.id, oldValue: oldVal, newValue: newVal,
          reason: "admin_guest_added", actorUserId: req.userId, bookingId: booking.id,
        });
        await syncExhaustedMembershipStatus({ client, membershipId: membership.id });
      }
    }
    await client.query("COMMIT");
    if (booking.user_id) triggerWalletPassSync(booking.user_id, "admin_guest_added");
    return res.json({ ok: true, hadGuest, message: hadGuest ? "Invitada actualizada" : "Invitada agregada" });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("PUT /admin/bookings/:id/guest:", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// DELETE /api/admin/bookings/:id/guest — admin quita la invitada sin
// restricciones de ventana. Devuelve 1 crédito a menos que skipRefund=true.
app.delete("/api/admin/bookings/:id/guest", adminMiddleware, async (req, res) => {
  const skipRefund = req.query.skipRefund === "true" || req.body?.skipRefund === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query("SELECT * FROM bookings WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!r.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Reserva no encontrada" }); }
    const booking = r.rows[0];
    if (!booking.guest_name) { await client.query("ROLLBACK"); return res.status(400).json({ message: "La reserva no tiene invitada" }); }

    await client.query("UPDATE bookings SET guest_name = NULL, guest_phone = NULL, updated_at = NOW() WHERE id = $1", [booking.id]);
    if (booking.status === "confirmed" || booking.status === "checked_in") {
      await client.query("UPDATE classes SET current_bookings = GREATEST(current_bookings - 1, 0) WHERE id = $1", [booking.class_id]);
    }
    let refunded = false;
    if (!skipRefund && booking.membership_id) {
      const m = await client.query("SELECT id, classes_remaining FROM memberships WHERE id = $1 FOR UPDATE", [booking.membership_id]);
      const mem = m.rows[0];
      if (mem && mem.classes_remaining !== null && Number(mem.classes_remaining) < 9999) {
        const oldVal = Number(mem.classes_remaining);
        await client.query("UPDATE memberships SET classes_remaining = classes_remaining + 1, updated_at = NOW() WHERE id = $1", [mem.id]);
        await logCreditChange({
          client, membershipId: mem.id, oldValue: oldVal, newValue: oldVal + 1,
          reason: "admin_guest_removed", actorUserId: req.userId, bookingId: booking.id,
        });
        refunded = true;
      }
    }
    await client.query("COMMIT");
    if (booking.user_id) triggerWalletPassSync(booking.user_id, "admin_guest_removed");
    return res.json({ ok: true, refunded });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("DELETE /admin/bookings/:id/guest:", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/admin/bookings/assign — admin assigns a class booking to a specific member.
// Soporta { classId, userId, guestName?, guestPhone? } para reservar a la
// alumna + invitada en una sola operación (igual que el flujo de la app
// del cliente: 2 créditos, 2 lugares, prohibido en trial).
app.post("/api/admin/bookings/assign", adminMiddleware, async (req, res) => {
  const { classId, userId } = req.body;
  const guestNameRaw = typeof req.body?.guestName === "string" ? req.body.guestName.trim() : "";
  const guestPhoneRaw = typeof req.body?.guestPhone === "string" ? req.body.guestPhone.trim() : "";
  const hasGuest = guestNameRaw.length > 0;
  const guestName = hasGuest ? guestNameRaw.slice(0, 120) : null;
  const guestPhone = hasGuest && guestPhoneRaw ? guestPhoneRaw.slice(0, 40) : null;
  const slotsNeeded = hasGuest ? 2 : 1;
  const creditsNeeded = hasGuest ? 2 : 1;
  if (!classId || !userId) return res.status(400).json({ message: "classId y userId requeridos" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const classRes = await client.query(
      `SELECT c.id, c.max_capacity, c.current_bookings, c.status, c.date, ct.category AS class_category
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE c.id = $1
       FOR UPDATE OF c`,
      [classId]
    );
    if (classRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = classRes.rows[0];
    if (cls.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta clase fue cancelada" });
    }

    const clsCategory = normalizeClassCategory(cls.class_category, "all");
    const clsDateStr = cls.date instanceof Date ? cls.date.toISOString().slice(0, 10) : (cls.date ? String(cls.date).slice(0, 10) : null);
    const membership = await selectMembershipForClass({
      userId,
      classCategory: clsCategory,
      classDate: clsDateStr,
      client,
    });
    if (!membership) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "La clienta no tiene membresía activa con créditos para esta clase" });
    }

    const lockedMembershipRes = await client.query(
      "SELECT id, classes_remaining FROM memberships WHERE id = $1 FOR UPDATE",
      [membership.id]
    );
    const lockedMembership = lockedMembershipRes.rows[0];
    if (!lockedMembership) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No se encontró una membresía válida para esta clase" });
    }

    if (!isMembershipCategoryCompatible(membership.class_category, clsCategory)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: `La membresía de la clienta no incluye este tipo de clase.`,
      });
    }

    // ── Clase Muestra: restrict to allowed day+time slots ──
    if (isTrialPlan(membership) && !isClassAllowedForTrial(cls.date, cls.start_time)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "La Clase Muestra solo puede reservarse: Lunes 8:20 AM / 7:20 PM, Martes 9:25 AM, Jueves 9:25 AM.",
      });
    }

    // ── Invitada en trial: no permitido ──
    if (hasGuest && isTrialPlan(membership)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        code: "GUEST_NOT_ALLOWED_IN_TRIAL",
        message: "La Clase Muestra no admite invitada.",
      });
    }

    if (!isUnlimitedClasses(lockedMembership.classes_remaining) && Number(lockedMembership.classes_remaining) < creditsNeeded) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        code: hasGuest ? "NOT_ENOUGH_CREDITS_FOR_GUEST" : "NO_CREDITS",
        message: hasGuest
          ? "La clienta no tiene 2 créditos disponibles para ella + invitada."
          : "La clienta ya no tiene clases disponibles en su membresía.",
      });
    }

    const dupRes = await client.query(
      "SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'",
      [classId, userId]
    );
    if (dupRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La clienta ya tiene una reserva para esta clase" });
    }

    // Capacidad: con invitada se requieren 2 lugares libres SIN waitlist.
    const usedAdmin = Number(cls.current_bookings) || 0;
    const capAdmin = Number(cls.max_capacity) || 0;
    if (hasGuest && usedAdmin + 2 > capAdmin) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "NOT_ENOUGH_SPOTS_FOR_GUEST",
        message: "No hay 2 lugares libres en la clase para alumna + invitada.",
      });
    }
    const isWaitlist = usedAdmin >= capAdmin;
    const bookingStatus = isWaitlist ? "waitlist" : "confirmed";
    const result = await client.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, status, guest_name, guest_phone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [classId, userId, membership.id, bookingStatus, guestName, guestPhone]
    );

    if (!isWaitlist) {
      await client.query(
        "UPDATE classes SET current_bookings = current_bookings + $1 WHERE id = $2",
        [slotsNeeded, classId]
      );
      if (!isUnlimitedClasses(lockedMembership.classes_remaining)) {
        const oldVal = Number(lockedMembership.classes_remaining);
        const newVal = Math.max(0, oldVal - creditsNeeded);
        await client.query(
          "UPDATE memberships SET classes_remaining = $1, updated_at = NOW() WHERE id = $2",
          [newVal, membership.id]
        );
        await logCreditChange({
          client,
          membershipId: membership.id,
          oldValue: oldVal,
          newValue: newVal,
          reason: hasGuest ? "admin_booking_assigned_with_guest" : "admin_booking_assigned",
          actorUserId: req.userId,
          bookingId: result.rows[0].id,
          notes: hasGuest ? `assigned to ${userId} + guest "${guestName}"` : `assigned to user ${userId}`,
        });
        await syncExhaustedMembershipStatus({ client, membershipId: membership.id });
      }
    }
    await client.query("COMMIT");

    try {
      const userRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [userId]);
      const classFullRes = await pool.query(
        `SELECT c.date, c.start_time, ct.name AS class_type_name,
                i.display_name AS instructor_name
         FROM classes c
         JOIN class_types ct ON c.class_type_id = ct.id
         LEFT JOIN instructors i ON c.instructor_id = i.id
         WHERE c.id = $1`,
        [classId]
      );
      const memAfter = await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id]);
      const classesLeft = memAfter.rows[0]?.classes_remaining ?? null;

      if (userRes.rows[0] && classFullRes.rows[0]) {
        const u = userRes.rows[0];
        const cl = classFullRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendBookingConfirmed({
            to: u.email,
            name: u.display_name || "Alumna",
            className: cl.class_type_name,
            date: cl.date,
            startTime: cl.start_time,
            instructor: cl.instructor_name,
            classesLeft,
            isWaitlist,
          }).catch((e) => console.error("[Email] booking confirmed (admin):", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "booking_confirmed",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            class: cl.class_type_name || "Clase",
            date: cl.date ? new Date(cl.date).toLocaleDateString("es-MX") : "",
            time: cl.start_time ? String(cl.start_time).slice(0, 5) : "",
          },
          fallbackMessage: isWaitlist
            ? `Hola ${u.display_name || "Alumna"}, quedaste en lista de espera para ${cl.class_type_name || "tu clase"} (${cl.date || ""} ${String(cl.start_time || "").slice(0, 5)}).`
            : `Hola ${u.display_name || "Alumna"}, tu reserva para ${cl.class_type_name || "tu clase"} (${cl.date || ""} ${String(cl.start_time || "").slice(0, 5)}) está confirmada.`,
        }).catch((e) => console.error("[WA] booking confirmed (admin):", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] booking confirmed (admin) query error:", emailErr.message);
    }

    const message = isWaitlist
      ? "Clienta agregada a lista de espera"
      : "Reserva asignada correctamente";
    triggerWalletPassSync(userId, isWaitlist ? "admin_booking_waitlist_created" : "admin_booking_created");
    return res.status(201).json({ message, data: { booking: result.rows[0], isWaitlist } });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("POST /admin/bookings/assign error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// PUT /api/bookings/:id/check-in
app.put("/api/bookings/:id/check-in", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Reserva no encontrada" });
    const booking = r.rows[0];
    // Award loyalty points for attending a class
    if (booking.user_id) {
      try {
        const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
        const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
        const pts = cfg.points_per_class ?? 10;
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, 'Clase asistida')",
            [booking.user_id, pts]
          );
        }
      } catch (e) { /* loyalty earn error shouldn't fail check-in */ }
    }
    triggerWalletPassSync(booking.user_id, "booking_checked_in");
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/bookings/:id/no-show
app.put("/api/bookings/:id/no-show", adminMiddleware, async (req, res) => {
  try {
    // Necesitamos el estado PREVIO para saber si la reserva ocupaba cupo:
    // confirmed/checked_in sí, waitlist no. Solo en el primer caso liberamos.
    const prev = await pool.query(
      "SELECT id, status, user_id, guest_name, class_id FROM bookings WHERE id = $1",
      [req.params.id]
    );
    if (!prev.rows.length || ["cancelled", "no_show"].includes(prev.rows[0].status)) {
      return res.status(404).json({ message: "Reserva no encontrada o ya procesada" });
    }
    const b = prev.rows[0];
    const wasCounted = b.status === "confirmed" || b.status === "checked_in";
    const slotsHeld = (b.user_id && b.guest_name) ? 2 : 1;

    await pool.query("UPDATE bookings SET status = 'no_show' WHERE id = $1", [b.id]);

    if (wasCounted) {
      await pool.query(
        "UPDATE classes SET current_bookings = GREATEST(current_bookings - $1, 0) WHERE id = $2",
        [slotsHeld, b.class_id]
      );
    }
    triggerWalletPassSync(b.user_id, "booking_no_show");
    return res.json({ data: { ...b, status: "no_show" } });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/bookings/:id/cancel — admin cancels a booking and restores credit
app.put("/api/admin/bookings/:id/cancel", adminMiddleware, async (req, res) => {
  try {
    const booking = await pool.query(
      "SELECT b.*, c.date, c.start_time FROM bookings b JOIN classes c ON b.class_id = c.id WHERE b.id = $1",
      [req.params.id]
    );
    if (!booking.rows.length) return res.status(404).json({ message: "Reserva no encontrada" });
    const b = booking.rows[0];
    if (b.status === "cancelled") return res.status(400).json({ message: "Ya está cancelada" });

    // Una reserva de alumna con invitada ocupa 2 lugares y consumió 2 créditos.
    // Walk-in (user_id NULL) y reserva normal = 1. Mismo criterio que el
    // cancelar del cliente (DELETE /api/bookings/:id) y la fórmula de cupo.
    const slotsHeld = (b.user_id && b.guest_name) ? 2 : 1;

    await pool.query(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'admin' WHERE id = $1",
      [req.params.id]
    );

    // Decrement class count if was confirmed/checked_in
    if (b.status === "confirmed" || b.status === "checked_in") {
      await pool.query(
        "UPDATE classes SET current_bookings = GREATEST(current_bookings - $1, 0) WHERE id = $2",
        [slotsHeld, b.class_id]
      );
    }

    // Restore credit if membership has counted limit
    if (b.membership_id && (b.status === "confirmed" || b.status === "checked_in")) {
      const beforeRes = await pool.query(
        "SELECT classes_remaining FROM memberships WHERE id = $1",
        [b.membership_id]
      );
      const oldVal = beforeRes.rows[0]?.classes_remaining;
      if (oldVal !== null && oldVal !== undefined && Number(oldVal) < 9999) {
        await pool.query(
          "UPDATE memberships SET classes_remaining = classes_remaining + $1 WHERE id = $2",
          [slotsHeld, b.membership_id]
        );
        await logCreditChange({
          membershipId: b.membership_id,
          oldValue: Number(oldVal),
          newValue: Number(oldVal) + slotsHeld,
          reason: "admin_booking_cancelled",
          actorUserId: req.userId,
          bookingId: b.id,
        });
        await syncExhaustedMembershipStatus({ membershipId: b.membership_id });
      }
    }

    triggerWalletPassSync(b.user_id, "booking_cancelled_by_admin");
    return res.json({ data: { message: "Reserva cancelada y crédito devuelto" } });
  } catch (err) {
    console.error("PUT /admin/bookings/:id/cancel error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/classes/:id/roster — lista de alumnos reservados en una clase
app.get("/api/classes/:id/roster", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.id AS booking_id, b.status, b.checked_in_at, b.checkin_method,
              b.no_show_at, b.guest_name,
              u.id AS user_id, u.display_name, u.email, u.phone,
              m.plan_id, p.name AS plan_name, m.classes_remaining
       FROM bookings b
       LEFT JOIN users u ON b.user_id = u.id
       LEFT JOIN memberships m ON b.membership_id = m.id
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE b.class_id = $1 AND b.status != 'cancelled'
       ORDER BY CASE b.status
         WHEN 'confirmed'  THEN 1
         WHEN 'checked_in' THEN 2
         WHEN 'waitlist'   THEN 3
         WHEN 'no_show'    THEN 4
         ELSE 5 END,
         COALESCE(u.display_name, b.guest_name) ASC`,
      [req.params.id]
    );
    // Also get class info
    const cls = await pool.query(
      `SELECT c.*, ct.name AS class_type_name, ct.color,
              i.display_name AS instructor_name,
              (c.date || 'T' || c.start_time) AS starts_at
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       JOIN instructors i ON c.instructor_id = i.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    return res.json({ data: { class: camelRow(cls.rows[0] ?? {}), roster: r.rows.map(camelRow) } });
  } catch (err) {
    console.error("[GET /classes/:id/roster]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/classes/:id/walkin — bloquea un lugar + registra cobro de walk-in
app.post("/api/admin/classes/:id/walkin", adminMiddleware, async (req, res) => {
  const classId = req.params.id;
  const { name, phone, planId, paymentMethod: rawPM, amount } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ message: "Se requiere el nombre del invitado" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cls = await client.query("SELECT id, current_bookings, max_capacity FROM classes WHERE id = $1 FOR UPDATE", [classId]);
    if (!cls.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Clase no encontrada" }); }
    const c = cls.rows[0];
    if (c.current_bookings >= c.max_capacity) { await client.query("ROLLBACK"); return res.status(409).json({ message: "La clase está llena" }); }

    const guestName = String(name).trim();
    const guestPhone = phone ? normalizePhoneForStorage(String(phone).trim()) : null;

    // Create order if payment info provided
    let orderId = null;
    const amt = Number(amount);
    if (amt > 0) {
      const paymentMethod = normalizePaymentMethod(rawPM || "cash");
      const orderRes = await client.query(
        `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, total_amount,
                             guest_name, guest_phone, channel, paid_at, approved_at, approved_by)
         VALUES (NULL, $1, 'approved', $2, $3, $3, $4, $5, 'walkin', NOW(), NOW(), $6)
         RETURNING id`,
        [planId || null, paymentMethod, amt, guestName, guestPhone, req.userId || null]
      );
      orderId = orderRes.rows[0].id;
    }

    const bookingRes = await client.query(
      `INSERT INTO bookings (class_id, user_id, guest_name, guest_phone, order_id, status)
       VALUES ($1, NULL, $2, $3, $4, 'confirmed') RETURNING *`,
      [classId, guestName, guestPhone, orderId]
    );
    await client.query("UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = $1", [classId]);

    await client.query("COMMIT");
    return res.json({ data: { ...bookingRes.rows[0], orderId } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[POST /admin/classes/:id/walkin]", err.message);
    return res.status(500).json({ message: "Error interno", detail: err.message });
  } finally {
    client.release();
  }
});

// GET /api/admin/walkins/by-phone?phone=xxx — busca compras previas de invitadas por teléfono
app.get("/api/admin/walkins/by-phone", adminMiddleware, async (req, res) => {
  const raw = String(req.query.phone || "").trim();
  if (!raw) return res.json({ data: [] });
  const normalized = normalizePhoneForStorage(raw);
  try {
    const r = await pool.query(
      `SELECT o.id, o.total_amount, o.payment_method, o.paid_at, o.created_at,
              o.guest_name, o.guest_phone,
              p.name AS plan_name
       FROM orders o
       LEFT JOIN plans p ON p.id = o.plan_id
       WHERE o.user_id IS NULL AND o.guest_phone = $1
       ORDER BY o.created_at DESC`,
      [normalized]
    );
    return res.json({ data: r.rows.map(camelRow) });
  } catch (err) {
    console.error("[GET /admin/walkins/by-phone]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/walkins/link — vincula órdenes y bookings de invitada a un usuario
app.post("/api/admin/walkins/link", adminMiddleware, async (req, res) => {
  const { userId, phone } = req.body;
  if (!userId || !phone) return res.status(400).json({ message: "userId y phone son requeridos" });
  const normalized = normalizePhoneForStorage(String(phone).trim());
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ordersUpd = await client.query(
      `UPDATE orders SET user_id = $1, guest_name = NULL, guest_phone = NULL
       WHERE user_id IS NULL AND guest_phone = $2 RETURNING id`,
      [userId, normalized]
    );
    const bookingsUpd = await client.query(
      `UPDATE bookings SET user_id = $1, guest_name = NULL, guest_phone = NULL
       WHERE user_id IS NULL AND guest_phone = $2 RETURNING id`,
      [userId, normalized]
    );
    await client.query("COMMIT");
    return res.json({
      data: { ordersLinked: ordersUpd.rowCount, bookingsLinked: bookingsUpd.rowCount },
      message: `Vinculado: ${ordersUpd.rowCount} pago(s) y ${bookingsUpd.rowCount} reserva(s)`,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[POST /admin/walkins/link]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// PUT /api/admin/bookings/:id/mark-no-show — revertir un check-in (auto o manual) a no_show.
// Body: { refundCredit: boolean } (default false). Si refundCredit y la membresía
// tiene crédito limitado (<9999), suma +1 a classes_remaining.
app.put("/api/admin/bookings/:id/mark-no-show", adminMiddleware, async (req, res) => {
  const refundCredit = !!req.body?.refundCredit;
  try {
    const bRes = await pool.query(
      "SELECT id, status, user_id, class_id, membership_id, guest_name FROM bookings WHERE id = $1",
      [req.params.id]
    );
    if (!bRes.rows.length) return res.status(404).json({ message: "Reserva no encontrada" });
    const booking = bRes.rows[0];
    if (booking.status === "no_show") {
      return res.json({ ok: true, refunded: false, message: "Ya estaba marcada como no asistida." });
    }
    // Alumna con invitada = 2 lugares/créditos; walk-in y normal = 1.
    const slotsHeld = (booking.user_id && booking.guest_name) ? 2 : 1;
    const wasCounted = booking.status === "confirmed" || booking.status === "checked_in";

    await pool.query(
      "UPDATE bookings SET status='no_show', no_show_at=NOW(), no_show_by=$2 WHERE id=$1",
      [booking.id, req.userId]
    );

    // no_show queda fuera de la fórmula de cupo (solo cuenta confirmed/checked_in),
    // así que liberamos los lugares que tenía para que current_bookings no se
    // desincronice hasta el próximo reconcile.
    if (wasCounted) {
      await pool.query(
        "UPDATE classes SET current_bookings = GREATEST(current_bookings - $1, 0) WHERE id = $2",
        [slotsHeld, booking.class_id]
      );
    }

    let refunded = false;
    if (refundCredit && booking.membership_id) {
      const memRes = await pool.query(
        "SELECT id, classes_remaining FROM memberships WHERE id = $1",
        [booking.membership_id]
      );
      const mem = memRes.rows[0];
      if (mem && mem.classes_remaining !== null && Number(mem.classes_remaining) < 9999) {
        const oldVal = Number(mem.classes_remaining);
        await pool.query(
          "UPDATE memberships SET classes_remaining = classes_remaining + $1 WHERE id = $2",
          [slotsHeld, mem.id]
        );
        await logCreditChange({
          membershipId: mem.id,
          oldValue: oldVal,
          newValue: oldVal + slotsHeld,
          reason: "admin_no_show_refund",
          actorUserId: req.userId,
          bookingId: booking.id,
        });
        refunded = true;
      }
    }

    return res.json({ ok: true, refunded });
  } catch (err) {
    console.error("PUT mark-no-show error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/bookings/:id/walkin — cancela un lugar bloqueado (walk-in)
app.delete("/api/admin/bookings/:id/walkin", adminMiddleware, async (req, res) => {
  try {
    const b = await pool.query("SELECT * FROM bookings WHERE id = $1 AND user_id IS NULL", [req.params.id]);
    if (!b.rows.length) return res.status(404).json({ message: "Reserva walk-in no encontrada" });
    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [req.params.id]);
    await pool.query(
      "UPDATE classes SET current_bookings = GREATEST(current_bookings - 1, 0) WHERE id = $1",
      [b.rows[0].class_id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /admin/bookings/:id/walkin]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/clients/manual — crea clienta + membresía en un solo paso (sin que use la app)
app.post("/api/admin/clients/manual", adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      displayName, email, phone, dateOfBirth,
      emergencyContactName, emergencyContactPhone, healthNotes,
      planId, paymentMethod: rawPM = "cash", startDate,
      notes, complementType,
    } = req.body;
    const paymentMethod = normalizePaymentMethod(rawPM);
    if (!displayName) return res.status(400).json({ message: "Nombre es requerido" });

    await client.query("BEGIN");

    // 1. Create user (random password — they can reset later)
    // If no email provided, generate a placeholder so the unique constraint is satisfied
    const finalEmail = email
      ? email.toLowerCase().trim()
      : `sin-correo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@pilatesroom.local`;
    const tempPassword = Math.random().toString(36).slice(2, 10) + "Op1!";
    const hash = await bcrypt.hash(tempPassword, 10);
    const userRes = await client.query(
      `INSERT INTO users (display_name, email, phone, date_of_birth, emergency_contact_name,
        emergency_contact_phone, health_notes, role, password_hash, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'client',$8,true)
       ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         phone = EXCLUDED.phone,
         updated_at = NOW()
       RETURNING id, display_name, email`,
      [displayName, finalEmail, normalizePhoneForStorage(phone), dateOfBirth || null,
        emergencyContactName || null, emergencyContactPhone || null, healthNotes || null, hash]
    );
    const user = userRes.rows[0];

    // 2. Assign membership if plan selected
    let membership = null;
    let notifyPlan = null;
    let notifyStartStr = null;
    let notifyEndStr = null;
    if (planId) {
      const planRes = await client.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
      if (!planRes.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Plan no encontrado" }); }
      const plan = planRes.rows[0];
      const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId: user.id, plan, client });
      if (nonRepeatableConflict) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: nonRepeatableConflict.message });
      }
      const startStr = startDate ? String(startDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const endStr = calcMembershipEndDate(startStr, plan);
      const memRes = await client.query(
        `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date,
          classes_remaining, notes)
         VALUES ($1,$2,'active',$3,$4,$5,$6,$7) RETURNING *`,
        [user.id, plan.id, paymentMethod, startStr, endStr,
        plan.class_limit === 0 ? null : plan.class_limit,
        (complementType ? `${notes || "Alta manual por admin"} | Complemento: ${complementType}` : notes || `Alta manual por admin`)]
      );
      membership = camelRow(memRes.rows[0]);
      notifyPlan = plan;
      notifyStartStr = startStr;
      notifyEndStr = endStr;

      // Create consultation if complement was selected
      const compInfo = complementType ? COMPLEMENT_MAP[complementType] : null;
      if (compInfo && memRes.rows[0]) {
        await client.query(
          `INSERT INTO consultations (membership_id, user_id, complement_type, complement_name, specialist, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [memRes.rows[0].id, user.id, complementType, compInfo.name, compInfo.specialist]
        ).catch((e) => console.error("[consultations] insert error:", e.message));
      }
    }

    // Auto-link previous walk-in orders/bookings by matching phone
    let walkinLinks = { ordersLinked: 0, bookingsLinked: 0 };
    const normalizedPhone = phone ? normalizePhoneForStorage(phone) : null;
    if (normalizedPhone) {
      const ordersUpd = await client.query(
        `UPDATE orders SET user_id = $1, guest_name = NULL, guest_phone = NULL
         WHERE user_id IS NULL AND guest_phone = $2 RETURNING id`,
        [user.id, normalizedPhone]
      );
      const bookingsUpd = await client.query(
        `UPDATE bookings SET user_id = $1, guest_name = NULL, guest_phone = NULL
         WHERE user_id IS NULL AND guest_phone = $2 RETURNING id`,
        [user.id, normalizedPhone]
      );
      walkinLinks = { ordersLinked: ordersUpd.rowCount, bookingsLinked: bookingsUpd.rowCount };
    }

    await client.query("COMMIT");
    if (membership?.userId || user?.id) {
      triggerWalletPassSync(membership?.userId || user.id, membership ? "admin_client_manual_with_membership" : "admin_client_manual_created");
    }

    // ── WhatsApp + email: membership activated (alta manual con plan) ─────
    if (membership && notifyPlan) {
      try {
        const startDisplay = notifyStartStr ? new Date(notifyStartStr).toLocaleDateString("es-MX") : "";
        const endDisplay = notifyEndStr ? new Date(notifyEndStr).toLocaleDateString("es-MX") : "";
        const uName = user.display_name || "Alumna";
        if (await areEmailNotificationsEnabled()) {
          sendMembershipActivated({
            to: user.email,
            name: uName,
            planName: notifyPlan.name,
            startDate: notifyStartStr,
            endDate: notifyEndStr,
            classLimit: notifyPlan.class_limit ?? null,
          }).catch((e) => console.error("[Email] manual client membership:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "membership_activated",
          phone,
          vars: {
            name: uName,
            plan: notifyPlan.name || "tu plan",
            startDate: startDisplay,
            endDate: endDisplay,
          },
          fallbackMessage: `Hola ${uName}, tu paquete ${notifyPlan.name || ""} ya está activo. Vigencia: ${startDisplay} al ${endDisplay}.`,
        }).catch((e) => console.error("[WA] manual client membership:", e.message));
      } catch (notifyErr) {
        console.error("[Notify] manual client membership:", notifyErr.message);
      }
    }

    const linkMsg = walkinLinks.ordersLinked > 0
      ? ` · Se vincularon ${walkinLinks.ordersLinked} compra(s) previa(s) como invitada`
      : "";
    return res.status(201).json({
      data: { user: camelRow(user), membership, tempPassword: planId ? undefined : tempPassword, walkinLinks },
      message: (planId ? "Clienta registrada y membresía activada" : "Clienta registrada") + linkMsg,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[POST /admin/clients/manual]", err.message, err.code);
    if (err.code === "23505") return res.status(409).json({ message: "Ya existe una clienta con ese email" });
    return res.status(500).json({ message: err.message || "Error interno" });
  } finally {
    client.release();
  }
});

// GET /api/admin/orders — all orders
// Cache del check de la tabla complements: existe o no existe durante toda la
// vida del proceso; verificarlo en cada request sumaba un round-trip a la BD.
let _hasComplementsTable = null;

app.get("/api/admin/orders", adminMiddleware, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    // Check if complements table exists to avoid JOIN errors
    if (_hasComplementsTable === null) {
      try {
        await pool.query("SELECT 1 FROM complements LIMIT 0");
        _hasComplementsTable = true;
      } catch (_) { _hasComplementsTable = false; }
    }
    const hasComplements = _hasComplementsTable;
    let q = `SELECT o.*, u.display_name AS user_name, p.name AS plan_name,
                    (SELECT json_agg(json_build_object(
                       'id', pp.id, 'file_url', pp.file_url, 'file_name', pp.file_name,
                       'mime_type', pp.mime_type, 'status', pp.status,
                       'uploaded_at', pp.uploaded_at, 'sort_order', pp.sort_order
                     ) ORDER BY pp.sort_order, pp.uploaded_at)
                      FROM payment_proofs pp WHERE pp.order_id = o.id) AS proofs,
                    (SELECT pp.file_url    FROM payment_proofs pp WHERE pp.order_id = o.id ORDER BY pp.sort_order LIMIT 1) AS proof_url,
                    (SELECT pp.status      FROM payment_proofs pp WHERE pp.order_id = o.id ORDER BY pp.sort_order LIMIT 1) AS proof_status,
                    (SELECT pp.uploaded_at FROM payment_proofs pp WHERE pp.order_id = o.id ORDER BY pp.sort_order LIMIT 1) AS proof_uploaded_at
                    ${hasComplements ? ", comp.name AS complement_name, comp.specialist AS complement_specialist" : ""}
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             LEFT JOIN plans p ON o.plan_id = p.id
             ${hasComplements ? "LEFT JOIN complements comp ON o.complement_id = comp.id" : ""}
             WHERE 1=1`;
    const params = [];
    // status acepta uno o varios separados por coma, p. ej.
    // ?status=pending_verification,pending_payment (lo usa el dashboard).
    if (status) {
      const statuses = String(status).split(",").map((s) => s.trim()).filter(Boolean);
      params.push(statuses);
      q += ` AND o.status = ANY($${params.length})`;
    }
    params.push(parseInt(limit)); q += ` ORDER BY o.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({
      data: r.rows.map(o => ({
        ...o,
        userName: o.user_name,
        userId: o.user_id,
        planName: o.plan_name,
        proofs: o.proofs || [],
        proofUrl: o.proof_url,
        proofStatus: o.proof_status,
        proofUploadedAt: o.proof_uploaded_at,
        totalAmount: o.total_amount,
        createdAt: o.created_at,
        complementId: o.complement_id,
        complementName: o.complement_name,
        complementSpecialist: o.complement_specialist,
      })),
    });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/orders/:id/verify
app.put("/api/admin/orders/:id/verify", adminMiddleware, async (req, res) => {
  // ── Atajo Grupo B: orden ya está auto-aprobada provisionalmente ──
  try {
    const pre = await pool.query(
      "SELECT id, status, auto_approval_expires_at FROM orders WHERE id = $1",
      [req.params.id]
    );
    if (pre.rows.length && pre.rows[0].status === "approved" && pre.rows[0].auto_approval_expires_at) {
      await pool.query(
        `UPDATE orders SET auto_approval_expires_at = NULL, verified_at = NOW(), verified_by = $2,
                updated_at = NOW()
          WHERE id = $1`,
        [req.params.id, req.userId]
      );
      return res.json({ ok: true, message: "Pago confirmado." });
    }
  } catch (_e) { /* sigue al flujo normal */ }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!orderRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Orden no encontrada" });
    }
    let order = orderRes.rows[0];
    let justApproved = false;

    if (order.status !== "approved") {
      let plan = null;
      if (order.plan_id) {
        const planRes = await client.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]);
        if (planRes.rows.length) {
          plan = planRes.rows[0];
          const nonRepeatableConflict = await findNonRepeatablePlanConflict({
            userId: order.user_id,
            plan,
            excludeOrderId: order.id,
            client,
          });
          if (nonRepeatableConflict) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: nonRepeatableConflict.message });
          }
        }
      }

      const approvedRes = await client.query(
        "UPDATE orders SET status = 'approved', verified_at = NOW(), verified_by = $1 WHERE id = $2 RETURNING *",
        [req.userId, req.params.id]
      );
      order = approvedRes.rows[0];
      justApproved = true;

      // Activate membership if this order is for a plan
      if (order.plan_id && plan && order.user_id) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const endStr = calcMembershipEndDate(todayStr, plan);
        // Check if membership already exists for this order
        const existingMem = await client.query(
          "SELECT id FROM memberships WHERE order_id = $1", [order.id]
        );
        if (existingMem.rows.length) {
          await client.query("UPDATE memberships SET status = 'active' WHERE order_id = $1", [order.id]);
        } else {
          // Cancel any other pending orders for the same plan+user to prevent duplicates
          await client.query(
            `UPDATE orders SET status = 'cancelled', notes = COALESCE(notes,'') || ' [auto-cancelada: otra orden del mismo plan fue aprobada]'
             WHERE user_id = $1 AND plan_id = $2 AND id != $3
               AND status IN ('pending_payment', 'pending_verification')`,
            [order.user_id, order.plan_id, order.id]
          );
          await client.query(
            `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, order_id)
             VALUES ($1,$2,'active',$3,$4,$5,$6,$7)`,
            [order.user_id, order.plan_id, order.payment_method || "transfer", todayStr, endStr, plan.class_limit === 0 ? null : (plan.class_limit ?? null), order.id]
          );
        }
      }

      // ── Create consultation record if order has a complement ──
      const orderComplementType = order.complement_type || null;
      if (orderComplementType) {
        const compInfo = COMPLEMENT_MAP[orderComplementType] || null;
        if (compInfo) {
          try {
            // Find the membership just created for this order
            const memForOrder = await client.query(
              "SELECT id FROM memberships WHERE order_id = $1 LIMIT 1", [order.id]
            );
            const membershipId = memForOrder.rows[0]?.id || null;
            await client.query(
              `INSERT INTO consultations (membership_id, user_id, complement_type, complement_name, specialist, status)
               VALUES ($1, $2, $3, $4, $5, 'pending')`,
              [membershipId, order.user_id, orderComplementType, compInfo.name, compInfo.specialist]
            );
          } catch (_compErr) {
            console.error("[consultations] insert on verify error:", _compErr.message);
          }
        }
      }

      if (order.discount_code_id) {
        await incrementDiscountUsage(order.discount_code_id, client);
      }
    }

    await client.query("COMMIT");

    let plan = null;
    if (order.plan_id) {
      const planRes = await pool.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]);
      if (planRes.rows.length) plan = planRes.rows[0];
    }

    // Email: membership activated
    if (justApproved && order.user_id && plan) {
      try {
        const emailStartStr = new Date().toISOString().slice(0, 10);
        const emailEndStr = calcMembershipEndDate(emailStartStr, plan);
        const startDisplay = new Date(emailStartStr).toLocaleDateString("es-MX");
        const endDisplay = emailEndStr ? new Date(emailEndStr).toLocaleDateString("es-MX") : "";
        const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [order.user_id]);
        if (uRes.rows[0]) {
          const u = uRes.rows[0];
          if (await areEmailNotificationsEnabled()) {
            sendMembershipActivated({
              to: u.email,
              name: u.display_name || "Alumna",
              planName: plan.name,
              startDate: emailStartStr,
              endDate: emailEndStr,
              classLimit: plan.class_limit ?? null,
            }).catch((e) => console.error("[Email] admin order verify:", e.message));
          }
          sendConfiguredWhatsAppTemplate({
            templateKey: "membership_activated",
            phone: u.phone,
            vars: {
              name: u.display_name || "Alumna",
              plan: plan.name || "tu plan",
              startDate: startDisplay,
              endDate: endDisplay,
            },
            fallbackMessage: `Hola ${u.display_name || "Alumna"}, tu membresía ${plan.name || ""} ya está activa. Vigencia: ${startDisplay} al ${endDisplay}.`,
          }).catch((e) => console.error("[WA] admin order verify:", e.message));
        }
      } catch (emailErr) {
        console.error("[Email] admin order verify query:", emailErr.message);
      }
    }

    // Award loyalty points for purchase
    if (justApproved && order.user_id && order.total_amount > 0) {
      try {
        const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
        const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
        const pts = Math.floor((order.total_amount || 0) * (cfg.points_per_peso ?? 1));
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
            [order.user_id, pts, `Compra aprobada — $${order.total_amount}`]
          );
        }
      } catch (e) { /* loyalty earn error shouldn't fail verify */ }
    }

    if (order.user_id) {
      triggerWalletPassSync(order.user_id, justApproved ? "order_verified" : "order_verify_retrigger");
    }
    return res.json({ data: order });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("PUT /admin/orders/:id/verify error:", err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    return res.status(status).json({ message: err?.message || "Error interno" });
  } finally {
    client.release();
  }
});

// ─── Routes: /api/consultations (client) ─────────────────────────────────────

// GET /api/consultations/my — client's own consultations
app.get("/api/consultations/my", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, complement_type, complement_name, specialist, status,
              scheduled_date, notes, created_at
         FROM consultations
        WHERE user_id = $1
          AND status IN ('pending', 'scheduled')
        ORDER BY
          CASE status WHEN 'scheduled' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
          created_at DESC`,
      [req.userId]
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET /api/consultations/my error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/consultations ────────────────────────────────────────

// GET /api/admin/consultations — list consultations with filters
app.get("/api/admin/consultations", adminMiddleware, async (req, res) => {
  try {
    const { status, complementType: qCompType } = req.query;
    let where = "WHERE 1=1";
    const params = [];
    if (status) {
      params.push(status);
      where += ` AND c.status = $${params.length}`;
    }
    if (qCompType) {
      params.push(qCompType);
      where += ` AND c.complement_type = $${params.length}`;
    }
    const r = await pool.query(
      `SELECT c.*, u.display_name AS client_name, u.email AS client_email, u.phone AS client_phone
       FROM consultations c
       JOIN users u ON c.user_id = u.id
       ${where}
       ORDER BY c.created_at DESC`,
      params
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    if (err.code === "42P01") return res.json({ data: [] });
    console.error("GET admin/consultations error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/consultations/:id — update consultation status/date/notes
app.put("/api/admin/consultations/:id", adminMiddleware, async (req, res) => {
  try {
    const { status, scheduledDate, notes } = req.body;
    const sets = [];
    const params = [];

    if (status) {
      params.push(status);
      sets.push(`status = $${params.length}`);
      if (status === "completed") {
        sets.push("completed_at = NOW()");
      }
    }
    if (scheduledDate !== undefined) {
      params.push(scheduledDate);
      sets.push(`scheduled_date = $${params.length}`);
    }
    if (notes !== undefined) {
      params.push(notes);
      sets.push(`notes = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: "Nada que actualizar" });
    }

    sets.push("updated_at = NOW()");
    params.push(req.params.id);

    const r = await pool.query(
      `UPDATE consultations SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!r.rows.length) return res.status(404).json({ message: "Consulta no encontrada" });
    return res.json({ data: camelRows(r.rows)[0] });
  } catch (err) {
    if (err.code === "42P01") return res.status(404).json({ message: "Tabla consultations no existe" });
    console.error("PUT admin/consultations error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/consultations/stats — count by status
app.get("/api/admin/consultations/stats", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM consultations GROUP BY status`
    );
    const stats = { pending: 0, scheduled: 0, completed: 0, cancelled: 0 };
    r.rows.forEach((row) => { stats[row.status] = row.count; });
    return res.json({ data: stats });
  } catch (err) {
    if (err.code === "42P01") return res.json({ data: { pending: 0, scheduled: 0, completed: 0, cancelled: 0 } });
    console.error("GET admin/consultations/stats error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/orders/:id/reject
app.put("/api/admin/orders/:id/reject", adminMiddleware, async (req, res) => {
  try {
    const { notes, reason } = req.body;
    const rejectionReason = reason || notes || "No especificado";
    const r = await pool.query(
      "UPDATE orders SET status = 'rejected', verified_at = NOW(), notes = $2 WHERE id = $1 RETURNING *, user_id",
      [req.params.id, rejectionReason]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Orden no encontrada" });
    const order = r.rows[0];

    // ── Grupo B: limpiar auto-approval + cancelar la membresía si era provisional ──
    await pool.query(
      `UPDATE orders SET auto_approval_expires_at = NULL, verified_by = $2 WHERE id = $1`,
      [req.params.id, req.userId]
    ).catch(()=>{});
    await pool.query(
      `UPDATE memberships SET status='cancelled', updated_at=NOW() WHERE order_id = $1 AND status = 'active'`,
      [req.params.id]
    ).catch(()=>{});

    // Notify the client about rejection via email and WhatsApp
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [order.user_id]);
      if (uRes.rows.length) {
        const u = uRes.rows[0];
        const userName = u.display_name || "Clienta";
        const rejMsg = `Hola ${userName} 👋\n\nTu comprobante de pago fue revisado y lamentablemente *no pudo ser aprobado*.\n\n📌 Motivo: ${rejectionReason}\n\nSi crees que es un error o tienes dudas, responde este mensaje. ¡Estamos para ayudarte! 💜`;

        // WhatsApp notification
        if (u.phone) {
          try {
            await sendConfiguredWhatsAppTemplate({
              templateKey: "transfer_rejected",
              phone: u.phone,
              vars: {
                name: userName,
                reason: rejectionReason,
              },
              fallbackMessage: rejMsg,
            });
          } catch (waErr) {
            console.error("[Reject WhatsApp]", waErr.response?.data || waErr.message);
          }
        }

        // Email notification
        if (u.email) {
          try {
            const { sendOrderRejected } = await import("./emailService.js").catch(() => ({}));
            if (typeof sendOrderRejected === "function") {
              await sendOrderRejected({ to: u.email, name: userName, reason: rejectionReason });
            }
          } catch (emailErr) {
            console.error("[Reject Email]", emailErr.message);
          }
        }
      }
    } catch (notifyErr) {
      console.error("[Reject notify]", notifyErr.message);
    }

    return res.json({ data: order });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Payments admin ──────────────────────────────────────────────────────────

// GET /api/payments
app.get("/api/payments", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, userId, limit = 200 } = req.query;
    const params = [];
    let startIdx = null;
    let endIdx = null;
    let userIdx = null;
    if (startDate) { params.push(startDate); startIdx = params.length; }
    if (endDate) { params.push(endDate); endIdx = params.length; }
    if (userId) { params.push(userId); userIdx = params.length; }
    // Include approved orders AND manually-assigned memberships
    let q = `
      SELECT
        o.id,
        o.user_id,
        COALESCE(u.display_name, o.guest_name) AS user_name,
        COALESCE(p.name, 'Clase suelta') AS plan_name,
        o.total_amount,
        o.payment_method AS method,
        o.status::text AS status,
        o.created_at,
        CASE WHEN o.user_id IS NULL THEN 'walkin' ELSE 'order' END AS source
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN plans p ON o.plan_id = p.id
      WHERE o.status = 'approved'`;
    if (startIdx) q += ` AND o.created_at >= $${startIdx}`;
    if (endIdx) q += ` AND o.created_at < ($${endIdx}::date + INTERVAL '1 day')`;
    if (userIdx) q += ` AND o.user_id = $${userIdx}`;

    // Membresías asignadas a mano (sin orden online): representan un pago manual.
    // Solo las que de verdad fueron pagadas (active/expired/paused), NO las
    // canceladas ni pendientes, y NO si ya existe una orden aprobada del mismo
    // plan ~mismo momento (evita que se vea "Activa" + "Aprobada" = pago doble).
    // El estado se normaliza a 'approved' (Pagado): aquí importa el pago, no el
    // ciclo de vida de la membresía (eso está en la pestaña Membresías).
    let mq = `
      SELECT
        m.id,
        m.user_id,
        u.display_name AS user_name,
        p.name AS plan_name,
        p.price AS total_amount,
        m.payment_method AS method,
        'approved'::text AS status,
        m.created_at,
        'membership' AS source
      FROM memberships m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.order_id IS NULL
        AND m.status IN ('active','expired','paused')
        AND NOT EXISTS (
          SELECT 1 FROM orders o2
           WHERE o2.user_id = m.user_id
             AND o2.status = 'approved'
             AND o2.plan_id = m.plan_id
             AND ABS(EXTRACT(EPOCH FROM (o2.created_at - m.created_at))) < 86400
        )`;
    if (startIdx) mq += ` AND m.created_at >= $${startIdx}`;
    if (endIdx) mq += ` AND m.created_at < ($${endIdx}::date + INTERVAL '1 day')`;
    if (userIdx) mq += ` AND m.user_id = $${userIdx}`;

    const combined = `(${q}) UNION ALL (${mq}) ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    const r = await pool.query(combined, params);
    const total = r.rows.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    return res.json({ data: r.rows.map((o) => ({ ...o, userName: o.user_name, planName: o.plan_name })), total });
  } catch (err) {
    console.error("[GET /payments]", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Discount codes admin CRUD ───────────────────────────────────────────────

// GET /api/discount-codes
app.get("/api/discount-codes", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT dc.*, p.name AS plan_name
       FROM discount_codes dc
       LEFT JOIN plans p ON p.id = dc.plan_id
       ORDER BY dc.created_at DESC`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/discount-codes
app.post("/api/discount-codes", adminMiddleware, async (req, res) => {
  try {
    const {
      code,
      discountType = "percent",
      discountValue,
      maxUses,
      expiresAt,
      minOrderAmount,
      minPurchaseAmount,
      planId,
      classCategory,
      channel,
      isActive = true,
    } = req.body;
    if (!code || !discountValue) return res.status(400).json({ message: "Código y valor requeridos" });
    const normalizedType = normalizeDiscountType(discountType);
    if (!normalizedType) return res.status(400).json({ message: "Tipo de descuento inválido" });
    const normalizedMinOrder = Number(minOrderAmount ?? minPurchaseAmount ?? 0) || 0;
    const normalizedCategory =
      classCategory === undefined || classCategory === null || classCategory === ""
        ? null
        : normalizeClassCategory(classCategory, "__invalid__");
    if (normalizedCategory === "__invalid__") {
      return res.status(400).json({ message: "Categoría inválida. Usa: all, pilates, bienestar, funcional o mixto." });
    }
    const normalizedChannel =
      channel === undefined || channel === null || channel === ""
        ? "all"
        : normalizeDiscountChannel(channel, "__invalid__");
    if (normalizedChannel === "__invalid__") {
      return res.status(400).json({ message: "Canal inválido. Usa: all, membership, pos o event." });
    }
    if (planId) {
      const planExists = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]);
      if (!planExists.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    }
    const r = await pool.query(
      `INSERT INTO discount_codes (
         code, discount_type, discount_value, max_uses, expires_at,
         min_order_amount, plan_id, class_category, channel, is_active
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        code.toUpperCase(),
        normalizedType,
        discountValue,
        maxUses || null,
        expiresAt || null,
        normalizedMinOrder,
        planId || null,
        normalizedCategory,
        normalizedChannel,
        isActive,
      ]
    );
    const enriched = await pool.query(
      `SELECT dc.*, p.name AS plan_name
       FROM discount_codes dc
       LEFT JOIN plans p ON p.id = dc.plan_id
       WHERE dc.id = $1`,
      [r.rows[0].id]
    );
    return res.status(201).json({ data: camelRow(enriched.rows[0]) });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Código ya existe" });
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/discount-codes/:id
app.put("/api/discount-codes/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      maxUses,
      expiresAt,
      minOrderAmount,
      minPurchaseAmount,
      planId,
      classCategory,
      channel,
      isActive,
    } = req.body;
    const normalizedType = normalizeDiscountType(discountType);
    if (!normalizedType) return res.status(400).json({ message: "Tipo de descuento inválido" });
    const normalizedMinOrder = Number(minOrderAmount ?? minPurchaseAmount ?? 0) || 0;
    const normalizedCategory =
      classCategory === undefined || classCategory === null || classCategory === ""
        ? null
        : normalizeClassCategory(classCategory, "__invalid__");
    if (normalizedCategory === "__invalid__") {
      return res.status(400).json({ message: "Categoría inválida. Usa: all, pilates, bienestar, funcional o mixto." });
    }
    const normalizedChannel =
      channel === undefined || channel === null || channel === ""
        ? "all"
        : normalizeDiscountChannel(channel, "__invalid__");
    if (normalizedChannel === "__invalid__") {
      return res.status(400).json({ message: "Canal inválido. Usa: all, membership, pos o event." });
    }
    if (planId) {
      const planExists = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]);
      if (!planExists.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    }
    const r = await pool.query(
      `UPDATE discount_codes SET code=$1, discount_type=$2, discount_value=$3, max_uses=$4,
       expires_at=$5, min_order_amount=$6, plan_id=$7, class_category=$8, channel=$9, is_active=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [
        code?.toUpperCase(),
        normalizedType,
        discountValue,
        maxUses || null,
        expiresAt || null,
        normalizedMinOrder,
        planId || null,
        normalizedCategory,
        normalizedChannel,
        isActive !== false,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Código no encontrado" });
    const enriched = await pool.query(
      `SELECT dc.*, p.name AS plan_name
       FROM discount_codes dc
       LEFT JOIN plans p ON p.id = dc.plan_id
       WHERE dc.id = $1`,
      [r.rows[0].id]
    );
    return res.json({ data: camelRow(enriched.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/discount-codes/:id
app.delete("/api/discount-codes/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM discount_codes WHERE id = $1", [req.params.id]);
    return res.json({ message: "Código eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/discount-codes/:id/redemptions — quién ha usado este cupón.
// Devuelve órdenes (aprobadas o no) con el usuario, plan, monto y fecha.
app.get("/api/discount-codes/:id/redemptions", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.id           AS order_id,
              o.order_number,
              o.status,
              o.subtotal,
              o.discount_amount,
              o.total_amount,
              o.payment_method,
              o.created_at,
              u.id           AS user_id,
              u.display_name AS user_name,
              u.email        AS user_email,
              p.name         AS plan_name
         FROM orders o
         JOIN users u ON o.user_id = u.id
         LEFT JOIN plans p ON o.plan_id = p.id
        WHERE o.discount_code_id = $1
        ORDER BY o.created_at DESC`,
      [req.params.id]
    );
    return res.json({ data: r.rows.map((x) => ({
      orderId: x.order_id,
      orderNumber: x.order_number,
      status: x.status,
      subtotal: Number(x.subtotal),
      discountAmount: Number(x.discount_amount),
      totalAmount: Number(x.total_amount),
      paymentMethod: x.payment_method,
      createdAt: x.created_at,
      userId: x.user_id,
      userName: x.user_name,
      userEmail: x.user_email,
      planName: x.plan_name,
    })) });
  } catch (err) {
    console.error("GET /discount-codes/:id/redemptions error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Products CRUD (POS) ─────────────────────────────────────────────────────

// GET /api/products
app.get("/api/products", adminMiddleware, async (req, res) => {
  try {
    const { search = "", active } = req.query;
    let q = "SELECT * FROM products WHERE 1=1";
    const params = [];
    if (search) { params.push(`%${search}%`); q += ` AND name ILIKE $${params.length}`; }
    if (active !== undefined) {
      params.push(String(active) === "true");
      q += ` AND is_active = $${params.length}`;
    }
    q += " ORDER BY created_at DESC";
    const r = await pool.query(q, params);
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/products
app.post("/api/products", adminMiddleware, async (req, res) => {
  try {
    const { name, price, category, stock = 0, sku } = req.body;
    const isActive = parseBooleanFlag(req.body?.isActive ?? req.body?.is_active ?? true);
    if (!name) return res.status(400).json({ message: "Nombre requerido" });
    const r = await pool.query(
      "INSERT INTO products (name, price, category, stock, sku, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [name, price || 0, category || "accesorios", stock, sku || null, isActive]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/products/:id
app.put("/api/products/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, price, category, stock, sku } = req.body;
    const isActive = parseBooleanFlag(req.body?.isActive ?? req.body?.is_active ?? true);
    const r = await pool.query(
      "UPDATE products SET name=$1, price=$2, category=$3, stock=$4, sku=$5, is_active=$6, updated_at=NOW() WHERE id=$7 RETURNING *",
      [name, price, category, stock, sku || null, isActive, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Producto no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/products/:id
app.delete("/api/products/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
    return res.json({ message: "Producto eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/pos/sale — POS transaction
app.post("/api/pos/sale", adminMiddleware, async (req, res) => {
  try {
    const { userId, items, paymentMethod = "efectivo", discountCode } = req.body;
    const result = await processPosSale({ userId, items, paymentMethod, discountCode });
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    return res.status(201).json({ data: result.data });
  } catch (err) {
    console.error("POST /pos/sale error:", err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    return res.status(status).json({ message: err?.message || "Error interno" });
  }
});

// ─── Loyalty admin ───────────────────────────────────────────────────────────

// GET /api/admin/loyalty/users — list users with points
app.get("/api/admin/loyalty/users", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.display_name, u.email,
              COALESCE(SUM(CASE WHEN lt.type='earn' THEN lt.points ELSE -lt.points END), 0) AS balance
       FROM users u
       LEFT JOIN loyalty_transactions lt ON lt.user_id = u.id
       WHERE u.role = 'client'
       GROUP BY u.id ORDER BY balance DESC LIMIT 50`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/loyalty/adjust — manual points adjustment
app.post("/api/admin/loyalty/adjust", adminMiddleware, async (req, res) => {
  try {
    const { userId, points, reason, type = "earn" } = req.body;
    if (!userId || !points) return res.status(400).json({ message: "userId y points requeridos" });
    const r = await pool.query(
      "INSERT INTO loyalty_transactions (user_id, type, points, description, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [userId, type, Math.abs(points), reason || "Ajuste manual", req.userId]
    );
    triggerWalletPassSync(userId, "loyalty_adjust");
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/loyalty/recalculate/:userId — award missing membership points retroactively
app.post("/api/admin/loyalty/recalculate/:userId", adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    // Get loyalty config
    const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
    const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
    const ppp = Number(cfg.points_per_peso ?? 1);
    if (cfg.enabled === false) return res.json({ data: { awarded: 0, message: "Loyalty desactivado en configuración" } });

    // Get all active/expired memberships for this user
    const mRes = await pool.query(
      `SELECT m.id, p.price, p.name
       FROM memberships m
       JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1 AND m.status IN ('active','expired')`,
      [userId]
    );
    if (!mRes.rows.length) return res.json({ data: { awarded: 0, message: "No hay membresías para recalcular" } });

    // Check which memberships already have a loyalty transaction
    const txRes = await pool.query(
      "SELECT description FROM loyalty_transactions WHERE user_id=$1 AND type='earn'",
      [userId]
    );
    const existingDescs = new Set(txRes.rows.map((r) => r.description));

    let awarded = 0;
    for (const m of mRes.rows) {
      const desc = `Membresía asignada — ${m.name} ($${m.price})`;
      // Skip if already awarded for this membership (by description match)
      if (existingDescs.has(desc)) continue;
      const pts = Math.floor(parseFloat(m.price) * ppp);
      if (pts <= 0) continue;
      await pool.query(
        "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
        [userId, pts, desc]
      );
      awarded += pts;
    }

    if (awarded > 0) {
      triggerWalletPassSync(userId, "loyalty_recalculate");
    }
    return res.json({ data: { awarded, message: awarded > 0 ? `Se otorgaron ${awarded} puntos retroactivos` : "Todos los puntos ya estaban registrados" } });
  } catch (err) {
    console.error("[Recalculate loyalty]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Instructors / Staff ─────────────────────────────────────────────────────

// GET /api/instructors
app.get("/api/instructors", adminMiddleware, async (req, res) => {
  try {
    // photo_url se sustituye por la URL ligera (ver INSTRUCTOR_PHOTO_SQL):
    // con fotos base64 en BD, devolver i.* tal cual pesaba varios MB.
    const r = await pool.query(
      `SELECT i.*, ${INSTRUCTOR_PHOTO_SQL} AS photo_url FROM instructors i ORDER BY i.created_at DESC`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/instructors
app.post("/api/instructors", adminMiddleware, async (req, res) => {
  try {
    const { displayName, email, phone, bio, specialties, isActive = true, photoFocusX = 50, photoFocusY = 50 } = req.body;
    if (!displayName) return res.status(400).json({ message: "Nombre requerido" });
    const specialtiesValue = serializeSpecialtiesForDb(specialties);
    const safeFocusX = Math.max(0, Math.min(100, Number(photoFocusX || 50)));
    const safeFocusY = Math.max(0, Math.min(100, Number(photoFocusY || 50)));
    const r = await pool.query(
      "INSERT INTO instructors (display_name, email, phone, bio, specialties, is_active, photo_focus_x, photo_focus_y) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [displayName, email || null, phone || null, bio || null, specialtiesValue, isActive, safeFocusX, safeFocusY]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/instructors/:id
app.put("/api/instructors/:id", adminMiddleware, async (req, res) => {
  try {
    const { displayName, email, phone, bio, specialties, isActive, photoFocusX = 50, photoFocusY = 50 } = req.body;
    const specialtiesValue = serializeSpecialtiesForDb(specialties);
    const safeFocusX = Math.max(0, Math.min(100, Number(photoFocusX || 50)));
    const safeFocusY = Math.max(0, Math.min(100, Number(photoFocusY || 50)));
    const r = await pool.query(
      "UPDATE instructors SET display_name=$1, email=$2, phone=$3, bio=$4, specialties=$5, is_active=$6, photo_focus_x=$7, photo_focus_y=$8, updated_at=NOW() WHERE id=$9 RETURNING *",
      [displayName, email || null, phone || null, bio || null, specialtiesValue, isActive !== false, safeFocusX, safeFocusY, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Instructor no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/instructors/:id
app.delete("/api/instructors/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM instructors WHERE id = $1", [req.params.id]);
    return res.json({ message: "Instructor eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/instructors/:id/photo — upload instructor photo to Google Drive
app.post("/api/instructors/:id/photo", adminMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const instructorId = req.params.id;

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_DRIVE_FOLDER_ID &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    let photoUrl;
    if (isDriveConfigured) {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
      });
      const { access_token } = await tokenResp.json();

      const boundary = "instructor_photo_" + Date.now();
      const metadata = JSON.stringify({
        name: `instructor_${instructorId}_${Date.now()}.${req.file.originalname.split(".").pop()}`,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${req.file.mimetype}\r\n\r\n`),
        req.file.buffer,
        Buffer.from(`\r\n--${boundary}--`),
      ]);

      const uploadResp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      const uploadJson = await uploadResp.json();
      if (!uploadJson.id) throw new Error("Error al subir imagen a Drive");

      await fetch(`https://www.googleapis.com/drive/v3/files/${uploadJson.id}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });

      photoUrl = `/api/drive/image/${uploadJson.id}`;
    } else {
      photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    const r = await pool.query(
      "UPDATE instructors SET photo_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [photoUrl, instructorId]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Instructor no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("Instructor photo upload error:", err);
    return res.status(500).json({ message: err.message || "Error al subir foto" });
  }
});

// GET /api/instructors/:id/photo — sirve la foto guardada en BD (base64) como
// imagen binaria cacheable. Las listas (clases, reservas, instructoras)
// devuelven esta URL en lugar del data: URL completo. Sin auth: se consume
// desde <img src> (no manda header Authorization) y el id UUID no es adivinable.
app.get("/api/instructors/:id/photo", async (req, res) => {
  try {
    const r = await pool.query("SELECT photo_url FROM instructors WHERE id = $1", [req.params.id]);
    return servePhotoValue(res, r.rows[0]?.photo_url);
  } catch (err) {
    console.error("GET /instructors/:id/photo:", err.message);
    return res.status(500).end();
  }
});

// GET /api/users/:id/photo — igual que el de instructoras, para fotos de
// clientas (cumpleaños del dashboard, perfiles).
app.get("/api/users/:id/photo", async (req, res) => {
  try {
    const r = await pool.query("SELECT photo_url FROM users WHERE id = $1", [req.params.id]);
    return servePhotoValue(res, r.rows[0]?.photo_url);
  } catch (err) {
    console.error("GET /users/:id/photo:", err.message);
    return res.status(500).end();
  }
});

// POST /api/instructors/:id/magic-link — generate a one-time login link for an instructor
app.post("/api/instructors/:id/magic-link", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM instructors WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Instructor no encontrado" });
    const ins = r.rows[0];
    // Find or create a user account for this instructor
    let userRow = null;
    if (ins.email) {
      const uRes = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [ins.email]);
      if (uRes.rows.length) {
        userRow = uRes.rows[0];
      } else {
        // Create a user for the instructor
        const newU = await pool.query(
          `INSERT INTO users (email, display_name, role, is_verified) VALUES ($1, $2, 'instructor', true) RETURNING *`,
          [ins.email, ins.display_name]
        );
        userRow = newU.rows[0];
      }
    }
    if (!userRow) return res.status(400).json({ message: "El instructor necesita un email para generar magic link" });
    // Generate a short-lived JWT
    const token = jwt.sign({ userId: userRow.id, role: userRow.role, type: "magic_link" }, JWT_SECRET, { expiresIn: "24h" });
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const link = `${baseUrl}/auth/magic?token=${token}`;
    return res.json({ data: { link } });
  } catch (err) {
    console.error("magic-link error:", err);
    return res.status(500).json({ message: "Error al generar magic link" });
  }
});


// GET /api/admin/reports?startDate=&endDate=
app.get("/api/admin/reports", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const end = endDate || new Date().toISOString().slice(0, 10);

    const [revenue, newClients, bookings, topPlans] = await Promise.all([
      pool.query(
        "SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count FROM orders WHERE status='approved' AND created_at BETWEEN $1 AND $2",
        [start, end]
      ),
      pool.query(
        "SELECT COUNT(*) FROM users WHERE role='client' AND created_at BETWEEN $1 AND $2",
        [start, end]
      ),
      pool.query(
        // Cuenta PERSONAS (alumna+invitada = 2; walk-in/normal = 1).
        `SELECT
            COALESCE(SUM(CASE WHEN user_id IS NOT NULL AND guest_name IS NOT NULL AND guest_name <> '' THEN 2 ELSE 1 END) FILTER (WHERE status <> 'cancelled'), 0) AS total,
            COALESCE(SUM(CASE WHEN user_id IS NOT NULL AND guest_name IS NOT NULL AND guest_name <> '' THEN 2 ELSE 1 END) FILTER (WHERE status = 'checked_in'), 0) AS attended
           FROM bookings WHERE created_at BETWEEN $1 AND $2`,
        [start, end]
      ),
      pool.query(
        `SELECT p.name, COUNT(m.id) AS sales, SUM(o.total_amount) AS revenue
         FROM memberships m
         JOIN plans p ON m.plan_id = p.id
         LEFT JOIN orders o ON o.plan_id = p.id AND o.status = 'approved'
         WHERE m.created_at BETWEEN $1 AND $2
         GROUP BY p.name ORDER BY sales DESC LIMIT 5`,
        [start, end]
      ),
    ]);

    return res.json({
      period: { start, end },
      revenue: { total: parseFloat(revenue.rows[0].total), count: parseInt(revenue.rows[0].count) },
      newClients: parseInt(newClients.rows[0].count),
      bookings: { total: parseInt(bookings.rows[0].total), attended: parseInt(bookings.rows[0].attended) },
      topPlans: topPlans.rows,
    });
  } catch (err) {
    console.error("GET /admin/reports error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Classes admin ──────────────────────────────────────────────────────────

// GET /api/admin/classes — all scheduled classes
app.get("/api/admin/classes", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, instructorId } = req.query;
    let q = `SELECT c.*, ct.name AS class_type_name, i.display_name AS instructor_name,
             (SELECT COALESCE(SUM(CASE WHEN b.user_id IS NOT NULL AND b.guest_name IS NOT NULL AND b.guest_name <> '' THEN 2 ELSE 1 END), 0)
                FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in'))::int AS current_bookings
             FROM classes c
             LEFT JOIN class_types ct ON c.class_type_id = ct.id
             LEFT JOIN instructors i ON c.instructor_id = i.id
             WHERE 1=1`;
    const params = [];
    if (startDate) { params.push(startDate); q += ` AND c.date >= $${params.length}`; }
    if (endDate) { params.push(endDate); q += ` AND c.date <= $${params.length}`; }
    if (instructorId) { params.push(instructorId); q += ` AND c.instructor_id = $${params.length}`; }
    q += " ORDER BY c.date ASC, c.start_time ASC LIMIT 200";
    const r = await pool.query(q, params);
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/classes — create a class
app.post("/api/admin/classes", adminMiddleware, async (req, res) => {
  try {
    const { classTypeId, instructorId, startTime, endTime, capacity = 10, location, notes } = req.body;
    if (!classTypeId || !startTime) return res.status(400).json({ message: "classTypeId y startTime requeridos" });
    const r = await pool.query(
      `INSERT INTO classes (class_type_id, instructor_id, start_time, end_time, capacity, location, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled') RETURNING *`,
      [classTypeId, instructorId || null, startTime, endTime || null, capacity, location || null, notes || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/classes/:id
// Body acepta:
//   classTypeId, instructorId, startTime, endTime, maxCapacity, status, notes
//   notifyAttendees (bool, default true cuando cambia instructorId)
// Si el instructorId cambia, busca todas las bookings activas y dispara
// notificación (email + WhatsApp) a cada alumna con el template
// "instructor_changed". Las notificaciones se envían async (no bloquean la
// respuesta del PUT).
app.put("/api/admin/classes/:id", adminMiddleware, async (req, res) => {
  try {
    const classId = req.params.id;
    const { classTypeId, instructorId, startTime, endTime, maxCapacity, status, notes } = req.body;
    const notifyAttendees = req.body?.notifyAttendees !== false;

    // 1) Leer estado actual para detectar cambios
    const beforeRes = await pool.query(
      `SELECT c.id, c.instructor_id, c.date, c.start_time, c.end_time,
              ct.name AS class_type_name,
              i.display_name AS old_instructor_name
         FROM classes c
         JOIN class_types ct ON c.class_type_id = ct.id
         LEFT JOIN instructors i ON c.instructor_id = i.id
        WHERE c.id = $1`,
      [classId]
    );
    if (!beforeRes.rows.length) return res.status(404).json({ message: "Clase no encontrada" });
    const before = beforeRes.rows[0];
    const instructorChanged = instructorId && instructorId !== before.instructor_id;

    // 2) Update
    const r = await pool.query(
      `UPDATE classes SET
         class_type_id  = COALESCE($1, class_type_id),
         instructor_id  = COALESCE($2, instructor_id),
         start_time     = COALESCE($3, start_time),
         end_time       = COALESCE($4, end_time),
         max_capacity   = COALESCE($5, max_capacity),
         status         = COALESCE($6, status),
         notes          = COALESCE($7, notes),
         updated_at     = NOW()
       WHERE id = $8 RETURNING *`,
      [classTypeId || null, instructorId || null, startTime || null, endTime || null,
       maxCapacity || null, status || null, notes || null, classId]
    );

    // 3) Si cambió el instructor, notificar a alumnas async
    let notifiedCount = 0;
    if (instructorChanged && notifyAttendees) {
      try {
        const attendeesRes = await pool.query(
          `SELECT u.id, u.display_name, u.email, u.phone, u.receive_reminders,
                  ni.display_name AS new_instructor_name
             FROM bookings b
             JOIN users u ON b.user_id = u.id
             JOIN instructors ni ON ni.id = $2
            WHERE b.class_id = $1 AND b.status IN ('confirmed','checked_in')`,
          [classId, instructorId]
        );
        notifiedCount = attendeesRes.rows.length;
        const classDate = before.date instanceof Date
          ? before.date.toISOString().slice(0, 10)
          : String(before.date).slice(0, 10);
        const classTime = String(before.start_time).slice(0, 5);

        // Cargar templates configurados (admin puede editarlos en Settings)
        const templates = await getSettingsValue("notification_templates", DEFAULT_NOTIFICATION_TEMPLATES);
        const tplEmail = templates?.instructor_changed || DEFAULT_NOTIFICATION_TEMPLATES.instructor_changed;
        const notifSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
        const emailsEnabled = notifSettings?.email_reminders !== false;
        const whatsappEnabled = notifSettings?.whatsapp_reminders !== false && EVOLUTION_CONFIGURED;

        // Disparar todas las notificaciones sin await (no bloquean la respuesta)
        for (const u of attendeesRes.rows) {
          const vars = {
            name: u.display_name || "alumna",
            class: before.class_type_name,
            date: classDate,
            time: classTime,
            oldInstructor: before.old_instructor_name || "tu instructora habitual",
            newInstructor: u.new_instructor_name,
          };
          // Email vía sendCustomBroadcast (usa baseLayout + Resend)
          if (u.email && emailsEnabled) {
            const subject = renderTemplateVars(tplEmail.subject, vars);
            const body = renderTemplateVars(tplEmail.body, vars);
            sendCustomBroadcast({
              to: u.email,
              name: u.display_name || "",
              subject: subject || "Cambio de instructora — VARRE24",
              body,
              headline: `Cambio de instructora`,
            }).catch((err) => {
              console.error("[instructor_changed email]", u.email, err?.message || err);
            });
          }
          // WhatsApp (si está configurado y la alumna acepta recordatorios)
          if (u.phone && u.receive_reminders !== false && whatsappEnabled) {
            sendConfiguredWhatsAppTemplate({
              templateKey: "instructor_changed",
              phone: u.phone,
              vars,
              fallbackMessage: renderTemplateVars(tplEmail.body, vars),
            }).catch((err) => {
              console.error("[instructor_changed whatsapp]", u.phone, err?.message || err);
            });
          }
        }
      } catch (notifErr) {
        console.error("[instructor change notifications] fallo:", notifErr.message);
      }
    }

    return res.json({
      data: r.rows[0],
      instructorChanged: Boolean(instructorChanged),
      notifiedCount,
    });
  } catch (err) {
    console.error("PUT /api/admin/classes/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/classes/:id
// DELETE /api/admin/classes/:id — borrado físico (no es cancelación).
// La diferencia con PUT /classes/:id/cancel: cancel deja la fila con
// status='cancelled' y mantiene los bookings. Esto la borra de raíz, junto
// con cualquier reserva, reseña, lista de espera o asistencia ligada — para
// clases que nunca debieron existir / quedaron sueltas y NO se imparten.
app.delete("/api/admin/classes/:id", adminMiddleware, async (req, res) => {
  const classId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query("SELECT id FROM classes WHERE id = $1", [classId]);
    if (!exists.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    // Borrar reservas dependientes (no se devuelven créditos: si la clase no
    // existió, tampoco gastó crédito; el admin sabe lo que hace).
    const bookingsDel = await client.query(
      "DELETE FROM bookings WHERE class_id = $1 RETURNING id",
      [classId]
    );
    // Tablas hijas opcionales — savepoint para no abortar si no existen.
    for (const sql of [
      "DELETE FROM reviews WHERE class_id = $1",
      "DELETE FROM waitlist WHERE class_id = $1",
      "DELETE FROM class_attendees WHERE class_id = $1",
    ]) {
      await client.query("SAVEPOINT sp_opt");
      try {
        await client.query(sql, [classId]);
        await client.query("RELEASE SAVEPOINT sp_opt");
      } catch (_e) {
        await client.query("ROLLBACK TO SAVEPOINT sp_opt");
      }
    }
    await client.query("DELETE FROM classes WHERE id = $1", [classId]);
    await client.query("COMMIT");
    return res.json({
      message: "Clase eliminada",
      deleted_bookings: bookingsDel.rowCount,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("DELETE /admin/classes/:id error:", err);
    return res.status(500).json({ message: err.message || "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/admin/classes/generate — bulk generate from schedule templates
app.post("/api/admin/classes/generate", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, instructorId } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate y endDate requeridos" });
    if (!instructorId) return res.status(400).json({ message: "instructorId requerido" });
    // Get schedule slots
    const slotsRes = await pool.query("SELECT * FROM schedule_templates WHERE is_active = true");
    const slots = slotsRes.rows;
    if (!slots.length) return res.status(400).json({ message: "No hay horarios configurados" });
    // Get a default class type for each label
    const classTypeRes = await pool.query("SELECT id, name, category FROM class_types WHERE is_active = true");
    const classTypes = classTypeRes.rows;
    const created = [];
    // Append T00:00:00 to parse as local midnight (not UTC)
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay(); // Mon=1..Sun=7
      const daySlots = slots.filter(s => s.day_of_week === dayOfWeek);
      for (const slot of daySlots) {
        const classDate = toDbDateString(d);
        const startTimeValue = parseTimeSlotTo24Hour(slot.time_slot);
        if (!startTimeValue) continue;
        const endTimeValue = addMinutesToTimeString(startTimeValue, 55);
        // Pick class type by label
        const label = slot.class_label?.toUpperCase();
        let ct = classTypes.find(ct => ct.category?.toLowerCase() === label?.toLowerCase());
        if (!ct) ct = classTypes[0];
        if (!ct) continue;
        // Check no duplicate
        const exists = await pool.query(
          "SELECT id FROM classes WHERE date = $1 AND start_time = $2 AND class_type_id = $3",
          [classDate, startTimeValue, ct.id]
        );
        if (exists.rows.length) continue;
        const r = await pool.query(
          `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
           VALUES ($1,$2,$3,$4,$5,10,'scheduled') RETURNING *`,
          [ct.id, instructorId, classDate, startTimeValue, endTimeValue]
        );
        created.push(r.rows[0]);
      }
    }
    return res.json({ created: created.length, data: created });
  } catch (err) {
    console.error("POST /admin/classes/generate error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/videos — video list for admin
app.get("/api/admin/videos", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT v.*, ct.name AS class_type_name, i.display_name AS instructor_name
       FROM videos v
       LEFT JOIN class_types ct ON v.class_type_id = ct.id
       LEFT JOIN instructors i ON v.instructor_id = i.id
       ORDER BY v.created_at DESC`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/videos
app.post("/api/admin/videos", adminMiddleware, async (req, res) => {
  try {
    const { title, description, videoUrl, thumbnailUrl, classTypeId, instructorId, durationMinutes, accessType = "membership", isPublished = false, isFeatured = false, sortOrder = 0 } = req.body;
    if (!title || !videoUrl) return res.status(400).json({ message: "title y videoUrl requeridos" });
    const r = await pool.query(
      `INSERT INTO videos (title, description, video_url, thumbnail_url, class_type_id, instructor_id, duration_minutes, access_type, is_published, is_featured, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [title, description || null, videoUrl, thumbnailUrl || null, classTypeId || null, instructorId || null, durationMinutes || null, accessType, isPublished, isFeatured, sortOrder]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/videos/:id
app.put("/api/admin/videos/:id", adminMiddleware, async (req, res) => {
  try {
    const { title, description, videoUrl, thumbnailUrl, classTypeId, instructorId, durationMinutes, accessType, isPublished, isFeatured, sortOrder } = req.body;
    const r = await pool.query(
      `UPDATE videos SET title=$1, description=$2, video_url=$3, thumbnail_url=$4, class_type_id=$5,
       instructor_id=$6, duration_minutes=$7, access_type=$8, is_published=$9, is_featured=$10, sort_order=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [title, description || null, videoUrl, thumbnailUrl || null, classTypeId || null, instructorId || null, durationMinutes || null, accessType || "membership", isPublished !== false, isFeatured === true, sortOrder || 0, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Video no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/videos/:id
app.delete("/api/admin/videos/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM videos WHERE id = $1", [req.params.id]);
    return res.json({ message: "Video eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/reviews
app.get("/api/admin/reviews", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rv.*,
              u.display_name AS user_name,
              u.email,
              i.display_name AS instructor_name,
              ct.name AS class_type_name,
              c.date AS class_date,
              c.start_time AS class_start_time
       FROM reviews rv
       LEFT JOIN users u ON rv.user_id = u.id
       LEFT JOIN bookings b ON rv.booking_id = b.id
       LEFT JOIN classes c ON c.id = COALESCE(rv.class_id, b.class_id)
       LEFT JOIN class_types ct ON c.class_type_id = ct.id
       LEFT JOIN instructors i ON i.id = COALESCE(rv.instructor_id, c.instructor_id)
       ORDER BY rv.created_at DESC LIMIT 100`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/reviews/:id/approve
app.put("/api/admin/reviews/:id/approve", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE reviews SET is_approved=true WHERE id=$1 RETURNING *", [req.params.id]);
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/admin/reviews/:id
app.delete("/api/admin/reviews/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM reviews WHERE id = $1", [req.params.id]);
    return res.json({ message: "Reseña eliminada" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── MÓDULO DE EVENTOS ────────────────────────────────────────────────────────

/** Helper: normalize a DB row to camelCase API shape */
function mapEventRow(row) {
  const toYMD = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v.slice(0, 10);
    return new Date(v).toISOString().slice(0, 10);
  };
  const toHM = (v) => {
    if (!v) return null;
    return String(v).slice(0, 5);
  };
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    instructor: row.instructor_name,
    instructorPhoto: row.instructor_photo || null,
    date: toYMD(row.date),
    startTime: toHM(row.start_time),
    endTime: toHM(row.end_time),
    location: row.location,
    capacity: Number(row.capacity),
    registered: Number(row.registered || 0),
    price: Number(row.price || 0),
    currency: row.currency || "MXN",
    earlyBirdPrice: row.early_bird_price != null ? Number(row.early_bird_price) : null,
    earlyBirdDeadline: toYMD(row.early_bird_deadline),
    memberDiscount: Number(row.member_discount || 0),
    image: row.image || null,
    requirements: row.requirements || "",
    includes: Array.isArray(row.includes) ? row.includes : (row.includes ? JSON.parse(row.includes) : []),
    tags: Array.isArray(row.tags) ? row.tags : (row.tags ? JSON.parse(row.tags) : []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRegRow(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    status: row.status,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || null,
    paymentReference: row.payment_reference || null,
    hasPaymentProof: !!row.payment_proof_url,
    paymentProofFileName: row.payment_proof_file_name || null,
    transferDate: row.transfer_date ? String(row.transfer_date).slice(0, 10) : null,
    paidAt: row.paid_at || null,
    checkedIn: !!row.checked_in,
    checkedInAt: row.checked_in_at || null,
    waitlistPosition: row.waitlist_position || null,
    notes: row.notes || null,
    eventPassId: row.event_pass_id || null,
    eventPassCode: row.event_pass_code || null,
    eventPassStatus: row.event_pass_status || null,
    eventPassIssuedAt: row.event_pass_issued_at || null,
    eventPassUsedAt: row.event_pass_used_at || null,
    createdAt: row.created_at,
  };
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDecodeBase64ToText(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8").trim();
  } catch (_) {
    return "";
  }
}

function extractScanTokens(rawCode) {
  const raw = String(rawCode || "").trim();
  if (!raw) return [];
  const tokens = new Set([raw]);
  const passCodeMatch = raw.match(/EV-[A-Z0-9-]{6,}/i);
  if (passCodeMatch) tokens.add(passCodeMatch[0].toUpperCase());
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const params = parsed.searchParams;
      ["code", "pass", "passCode", "qr", "id", "user", "userId", "token"].forEach((key) => {
        const value = params.get(key);
        if (value) tokens.add(value.trim());
      });
      parsed.pathname
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => tokens.add(part));
    } catch (_) {
      // ignore malformed URLs from third-party scanners
    }
  }
  return [...tokens].filter(Boolean);
}

function extractUserIdFromToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  if (UUID_V4_RE.test(raw)) return raw;
  const decoded = safeDecodeBase64ToText(raw);
  if (UUID_V4_RE.test(decoded)) return decoded;
  return null;
}

async function resolveEventRegistrationFromScanCode(eventId, rawCode) {
  const tokens = extractScanTokens(rawCode);
  if (!tokens.length) return null;

  for (const token of tokens) {
    const byEventPass = await pool.query(
      `SELECT er.*
         FROM event_registrations er
         JOIN event_passes ep ON ep.registration_id = er.id
        WHERE er.event_id = $1
          AND UPPER(ep.pass_code) = UPPER($2)
        LIMIT 1`,
      [eventId, token],
    );
    if (byEventPass.rows.length) {
      return { registration: byEventPass.rows[0], source: "event_pass" };
    }
  }

  for (const token of tokens) {
    if (!UUID_V4_RE.test(token)) continue;
    const byRegId = await pool.query(
      `SELECT *
         FROM event_registrations
        WHERE event_id = $1 AND id = $2
        LIMIT 1`,
      [eventId, token],
    );
    if (byRegId.rows.length) {
      return { registration: byRegId.rows[0], source: "registration_id" };
    }
  }

  for (const token of tokens) {
    const userId = extractUserIdFromToken(token);
    if (!userId) continue;
    const byUser = await pool.query(
      `SELECT *
         FROM event_registrations
        WHERE event_id = $1 AND user_id = $2 AND status != 'cancelled'
        ORDER BY CASE WHEN status = 'confirmed' THEN 0 WHEN status = 'pending' THEN 1 ELSE 2 END, created_at DESC
        LIMIT 1`,
      [eventId, userId],
    );
    if (byUser.rows.length) {
      return { registration: byUser.rows[0], source: "wallet_user_qr" };
    }
  }

  return null;
}

async function performEventCheckin({ eventId, registrationId, adminUserId, source = "manual" }) {
  const regRes = await pool.query(
    `SELECT *
       FROM event_registrations
      WHERE id = $1 AND event_id = $2
      LIMIT 1`,
    [registrationId, eventId],
  );
  if (!regRes.rows.length) {
    return { ok: false, code: "not_found", status: 404, message: "Inscripción no encontrada" };
  }
  const reg = regRes.rows[0];
  if (reg.status !== "confirmed") {
    return { ok: false, code: "not_confirmed", status: 409, message: "Solo puedes hacer check-in a inscripciones confirmadas", registration: reg };
  }
  if (reg.checked_in) {
    return { ok: true, alreadyCheckedIn: true, registration: reg, source };
  }

  const upd = await pool.query(
    `UPDATE event_registrations
        SET checked_in = true,
            checked_in_at = NOW(),
            checked_in_by = $1,
            updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [adminUserId, registrationId],
  );
  const updated = upd.rows[0];
  await markEventPassUsedByRegistration({ registrationId: updated.id }).catch(() => { });
  triggerWalletPassSync(updated.user_id, "event_checked_in");
  return { ok: true, alreadyCheckedIn: false, registration: updated, source };
}

// ── GET /api/events — Lista pública (solo published) ──────────────────────────
app.get("/api/events", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded?.sub || decoded?.userId || null;
      } catch { }
    }
    const { type, upcoming } = req.query;
    const conditions = ["e.status = 'published'"];
    const params = [];
    if (type) { conditions.push(`e.type = $${params.length + 1}`); params.push(type); }
    if (upcoming === "true") { conditions.push(`e.date >= CURRENT_DATE`); }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const rows = await pool.query(
      `SELECT * FROM events e ${where} ORDER BY e.date ASC, e.start_time ASC`,
      params
    );
    return res.json(rows.rows.map(mapEventRow));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── GET /api/events/admin/all — Todos los eventos con inscripciones ──────────
app.get("/api/events/admin/all", adminMiddleware, async (req, res) => {
  try {
    const evRows = await pool.query(
      `SELECT * FROM events ORDER BY date DESC, start_time DESC`
    );
    const regRows = await pool.query(
      `SELECT er.*, u.display_name,
              ep.id AS event_pass_id,
              ep.pass_code AS event_pass_code,
              ep.status AS event_pass_status,
              ep.issued_at AS event_pass_issued_at,
              ep.used_at AS event_pass_used_at
         FROM event_registrations er
       LEFT JOIN users u ON er.user_id = u.id
       LEFT JOIN event_passes ep ON ep.registration_id = er.id
       ORDER BY er.created_at ASC`
    );
    const regsByEvent = {};
    for (const r of regRows.rows) {
      if (!regsByEvent[r.event_id]) regsByEvent[r.event_id] = [];
      regsByEvent[r.event_id].push(mapRegRow(r));
    }
    const events = evRows.rows.map((e) => ({
      ...mapEventRow(e),
      registrations: regsByEvent[e.id] || [],
    }));
    return res.json(events);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── GET /api/events/:id — Detalle de evento ───────────────────────────────────
app.get("/api/events/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    let userId = null;
    let isAdmin = false;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded?.sub || decoded?.userId || null;
        isAdmin = decoded?.role === "admin" || decoded?.role === "super_admin";
      } catch { }
    }
    const evRes = await pool.query("SELECT * FROM events WHERE id = $1", [req.params.id]);
    if (!evRes.rows.length) return res.status(404).json({ message: "Evento no encontrado" });
    const ev = evRes.rows[0];
    if (!isAdmin && ev.status !== "published") return res.status(404).json({ message: "Evento no disponible" });
    const result = mapEventRow(ev);
    if (userId) {
      const regRes = await pool.query(
        `SELECT er.*,
                ep.id AS event_pass_id,
                ep.pass_code AS event_pass_code,
                ep.status AS event_pass_status,
                ep.issued_at AS event_pass_issued_at,
                ep.used_at AS event_pass_used_at
           FROM event_registrations er
           LEFT JOIN event_passes ep ON ep.registration_id = er.id
          WHERE er.event_id = $1 AND er.user_id = $2 AND er.status != 'cancelled'
          LIMIT 1`,
        [req.params.id, userId]
      );
      result.myRegistration = regRes.rows.length ? mapRegRow(regRes.rows[0]) : null;
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events — Crear evento ──────────────────────────────────────────
app.post("/api/events", adminMiddleware, async (req, res) => {
  try {
    const {
      type, title, description, instructor_name, instructor_photo,
      date, start_time, end_time, location, capacity = 12, price = 0,
      early_bird_price, early_bird_deadline, member_discount = 0,
      image, requirements = "", includes = [], tags = [],
      status = "draft",
    } = req.body;
    if (!type || !title || !description || !instructor_name || !date || !start_time || !end_time || !location) {
      return res.status(400).json({ message: "Faltan campos requeridos" });
    }
    const r = await pool.query(
      `INSERT INTO events (type, title, description, instructor_name, instructor_photo,
        date, start_time, end_time, location, capacity, price, early_bird_price,
        early_bird_deadline, member_discount, image, requirements, includes, tags,
        status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        type, title, description, instructor_name, instructor_photo || null,
        date, start_time, end_time, location, capacity, price,
        early_bird_price || null, early_bird_deadline || null, member_discount,
        image || null, requirements,
        JSON.stringify(Array.isArray(includes) ? includes.filter(Boolean) : []),
        JSON.stringify(Array.isArray(tags) ? tags.filter(Boolean) : []),
        status, req.userId,
      ]
    );
    return res.status(201).json(mapEventRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── PUT /api/events/:id — Actualizar evento ───────────────────────────────────
app.put("/api/events/:id", adminMiddleware, async (req, res) => {
  try {
    const allowed = [
      "type", "title", "description", "instructor_name", "instructor_photo",
      "date", "start_time", "end_time", "location", "capacity", "price",
      "early_bird_price", "early_bird_deadline", "member_discount", "image",
      "requirements", "includes", "tags", "status",
    ];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        vals.push(["includes", "tags"].includes(key) ? JSON.stringify(req.body[key]) : req.body[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ message: "Nada que actualizar" });
    vals.push(req.params.id);
    sets.push("updated_at = NOW()");
    const r = await pool.query(
      `UPDATE events SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ message: "Evento no encontrado" });
    return res.json(mapEventRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── DELETE /api/events/:id — Eliminar evento ──────────────────────────────────
app.delete("/api/events/:id", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM events WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Evento no encontrado" });
    return res.json({ message: "Evento eliminado" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events/:id/register — Inscribirse ───────────────────────────────
app.post("/api/events/:id/register", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { name, email, phone = "", payment_method } = req.body;
    if (!name || !email) return res.status(400).json({ message: "name y email son requeridos" });
    const evRes = await pool.query("SELECT * FROM events WHERE id = $1 AND status = 'published'", [req.params.id]);
    if (!evRes.rows.length) return res.status(404).json({ message: "Evento no disponible" });
    const ev = evRes.rows[0];

    // Check existing registration
    const existingRes = await pool.query(
      "SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 LIMIT 1",
      [req.params.id, userId]
    );
    const existing = existingRes.rows[0];
    if (existing && existing.status !== "cancelled") {
      return res.status(400).json({ message: "Ya estás inscrito en este evento" });
    }

    // Calculate price
    let amount = Number(ev.price);
    const now = new Date();
    if (ev.early_bird_price != null && ev.early_bird_deadline) {
      const deadline = new Date(ev.early_bird_deadline);
      if (now <= deadline) amount = Number(ev.early_bird_price);
    }
    if (Number(ev.member_discount) > 0) {
      const memRes = await pool.query(
        `SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' AND end_date >= CURRENT_DATE LIMIT 1`,
        [userId]
      );
      if (memRes.rows.length) {
        amount = Math.round(amount * (1 - Number(ev.member_discount) / 100));
      }
    }

    // Determine status
    const regCount = await pool.query(
      "SELECT COUNT(*) FROM event_registrations WHERE event_id = $1 AND status = 'confirmed'",
      [req.params.id]
    );
    const confirmedCount = Number(regCount.rows[0].count);
    let regStatus = "pending";
    let waitlistPosition = null;
    let paidAt = null;
    if (confirmedCount >= Number(ev.capacity)) {
      regStatus = "waitlist";
      const wlRes = await pool.query(
        "SELECT COALESCE(MAX(waitlist_position), 0) + 1 AS pos FROM event_registrations WHERE event_id = $1 AND status = 'waitlist'",
        [req.params.id]
      );
      waitlistPosition = wlRes.rows[0].pos;
    } else if (amount === 0) {
      regStatus = "confirmed";
      paidAt = new Date();
    }

    let reg;
    if (existing && existing.status === "cancelled") {
      const r = await pool.query(
        `UPDATE event_registrations SET name=$1, email=$2, phone=$3, status=$4, amount=$5,
         payment_method=$6, payment_reference=NULL, payment_proof_url=NULL,
         payment_proof_file_name=NULL, transfer_date=NULL,
         paid_at=$7, waitlist_position=$8, checked_in=false, checked_in_at=NULL, updated_at=NOW()
         WHERE id=$9 RETURNING *`,
        [name, email, phone, regStatus, amount, payment_method || null, paidAt, waitlistPosition, existing.id]
      );
      reg = r.rows[0];
    } else {
      const r = await pool.query(
        `INSERT INTO event_registrations (event_id, user_id, name, email, phone, status, amount, payment_method, paid_at, waitlist_position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.params.id, userId, name, email, phone, regStatus, amount, payment_method || null, paidAt, waitlistPosition]
      );
      reg = r.rows[0];
    }

    // Update registered count if confirmed
    if (regStatus === "confirmed") {
      await pool.query(
        "UPDATE events SET registered = (SELECT COUNT(*) FROM event_registrations WHERE event_id=$1 AND status='confirmed') WHERE id=$1",
        [req.params.id]
      );
    }

    let issuedPass = null;
    if (regStatus === "confirmed" && reg.user_id) {
      issuedPass = await ensureEventPassForRegistration({
        eventId: req.params.id,
        registrationId: reg.id,
        userId: reg.user_id,
      }).catch((passErr) => {
        console.error("[Events] pass issue on register:", passErr?.message || passErr);
        return null;
      });
    } else {
      await cancelEventPassByRegistration({ registrationId: reg.id }).catch(() => { });
    }

    let message;
    if (regStatus === "waitlist") message = `Te agregamos a la lista de espera (posición ${waitlistPosition})`;
    else if (amount === 0) message = "¡Registro confirmado! Te esperamos en el evento.";
    else if (payment_method === "cash") message = "Registro pendiente. Puedes pagar en recepción del studio para confirmar tu lugar.";
    else message = "Registro pendiente de pago. Una vez confirmado tu pago, recibirás la confirmación.";

    return res.status(201).json({
      id: reg.id,
      status: reg.status,
      amount: Number(reg.amount),
      isFree: amount === 0,
      waitlistPosition,
      passCode: issuedPass?.pass_code ?? null,
      message,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── DELETE /api/events/:id/register — Cancelar inscripción ───────────────────
app.delete("/api/events/:id/register", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const regRes = await pool.query(
      "SELECT * FROM event_registrations WHERE event_id=$1 AND user_id=$2 LIMIT 1",
      [req.params.id, userId]
    );
    if (!regRes.rows.length) return res.status(404).json({ message: "No tienes inscripción en este evento" });
    const reg = regRes.rows[0];
    if (!["confirmed", "pending", "waitlist"].includes(reg.status)) {
      return res.status(400).json({ message: "No puedes cancelar este registro" });
    }
    await pool.query(
      "UPDATE event_registrations SET status='cancelled', updated_at=NOW() WHERE id=$1",
      [reg.id]
    );
    await cancelEventPassByRegistration({ registrationId: reg.id }).catch(() => { });
    await pool.query(
      "UPDATE events SET registered = GREATEST(0, (SELECT COUNT(*) FROM event_registrations WHERE event_id=$1 AND status='confirmed')) WHERE id=$1",
      [req.params.id]
    );
    return res.json({ message: "Registro cancelado exitosamente" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── GET /api/events/:id/registrations — Inscripciones admin ──────────────────
app.get("/api/events/:id/registrations", adminMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT er.*, u.display_name,
              ep.id AS event_pass_id,
              ep.pass_code AS event_pass_code,
              ep.status AS event_pass_status,
              ep.issued_at AS event_pass_issued_at,
              ep.used_at AS event_pass_used_at
         FROM event_registrations er
       LEFT JOIN users u ON er.user_id = u.id
       LEFT JOIN event_passes ep ON ep.registration_id = er.id
       WHERE er.event_id = $1 ORDER BY er.created_at ASC`,
      [req.params.id]
    );
    return res.json(rows.rows.map(mapRegRow));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── PUT /api/events/:eventId/registrations/:regId — Actualizar status ─────────
app.put("/api/events/:eventId/registrations/:regId", adminMiddleware, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const valid = ["confirmed", "pending", "waitlist", "cancelled", "no_show"];
    if (status && !valid.includes(status)) {
      return res.status(400).json({ message: "Status inválido" });
    }
    const sets = ["updated_at=NOW()"];
    const vals = [];
    if (status) {
      vals.push(status);
      sets.push(`status=$${vals.length}`);
      if (status === "confirmed") {
        sets.push("paid_at = COALESCE(paid_at, NOW())");
      }
    }
    if (notes !== undefined) {
      vals.push(notes);
      sets.push(`notes=$${vals.length}`);
    }
    vals.push(req.params.regId);
    const r = await pool.query(
      `UPDATE event_registrations SET ${sets.join(",")} WHERE id=$${vals.length} AND event_id=$${vals.length + 1} RETURNING *`,
      [...vals, req.params.eventId]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Inscripción no encontrada" });
    // Refresh registered count
    await pool.query(
      "UPDATE events SET registered = (SELECT COUNT(*) FROM event_registrations WHERE event_id=$1 AND status='confirmed') WHERE id=$1",
      [req.params.eventId]
    );
    const updatedReg = r.rows[0];
    if (updatedReg.status === "confirmed" && updatedReg.user_id) {
      await ensureEventPassForRegistration({
        eventId: req.params.eventId,
        registrationId: updatedReg.id,
        userId: updatedReg.user_id,
      }).catch((passErr) => {
        console.error("[Events] pass issue on admin status update:", passErr?.message || passErr);
      });
    } else if (["cancelled", "no_show", "waitlist", "pending"].includes(updatedReg.status)) {
      await cancelEventPassByRegistration({ registrationId: updatedReg.id }).catch(() => { });
    }
    return res.json({ message: "Inscripción actualizada", status: r.rows[0].status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events/:eventId/checkin/:regId — Check-in ───────────────────────
app.post("/api/events/:eventId/checkin/:regId", adminMiddleware, async (req, res) => {
  try {
    const result = await performEventCheckin({
      eventId: req.params.eventId,
      registrationId: req.params.regId,
      adminUserId: req.userId,
      source: "manual",
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.message || "No se pudo registrar el check-in" });
    }
    return res.json({
      message: result.alreadyCheckedIn ? "Esta inscripción ya tenía check-in" : "Check-in exitoso",
      checkedIn: true,
      alreadyCheckedIn: result.alreadyCheckedIn,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events/:eventId/checkin/scan — Check-in por QR/código ─────────
app.post("/api/events/:eventId/checkin/scan", adminMiddleware, async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ message: "Debes enviar un código QR para validar" });
    }

    const resolved = await resolveEventRegistrationFromScanCode(req.params.eventId, code);
    if (!resolved?.registration?.id) {
      return res.status(404).json({ message: "No se encontró una inscripción válida para este QR en el evento" });
    }

    const result = await performEventCheckin({
      eventId: req.params.eventId,
      registrationId: resolved.registration.id,
      adminUserId: req.userId,
      source: resolved.source,
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.message || "No se pudo registrar el check-in" });
    }

    return res.json({
      message: result.alreadyCheckedIn ? "La clienta ya tenía check-in registrado" : "Check-in exitoso",
      data: {
        registrationId: result.registration.id,
        name: result.registration.name,
        email: result.registration.email,
        alreadyCheckedIn: !!result.alreadyCheckedIn,
        source: resolved.source,
      },
    });
  } catch (err) {
    console.error("[Events] scan check-in error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── PUT /api/events/:id/register/payment — Enviar comprobante ─────────────────
app.put("/api/events/:id/register/payment", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { payment_method, transfer_reference, transfer_date, file_data, file_name, notes } = req.body;

    const regRes = await pool.query(
      "SELECT * FROM event_registrations WHERE event_id=$1 AND user_id=$2 AND status='pending' LIMIT 1",
      [req.params.id, userId]
    );
    if (!regRes.rows.length)
      return res.status(404).json({ message: "No tienes una inscripción pendiente en este evento" });
    const reg = regRes.rows[0];

    if (payment_method === "transfer" && !transfer_reference && !file_data) {
      return res.status(400).json({ message: "Debes proporcionar una referencia o comprobante de transferencia" });
    }

    let r;
    if (payment_method === "cash") {
      r = await pool.query(
        `UPDATE event_registrations
         SET payment_method='cash',
             payment_reference=NULL,
             payment_proof_url=NULL,
             payment_proof_file_name=NULL,
             transfer_date=NULL,
             updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [reg.id]
      );
    } else {
      r = await pool.query(
        `UPDATE event_registrations
         SET payment_method='transfer',
             payment_reference=$1,
             transfer_date=$2,
             payment_proof_url=$3,
             payment_proof_file_name=$4,
             updated_at=NOW()
         WHERE id=$5 RETURNING *`,
        [transfer_reference || null, transfer_date || null, file_data || null, file_name || null, reg.id]
      );
    }

    return res.json({
      message: payment_method === "cash"
        ? "Seleccionado pago en studio. El admin confirmará tu lugar cuando pagues en recepción."
        : "Comprobante enviado exitosamente. Tu pago será verificado pronto.",
      registration: {
        id: r.rows[0].id,
        status: r.rows[0].status,
        paymentReference: r.rows[0].payment_reference,
        hasPaymentProof: !!r.rows[0].payment_proof_url,
      },
    });
  } catch (err) {
    console.error("PUT events/register/payment error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Email test endpoint (admin only) ─────────────────────────────────────────
app.post("/api/admin/test-emails", adminMiddleware, async (req, res) => {
  const testTo = req.body.to || "saidromero19@gmail.com";
  const testName = "Said (Test)";
  const results = [];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const jobs = [
    { label: "Membresía activada", fn: () => sendMembershipActivated({ to: testTo, name: testName, planName: "4 Clases", startDate: new Date().toISOString(), endDate: new Date(Date.now() + 30 * 86400000).toISOString(), classLimit: 4 }) },
    { label: "Reserva confirmada", fn: () => sendBookingConfirmed({ to: testTo, name: testName, className: "Pilates Matt Clásico", date: new Date().toISOString(), startTime: "09:00", instructor: "Instructora Angelina", classesLeft: 3, isWaitlist: false }) },
    { label: "Reserva cancelada (a tiempo)", fn: () => sendBookingCancelled({ to: testTo, name: testName, className: "Flex & Flow", date: new Date().toISOString(), startTime: "11:00", creditRestored: true, isLate: false, classesLeft: 4 }) },
    { label: "Reserva cancelada (tardía)", fn: () => sendBookingCancelled({ to: testTo, name: testName, className: "Body Strong", date: new Date().toISOString(), startTime: "18:00", creditRestored: false, isLate: true, classesLeft: 3 }) },
    { label: "Recordatorio semanal", fn: () => sendWeeklyReminder({ to: testTo, name: testName, classesLeft: 2, endDate: new Date(Date.now() + 15 * 86400000).toISOString() }) },
    { label: "Renovación (última clase)", fn: () => sendRenewalReminder({ to: testTo, name: testName, planName: "4 Clases", classesLeft: 1, endDate: new Date(Date.now() + 5 * 86400000).toISOString(), reason: "last_class" }) },
    { label: "Renovación (por vencer)", fn: () => sendRenewalReminder({ to: testTo, name: testName, planName: "Mensual Ilimitado", classesLeft: null, endDate: new Date(Date.now() + 3 * 86400000).toISOString(), reason: "expiring_soon" }) },
    { label: "Reset de contraseña", fn: () => sendPasswordResetEmail({ to: testTo, name: testName, token: "test-token-123456" }) },
  ];

  // Send one at a time with 700ms delay to respect Resend's 2 req/s limit
  for (const job of jobs) {
    try {
      await job.fn();
      results.push(`✅ ${job.label}`);
    } catch (e) {
      results.push(`❌ ${job.label}: ${e.message}`);
    }
    await delay(700);
  }

  const hasResendKey = !!process.env.RESEND_API_KEY;
  return res.json({
    message: hasResendKey
      ? `Se enviaron ${results.filter(r => r.startsWith("✅")).length} emails de prueba a ${testTo}`
      : "⚠️ RESEND_API_KEY no está configurada. Los emails NO se enviaron.",
    resendKeySet: hasResendKey,
    fromEmail: process.env.EMAIL_FROM || "onboarding@resend.dev (default)",
    results,
  });
});

// ─── Serve React SPA (static) ────────────────────────────────────────────────
// Monorepo VARRE24: el build del frontend vive en frontend/dist (este archivo
// está en backend/server/index.js → __dirname/../../frontend/dist). Se evalúan
// candidatos para soportar distintos cwd/layouts de deploy.
const distDir = [
  process.env.FRONTEND_DIST,
  path.join(__dirname, "../../frontend/dist"),
  path.join(__dirname, "../dist"),
  path.join(process.cwd(), "frontend/dist"),
  path.join(process.cwd(), "dist"),
].filter(Boolean).find((dir) => {
  try { return fs.existsSync(path.join(dir, "index.html")); } catch { return false; }
}) || path.join(__dirname, "../../frontend/dist");
console.log("[SPA] Serving frontend build from:", distDir);
app.use(express.static(distDir, {
  setHeaders: (res, path) => {
    if (path.endsWith(".css")) {
      res.setHeader("Content-Type", "text/css");
    } else if (path.endsWith(".js")) {
      res.setHeader("Content-Type", "application/javascript");
    }
  }
}));

app.get("*", (_req, res, next) => {
  if (_req.path.startsWith("/api")) return next();
  // Si la request es a un asset hasheado (CSS/JS/img/font) y no se encontró
  // en dist/, NO devolver index.html — el browser lo rechaza con MIME error.
  // Pasa cuando el usuario tiene una página vieja en cache que referencia un
  // hash que ya no existe en este deploy. Mejor devolver 404 limpio para
  // que el browser lance el recovery / el usuario haga hard refresh.
  if (_req.path.startsWith("/assets/") ||
      /\.(css|js|map|woff2?|ttf|otf|eot|png|jpg|jpeg|webp|gif|svg|ico)$/i.test(_req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  res.sendFile(path.join(distDir, "index.html"));
});

/**
 * Runs every Sunday at 8:00 AM Mexico City time (UTC-6 = 14:00 UTC).
 * Sends weekly reminder to all users with an active membership.
 */
async function runWeeklyReminderCron() {
  try {
    const res = await pool.query(`
      SELECT u.email, COALESCE(u.display_name, 'Alumna') AS name,
             m.classes_remaining, m.end_date
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
    `);
    console.log(`[Cron] Weekly reminder — ${res.rows.length} members`);
    for (const row of res.rows) {
      await sendWeeklyReminder({
        to: row.email,
        name: row.name,
        classesLeft: row.classes_remaining,
        endDate: row.end_date,
      }).catch((e) => console.error("[Email] weekly cron:", e.message));
      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("[Cron] Weekly reminder error:", err.message);
  }
}

/**
 * Runs every day at 9:00 AM.
 * Sends renewal reminder to members with 1 class left OR expiring in ≤7 days.
 */
// Marca como 'checked_in' todas las reservas confirmadas cuya clase ya terminó
// (start + duración <= ahora, zona MX). Idempotente: sólo afecta rows con
// status='confirmed'. No toca crédito (ya se descontó al reservar).
// Se desactiva con AUTO_CHECKIN_ENABLED=false.
async function runAutoCheckin() {
  if (process.env.AUTO_CHECKIN_ENABLED === "false") return { updated: 0, skipped: true };
  try {
    const r = await pool.query(`
      UPDATE bookings b
         SET status         = 'checked_in',
             checkin_method = 'auto',
             checked_in_at  = NOW(),
             checked_in_by  = NULL
        FROM classes c
        LEFT JOIN class_types ct ON c.class_type_id = ct.id
       WHERE b.class_id = c.id
         AND b.status = 'confirmed'
         AND (c.date + c.start_time::time) AT TIME ZONE 'America/Mexico_City'
             + (COALESCE(ct.duration_min, 50)::text || ' minutes')::interval
           <= NOW()
    `);
    if (r.rowCount > 0) {
      console.log(`[auto-checkin] marked ${r.rowCount} bookings as checked_in`);
    }
    return { updated: r.rowCount, skipped: false };
  } catch (err) {
    console.error("[auto-checkin] error:", err.message);
    return { updated: 0, error: err.message };
  }
}

// ── Cobro por transferencia (Grupo B): auto-aprobar al subir comprobante ──
// Replica la lógica del verify del admin (membresía, crédito de referido,
// complemento, cupón, lealtad, notif), pero deja verified_at=NULL y
// auto_approval_expires_at = NOW() + 24h. El cron runAutoRevertCron
// revisa estas órdenes provisionales.
async function autoApproveTransferOrder(order) {
  const client = await pool.connect();
  let plan = null;
  let membershipId = null;
  let justApproved = false;
  try {
    await client.query("BEGIN");

    const fresh = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [order.id]);
    if (!fresh.rows.length) { await client.query("ROLLBACK"); return; }
    const o = fresh.rows[0];
    if (o.status === "approved") { await client.query("ROLLBACK"); return; }   // idempotente

    if (o.plan_id) {
      plan = (await client.query("SELECT * FROM plans WHERE id=$1", [o.plan_id])).rows[0] || null;
    }

    const expires = new Date(Date.now() + 24 * 3_600 * 1000);
    await client.query(
      `UPDATE orders SET
          status = 'approved',
          approved_at = NOW(),
          paid_at = COALESCE(paid_at, NOW()),
          auto_approved_at = NOW(),
          auto_approval_expires_at = $2,
          updated_at = NOW()
        WHERE id = $1`,
      [o.id, expires]
    );
    justApproved = true;

    // Membresía
    if (o.plan_id && plan && o.user_id) {
      const todayStr = new Date().toISOString().slice(0,10);
      const endStr = calcMembershipEndDate(todayStr, plan);
      const existing = await client.query("SELECT id FROM memberships WHERE order_id=$1", [o.id]);
      if (existing.rows.length) {
        membershipId = existing.rows[0].id;
        await client.query("UPDATE memberships SET status='active' WHERE id=$1", [membershipId]);
      } else {
        await client.query(
          `UPDATE orders SET status='cancelled',
                  notes=COALESCE(notes,'')||' [auto-cancelada: otra orden del mismo plan se aprobó]'
            WHERE user_id=$1 AND plan_id=$2 AND id!=$3
              AND status IN ('pending_payment','pending_verification')`,
          [o.user_id, o.plan_id, o.id]
        );
        const m = await client.query(
          `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, order_id)
           VALUES ($1,$2,'active',$3,$4,$5,$6,$7) RETURNING id`,
          [o.user_id, o.plan_id, o.payment_method || "transfer", todayStr, endStr,
           plan.class_limit === 0 ? null : (plan.class_limit ?? null), o.id]
        );
        membershipId = m.rows[0].id;
      }
    }

    // Complemento + cupón
    if (o.complement_type) {
      const compInfo = COMPLEMENT_MAP[o.complement_type] || null;
      if (compInfo) {
        try {
          await client.query(
            `INSERT INTO consultations (membership_id, user_id, complement_type, complement_name, specialist, status)
             VALUES ($1,$2,$3,$4,$5,'pending')`,
            [membershipId, o.user_id, o.complement_type, compInfo.name, compInfo.specialist]
          );
        } catch (e) { console.error("[auto-approve consultations]", e.message); }
      }
    }
    if (o.discount_code_id) await incrementDiscountUsage(o.discount_code_id, client);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(()=>{});
    console.error("autoApproveTransferOrder tx error:", err.message);
    throw err;
  } finally {
    client.release();
  }

  // ── Side effects post-commit ──
  if (justApproved) {
    // Email/WA a la alumna
    try {
      const u = await pool.query("SELECT email, display_name, phone FROM users WHERE id=$1", [order.user_id]);
      if (u.rows[0] && plan) {
        const startStr = new Date().toISOString().slice(0,10);
        const endStr = calcMembershipEndDate(startStr, plan);
        if (await areEmailNotificationsEnabled().catch(()=>false)) {
          sendMembershipActivated({
            to: u.rows[0].email, name: u.rows[0].display_name || "Alumna",
            planName: plan.name, startDate: startStr, endDate: endStr,
            classLimit: plan.class_limit ?? null,
          }).catch((e)=>console.error("[Email auto-approve]", e.message));
        }
        if (u.rows[0].phone) {
          sendConfiguredWhatsAppTemplate({
            templateKey: "membership_activated",
            phone: u.rows[0].phone,
            vars: { name: u.rows[0].display_name || "Alumna", plan: plan.name, startDate: startStr, endDate: endStr },
            fallbackMessage: `Hola ${u.rows[0].display_name || "Alumna"}, recibimos tu comprobante y tu membresía ${plan.name} ya está activa. Estaremos verificando el pago en las próximas 24h.`,
          }).catch((e)=>console.error("[WA auto-approve]", e.message));
        }
      }
    } catch (_e) {}

    // Notif admin (env var + admins en DB, dedup)
    try {
      const envList = String(process.env.ADMIN_NOTIFY_EMAILS || "")
        .split(",").map((s) => s.trim()).filter(Boolean);
      const dbAdmins = await pool.query(
        "SELECT email FROM users WHERE role IN ('admin','super_admin') AND email IS NOT NULL"
      ).catch(() => ({ rows: [] }));
      const recipients = Array.from(new Set([
        ...envList,
        ...dbAdmins.rows.map((r) => r.email),
      ].map((e) => e.toLowerCase()))).slice(0, 10);
      for (const to of recipients) {
        sendAdminNewOrderToVerify({
          to,
          orderNumber: order.order_number,
          orderId: order.id,
          planName: plan?.name || "Plan",
          alumnaName: order.user_name || "Alumna",
          amount: order.total_amount,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        }).catch(()=>{});
      }
    } catch (_e) {}

    // Lealtad
    if (Number(order.total_amount) > 0) {
      try {
        const cfg = (await pool.query("SELECT value FROM settings WHERE key='loyalty_config'")).rows[0]?.value || {};
        const pts = Math.floor(Number(order.total_amount) * (cfg.points_per_peso ?? 1));
        if (cfg.enabled !== false && pts > 0) {
          await pool.query("INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1,'earn',$2,$3)",
            [order.user_id, pts, `Auto-aprobación transferencia — $${order.total_amount}`]);
        }
      } catch (_e) {}
    }
    if (order.user_id) triggerWalletPassSync(order.user_id, "transfer_auto_approved");
  }
}

async function runRenewalReminderCron() {
  try {
    // Renovación: SOLO cuando realmente le queda 1 clase sin tomar
    // (classes_remaining se decrementa al reservar, así que =1 garantiza que no está reservada/tomada).
    // Para planes ilimitados (classes_remaining NULL) avisamos si vence en ≤7 días.
    const res = await pool.query(`
      SELECT u.email, u.phone, COALESCE(u.display_name, 'Alumna') AS name,
             m.classes_remaining, m.end_date,
             COALESCE(p.name, m.plan_name_override, 'Tu membresía') AS plan_name
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
        AND (
          m.classes_remaining = 1
          OR (
            m.classes_remaining IS NULL
            AND m.end_date IS NOT NULL
            AND m.end_date <= CURRENT_DATE + INTERVAL '7 days'
          )
        )
    `);
    console.log(`[Cron] Renewal reminder — ${res.rows.length} members`);
    for (const row of res.rows) {
      const reason = row.classes_remaining === 1 ? "last_class" : "expiring_soon";
      await sendRenewalReminder({
        to: row.email,
        name: row.name,
        planName: row.plan_name,
        classesLeft: row.classes_remaining,
        endDate: row.end_date,
        reason,
      }).catch((e) => console.error("[Email] renewal cron:", e.message));
      // WhatsApp renewal reminder
      sendConfiguredWhatsAppTemplate({
        templateKey: "renewal_reminder",
        phone: row.phone,
        vars: {
          name: row.name,
          plan: row.plan_name,
          expiresAt: row.end_date ? new Date(row.end_date).toLocaleDateString("es-MX") : "",
          classesRemaining: row.classes_remaining ?? "",
        },
        fallbackMessage: row.classes_remaining === 1
          ? `Hola ${row.name}, te queda 1 clase en tu plan ${row.plan_name}. ¡Renueva para seguir entrenando!`
          : `Hola ${row.name}, tu plan ${row.plan_name} está por vencer. ¡Renueva pronto!`,
      }).catch((e) => console.error("[WA] renewal cron:", e.message));
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("[Cron] Renewal reminder error:", err.message);
  }
}

/**
 * Two-shot daily WhatsApp reminder strategy:
 *
 *   9:00 PM  →  "morning" mode  — reminds for tomorrow's classes that start before noon
 *   8:00 AM  →  "afternoon" mode — reminds for today's classes that start at noon or later
 *
 * Every message is staggered 3 minutes apart to avoid Evolution API rate-limits.
 * A booking is only ever reminded once (tracked in whatsapp_reminders_sent).
 */
const CLASS_REMINDER_STAGGER_MS = 3 * 60 * 1000; // 3 min between each WhatsApp

async function runClassReminderCron(mode = "morning") {
  try {
    const notificationSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
    if (notificationSettings?.whatsapp_reminders === false) {
      console.log(`[Cron] Class reminder (${mode}) — WhatsApp disabled, skipping`);
      return;
    }

    // morning  → tomorrow's classes that start before 12:00
    // afternoon → today's classes that start at 12:00 or later
    // EXTRACT(EPOCH FROM start_time) works for both TIME and INTERVAL column types.
    const targetDate = mode === "morning"
      ? `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date + 1`
      : `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date`;
    const timeFilter = mode === "morning"
      ? `EXTRACT(EPOCH FROM c.start_time) < 43200`
      : `EXTRACT(EPOCH FROM c.start_time) >= 43200`;
    const dayLabel = mode === "morning" ? "mañana" : "hoy";

    const res = await pool.query(`
      SELECT b.id AS booking_id, b.user_id,
             u.phone, COALESCE(u.display_name, 'Alumna') AS name,
             u.receive_reminders,
             ct.name AS class_name,
             c.date, c.start_time
      FROM bookings b
      JOIN classes c ON b.class_id = c.id
      JOIN class_types ct ON c.class_type_id = ct.id
      JOIN users u ON b.user_id = u.id
      WHERE b.status = 'confirmed'
        AND b.checked_in_at IS NULL
        AND c.status = 'scheduled'
        AND c.date = ${targetDate}
        AND ${timeFilter}
        AND ((c.date + c.start_time) AT TIME ZONE 'America/Mexico_City')
            > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')
        AND u.phone IS NOT NULL
        AND u.receive_reminders IS NOT FALSE
      ORDER BY c.start_time ASC, b.created_at ASC
    `);

    if (!res.rows.length) {
      console.log(`[Cron] Class reminder (${mode}) — no classes found`);
      return;
    }

    // Ensure dedup tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_reminders_sent (
        booking_id UUID PRIMARY KEY,
        sent_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => {});

    // Filter out already-sent bookings
    const bookingIds = res.rows.map((r) => r.booking_id);
    const sentRes = await pool.query(
      `SELECT booking_id FROM whatsapp_reminders_sent WHERE booking_id = ANY($1)`,
      [bookingIds]
    ).catch(() => ({ rows: [] }));
    const alreadySent = new Set(sentRes.rows.map((r) => r.booking_id));

    const pending = res.rows.filter((r) => !alreadySent.has(r.booking_id));
    if (!pending.length) {
      console.log(`[Cron] Class reminder (${mode}) — all already sent`);
      return;
    }

    console.log(`[Cron] Class reminder (${mode}) — sending ${pending.length} reminders, staggered every 3 min`);

    let totalSent = 0;
    for (let i = 0; i < pending.length; i++) {
      const row = pending[i];

      // Wait before each subsequent message
      if (i > 0) await sleep(CLASS_REMINDER_STAGGER_MS);

      const timeKey = String(row.start_time).slice(0, 5);
      const dateStr = row.date ? new Date(row.date).toLocaleDateString("es-MX") : "";

      await sendConfiguredWhatsAppTemplate({
        templateKey: "class_reminder",
        phone: row.phone,
        vars: {
          name: row.name,
          class: row.class_name,
          date: dateStr,
          time: timeKey,
        },
        fallbackMessage: `Hola ${row.name}, te recordamos tu clase de ${row.class_name} ${dayLabel} a las ${timeKey}. ¡Te esperamos!`,
      }).catch((e) => console.error("[WA] class reminder:", e.message));

      await pool.query(
        `INSERT INTO whatsapp_reminders_sent (booking_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [row.booking_id]
      ).catch(() => {});

      totalSent++;
    }

    // Cleanup records older than 3 days
    await pool.query(
      `DELETE FROM whatsapp_reminders_sent WHERE sent_date < CURRENT_DATE - INTERVAL '3 days'`
    ).catch(() => {});

    console.log(`[Cron] Class reminder (${mode}) — ${totalSent} WhatsApp reminders sent`);
  } catch (err) {
    console.error(`[Cron] Class reminder (${mode}) error:`, err.message);
  }
}

function scheduleAutoCheckinCron() {
  if (process.env.AUTO_CHECKIN_ENABLED === "false") {
    console.log("[auto-checkin] disabled via AUTO_CHECKIN_ENABLED=false");
    return;
  }
  // Catch-up al arrancar y luego cada 10 min
  runAutoCheckin().catch(() => {});
  setInterval(() => { runAutoCheckin().catch(() => {}); }, 10 * 60 * 1000);
  console.log("[auto-checkin] scheduled every 10 minutes");
}

// ── Cron Grupo B: revertir órdenes provisionales no revisadas en 24h ──
async function runAutoRevertCron() {
  if (process.env.AUTO_REVERT_ENABLED === "false") return { skipped: true };
  try {
    const due = await pool.query(`
      SELECT o.id, o.user_id, o.plan_id, o.total_amount, o.order_number,
             EXISTS (
               SELECT 1 FROM bookings b
                 JOIN memberships m ON b.membership_id = m.id
                WHERE m.order_id = o.id AND b.status = 'checked_in'
             ) AS used_classes,
             p.name AS plan_name
        FROM orders o
        LEFT JOIN plans p ON o.plan_id = p.id
       WHERE o.status = 'approved'
         AND o.auto_approval_expires_at IS NOT NULL
         AND o.auto_approval_expires_at < NOW()
    `);
    for (const o of due.rows) {
      if (o.used_classes) {
        await pool.query(
          `UPDATE orders SET auto_approval_expires_at=NULL, verified_at=NOW(),
                  admin_notes = COALESCE(admin_notes,'')||' [auto-aceptada: alumna ya usó clases]',
                  updated_at=NOW()
            WHERE id=$1`,
          [o.id]
        );
        console.log(`[auto-revert] order ${o.order_number || o.id} auto-aceptada (alumna ya usó clases)`);
      } else {
        const reason = "Tu pago no fue confirmado a tiempo por el equipo. Si ya pagaste, contacta al estudio para que validemos el comprobante.";
        await pool.query(
          `UPDATE orders SET status='rejected', rejected_at=NOW(),
                  auto_approval_expires_at=NULL, auto_reverted_at=NOW(),
                  rejection_reason=$2, updated_at=NOW()
            WHERE id=$1`,
          [o.id, reason]
        );
        await pool.query(
          `UPDATE memberships SET status='cancelled', updated_at=NOW() WHERE order_id=$1 AND status='active'`,
          [o.id]
        ).catch(()=>{});
        try {
          const u = await pool.query("SELECT email, display_name FROM users WHERE id=$1", [o.user_id]);
          if (u.rows[0] && await areEmailNotificationsEnabled().catch(()=>false)) {
            sendOrderRejected({ to: u.rows[0].email, name: u.rows[0].display_name || "Alumna", reason }).catch(()=>{});
          }
        } catch (_e) {}
        if (o.user_id) triggerWalletPassSync(o.user_id, "transfer_auto_reverted");
        console.log(`[auto-revert] order ${o.order_number || o.id} revertida (24h sin revisión)`);
      }
    }
    return { processed: due.rowCount };
  } catch (err) {
    console.error("[auto-revert] error:", err.message);
    return { error: err.message };
  }
}

function scheduleAutoRevertCron() {
  if (process.env.AUTO_REVERT_ENABLED === "false") {
    console.log("[auto-revert] disabled via AUTO_REVERT_ENABLED=false");
    return;
  }
  runAutoRevertCron().catch(()=>{});
  setInterval(() => { runAutoRevertCron().catch(()=>{}); }, 60 * 60 * 1000);
  console.log("[auto-revert] scheduled every 60 minutes");
}

// Marca como 'expired' las membresías 'active' que ya no son usables:
//  (a) vencidas por fecha (end_date < hoy), o
//  (b) sin créditos (classes_remaining <= 0) Y sin reservas futuras pendientes.
// Evita que una alumna acumule varias "Activas" (una con créditos y una vacía/
// vencida) — confunde y ensucia el dashboard. NO toca las que tienen 0 créditos
// pero con reservas futuras (el paquete está totalmente asignado).
async function reconcileExpiredMemberships() {
  try {
    // Fecha "hoy" en hora de México (el server corre en UTC). Con CURRENT_DATE
    // una membresía que vence hoy se expiraba ~6h antes (tras las 6pm MX).
    const r = await pool.query(`
      WITH today AS (SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date AS d)
      UPDATE memberships m
         SET status = 'expired', updated_at = NOW()
       WHERE m.status = 'active'
         AND (
           (m.end_date IS NOT NULL AND m.end_date < (SELECT d FROM today))
           OR (
             m.classes_remaining IS NOT NULL
             AND m.classes_remaining < 9999
             AND m.classes_remaining <= 0
             AND NOT EXISTS (
               SELECT 1 FROM bookings b
                 JOIN classes c ON c.id = b.class_id
                WHERE b.membership_id = m.id
                  AND b.status IN ('confirmed','waitlist')
                  AND c.date >= (SELECT d FROM today)
             )
           )
         )
       RETURNING m.id`);
    if (r.rowCount) console.log(`[membership-expiry] ${r.rowCount} membresías marcadas como expiradas`);
    return r.rowCount;
  } catch (err) {
    console.error("[membership-expiry]", err.message);
    return 0;
  }
}

function scheduleMembershipExpiryCron() {
  reconcileExpiredMemberships().catch(() => {});
  setInterval(() => { reconcileExpiredMemberships().catch(() => {}); }, 60 * 60 * 1000);
  console.log("[membership-expiry] scheduled every 60 minutes");
}

function scheduleEmailCrons() {
  // Check every hour if it's time to run
  setInterval(async () => {
    const now = new Date();
    // Mexico City = UTC-6 (adjust for daylight saving if needed)
    const mexicoHour = (now.getUTCHours() - 6 + 24) % 24;
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday

    // Weekly reminder: every Sunday at 8:00 AM Mexico time
    if (dayOfWeek === 0 && mexicoHour === 8 && now.getUTCMinutes() < 60) {
      console.log("[Cron] Triggering weekly reminder...");
      runWeeklyReminderCron();
    }

    // Renewal reminder: every day at 9:00 AM Mexico time
    if (mexicoHour === 9 && now.getUTCMinutes() < 60) {
      console.log("[Cron] Triggering renewal reminder...");
      runRenewalReminderCron();
    }

    // Morning class reminder: every day at 9:00 PM Mexico time
    // Sends for tomorrow's morning classes (before noon) — staggered 3 min each
    if (mexicoHour === 21 && now.getUTCMinutes() < 60) {
      console.log("[Cron] Triggering morning class reminders (tomorrow AM)...");
      runClassReminderCron("morning");
    }

    // Afternoon class reminder: every day at 8:00 AM Mexico time
    // Sends for today's afternoon/evening classes (noon+) — staggered 3 min each
    if (mexicoHour === 8 && now.getUTCMinutes() < 60) {
      console.log("[Cron] Triggering afternoon class reminders (today PM)...");
      runClassReminderCron("afternoon");
    }
  }, 60 * 60 * 1000); // every 1 hour
}

// ─── Start ───────────────────────────────────────────────────────────────────
async function bootServer() {
  await ensureSchema();
  scheduleEmailCrons();
  scheduleAutoCheckinCron();
  scheduleAutoRevertCron();
  scheduleMembershipExpiryCron();
  // Initialize Google Wallet loyalty class if configured
  ensureGoogleWalletClass().catch(() => { });
  app.listen(PORT, () => {
    console.log(`🚀 VARRE24 API + Frontend → http://localhost:${PORT}`);
  });
}

bootServer().catch((err) => {
  console.error("❌ Fatal startup error:", err.message);
  process.exit(1);
});
