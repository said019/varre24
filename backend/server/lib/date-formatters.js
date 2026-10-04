// Reuse ICU formatters across schedules and notification batches. Keep the
// cache bounded even if future callers introduce additional time zones.
const formatters = new Map();
const MAX_FORMATTERS = 16;

export function dateTimeFormatter(locale, options) {
  // An omitted zone follows the process default, which can change at runtime.
  // Only cache explicit zones; all production hot paths specify CDMX.
  if (options.timeZone === undefined || Object.values(options).some((value) => value !== undefined && typeof value !== "string" && typeof value !== "boolean")) {
    return new Intl.DateTimeFormat(locale, options);
  }
  const key = JSON.stringify([locale, Object.keys(options).filter((name) => options[name] !== undefined).sort().map((name) => [name, options[name]])]);
  let formatter = formatters.get(key);
  if (formatter) {
    formatters.delete(key);
  } else {
    formatter = new Intl.DateTimeFormat(locale, options);
    if (formatters.size >= MAX_FORMATTERS) formatters.delete(formatters.keys().next().value);
  }
  formatters.set(key, formatter);
  return formatter;
}

// Date#toLocaleDateString supplies date defaults even when time fields are
// present, and rejects timeStyle. Preserve those semantics rather than using
// the different defaults of Intl.DateTimeFormat directly.
export function spanishDate(date, options) {
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  if (options.timeStyle !== undefined || Object.values(options).some((value) =>
    value !== undefined && typeof value !== "string" && typeof value !== "boolean"
  )) return date.toLocaleDateString("es-MX", options);
  const normalized = { ...options };
  if (normalized.dateStyle === undefined && ["weekday", "year", "month", "day"].every((name) => normalized[name] === undefined)) {
    normalized.year = "numeric";
    normalized.month = "numeric";
    normalized.day = "numeric";
  }
  // Undefined options are equivalent to absent ones. Remove them before
  // generating the cache key so they cannot collide with explicit null.
  for (const key of Object.keys(normalized)) if (normalized[key] === undefined) delete normalized[key];
  return dateTimeFormatter("es-MX", normalized).format(date);
}
