import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STUDIO_TIME_ZONE = "America/Mexico_City";

/**
 * Hora civil actual del estudio. Las clases se guardan como fecha + hora de
 * CDMX; este Date conserva esas partes locales para cálculos de calendario y
 * comparaciones, aunque la alumna abra la app desde otra zona horaria.
 */
export function studioNow(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(value("year"), value("month") - 1, value("day"), value("hour") % 24, value("minute"), value("second"));
}

export function studioTodayKey(): string {
  const d = studioNow();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

/** Formatea un DATE (YYYY-MM-DD) como fecha civil de CDMX, sin desfase UTC. */
export function formatStudioDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (!value) return "";
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00Z`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { timeZone: STUDIO_TIME_ZONE, ...options }).format(date);
}

/**
 * Safely parse a date string. Handles ISO dates, date+time combos,
 * bare TIME strings, and returns fallback date if parsing fails.
 */
export function safeParse(value: string | null | undefined): Date {
  if (!value) return new Date(0);
  try {
    // Already a full ISO datetime
    if (value.includes("T") || value.includes("-")) return parseISO(value);
    // Bare time like "09:00:00" — combine with today
    if (/^\d{2}:\d{2}/.test(value)) {
      const today = studioTodayKey();
      return parseISO(`${today}T${value}`);
    }
    return new Date(value);
  } catch {
    return new Date(0);
  }
}
