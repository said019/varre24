import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { dateTimeFormatter, spanishDate } from "../lib/date-formatters.js";

// Evaluate the real pure functions only. Importing index.js would start HTTP,
// jobs and schema bootstrap, none of which belongs in this offline contract.
const current = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const previous = readFileSync(new URL("./fixtures/date-formatters/before.js.txt", import.meta.url), "utf8");
// Frozen verbatim from index.js at 40d2a5477433154a15dd6ee4c4c7aea698b97e40.
assert.equal(createHash("sha256").update(previous).digest("hex"), "fda3af15bf666521110ff45a7a42536b843c5a5a78ac73b00f2a2f9e9ecd2201");
function load(source, globals = {}) {
  const start = source.indexOf("const STUDIO_TIME_ZONE =");
  const end = source.indexOf("// Convierte una columna DATE", start);
  assert.ok(start >= 0);
  return runInNewContext(source.slice(start, end < 0 ? undefined : end)
    + "\n;({mexicoDateKey, mexicoMonthStartKey, formatMexicoDate});",
  { Date, Intl, dateTimeFormatter, spanishDate, ...globals });
}
const before = load(previous), after = load(current);
const instants = [
  "2000-02-29T06:00:00Z", "2022-04-03T07:59:59Z", "2022-04-03T08:00:00Z",
  "2022-10-30T06:59:59Z", "2022-10-30T07:00:00Z", "2026-01-01T05:59:59Z",
  "2026-01-01T06:00:00Z", "2026-07-01T23:59:59Z", "2026-12-31T23:59:59Z",
];
function outcome(fn, ...args) {
  try { return { value: fn(...args) }; }
  catch (error) { return { name: error.name, message: error.message }; }
}

test("calendar keys preserve CDMX midnight, historical DST, leap days and native errors", () => {
  for (const name of ["mexicoDateKey", "mexicoMonthStartKey"]) {
    for (const value of [...instants.map(v => new Date(v)), new Date(NaN), null, 0, "invalid"]) {
      assert.deepEqual(outcome(after[name], value), outcome(before[name], value), `${name}: ${String(value)}`);
    }
  }
  assert.equal(after.mexicoDateKey(new Date("2026-01-01T05:59:59Z")), "2025-12-31");
  assert.equal(after.mexicoDateKey(new Date("2026-01-01T06:00:00Z")), "2026-01-01");
});

test("civil DATE normalization, date defaults, locale options and overrides remain exact", () => {
  const options = [
    {}, { day: "numeric", month: "short" }, { day: "numeric", month: "short", year: "numeric" },
    { weekday: "long" }, { dateStyle: "full" }, { hour: "2-digit", hour12: false }, { era: "long" },
    { timeZone: "Pacific/Kiritimati" }, { timeZone: "America/New_York" }, { timeZone: "invalid" },
    { timeStyle: "short" }, { dateStyle: null }, { year: undefined }, { hour12: null },
    { month: { toString: () => "short" } },
  ];
  for (const value of [...instants, ...instants.map(v => new Date(v)), "2026-01-01", "2000-02-29", "invalid", new Date(NaN), null, undefined, "", 0]) {
    for (const opts of options) assert.deepEqual(outcome(after.formatMexicoDate, value, opts), outcome(before.formatMexicoDate, value, opts));
  }
});

test("the actual date-key helper reuses one ICU constructor across 200 operations", () => {
  const constructors = { before: 0, after: 0 };
  const countingIntl = side => ({ DateTimeFormat: new Proxy(Intl.DateTimeFormat, {
    construct(target, args) { constructors[side]++; return Reflect.construct(target, args); },
  }) });
  const original = load(previous, { Intl: countingIntl("before") });
  const cacheSource = readFileSync(new URL("../lib/date-formatters.js", import.meta.url), "utf8").replaceAll("export function", "function");
  const cached = runInNewContext(cacheSource + "\n;({dateTimeFormatter, spanishDate});", { Intl: countingIntl("after") });
  const changed = load(current, { ...cached });
  for (let i = 0; i < 200; i++) {
    const date = new Date(Date.UTC(2026, 0, 1, 0, i * 17));
    assert.equal(changed.mexicoDateKey(date), original.mexicoDateKey(date));
  }
  assert.deepEqual(constructors, { before: 200, after: 1 });
});

test("only sixteen primitive-option formatter variants remain cached", async () => {
  const { dateTimeFormatter: fresh } = await import("../lib/date-formatters.js?bounded-contract");
  const options = { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" };
  const first = fresh("en-US", options);
  assert.equal(fresh("en-US", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Mexico_City" }), first);
  for (const timeZone of Intl.supportedValuesOf("timeZone").slice(0, 20)) fresh("en-US", { ...options, timeZone });
  assert.notEqual(fresh("en-US", options), first);
  assert.notEqual(fresh("en-US", { timeZone: "UTC", hour: "numeric", hour12: null }), fresh("en-US", { timeZone: "UTC", hour: "numeric", hour12: undefined }));
});

test("explicitly undefined timezone continues to follow the process default", () => {
  const saved = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Mexico_City", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      for (const value of ["2026-01-01", new Date("2026-01-01T00:30:00Z")]) {
        assert.equal(after.formatMexicoDate(value, { timeZone: undefined }), before.formatMexicoDate(value, { timeZone: undefined }));
      }
    }
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});
