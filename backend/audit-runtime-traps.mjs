#!/usr/bin/env node
/**
 * audit-runtime-traps.mjs
 *
 * Static scanner for the kinds of bugs that don't fail at compile time but
 * blow up in production weeks later. Each rule corresponds to a real defect
 * pattern we've hit and named:
 *
 *   • Silent failure          (.catch(()=>{}) swallows real errors)
 *   • Schema drift            (ALTER ... NOT NULL with .catch(()=>{}))
 *   • Counter drift           (in-memory counter without reconciliation)
 *   • Off-by-one TZ           (new Date(...).toLocaleDateString sin timeZone)
 *   • Naive timestamp         (NOW() vs ::timestamp sin AT TIME ZONE)
 *   • Date YYYY-MM-DD parse   (new Date("2026-06-06") → UTC midnight → -1d)
 *   • Date column to JSON     (SELECT date_col sin to_char(...,'YYYY-MM-DD'))
 *   • Mutation sin onError    (useMutation con éxito-only feedback)
 *   • Auth bypass             (app.{post,put,delete} /api/admin sin middleware)
 *   • JSONB destructive write (JSON.stringify de settings sin merge)
 *   • FOR UPDATE missing      (SELECT antes de UPDATE en una transacción)
 *   • Status cancelled leak   (aggregations sobre bookings/orders sin filtrar)
 *   • Env without fallback    (process.env.X usado sin || default)
 *
 * Cada hallazgo trae: archivo, línea, snippet y severidad (critical/high/info).
 *
 * Usage:
 *   node audit-runtime-traps.mjs                       # Markdown report
 *   node audit-runtime-traps.mjs --root path/to/repo
 *   node audit-runtime-traps.mjs --json
 *   node audit-runtime-traps.mjs --severity critical   # solo críticos
 *   node audit-runtime-traps.mjs --rule silent-failure # solo una regla
 *
 * Exit code: número de hallazgos críticos (CI-friendly).
 *
 * Cero dependencias (node built-ins). Drop-in en cualquier proyecto JS/TS.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// ─── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return fallback;
};
const has = (name) => argv.includes(name);

const ROOT = path.resolve(flag('--root', process.cwd()));
const ONLY_RULE = flag('--rule', null);
const MIN_SEV = flag('--severity', 'info'); // info|high|critical
const AS_JSON = has('--json');
const QUIET = has('--quiet');

const SEV_RANK = { info: 0, high: 1, critical: 2 };

if (!(MIN_SEV in SEV_RANK)) {
  console.error(`Bad --severity: "${MIN_SEV}". Use one of: info | high | critical.`);
  process.exit(2);
}

// ─── Walk ───────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.turbo',
  '.cache', '.parcel-cache', '.expo', 'coverage', '.vercel', '.railway',
  'wallet-assets', 'imagespuntoneutro',
]);
const FILE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.sql']);

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.env.example') continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { yield* walk(p); continue; }
    if (e.isFile() && FILE_EXT.has(path.extname(e.name))) yield p;
  }
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function lineOf(content, idx) {
  return content.slice(0, idx).split('\n').length;
}

function snippet(content, idx, span = 120) {
  const start = Math.max(0, idx - 20);
  return content.slice(start, idx + span).replace(/\n/g, ' ⏎ ').trim();
}

// ─── Rules ──────────────────────────────────────────────────────────────────
// Each rule: { id, name, severity, when(file), scan(file, content) → Finding[] }

const isJS = (f) => /\.(js|mjs|cjs|jsx|ts|tsx)$/.test(f);
const isTS = (f) => /\.(ts|tsx)$/.test(f);
const isSQL = (f) => f.endsWith('.sql');
const isServer = (f) => /\b(server|backend|api|routes)\b/.test(f);
const isReactish = (f) => /\.(tsx|jsx)$/.test(f);

const rules = [
  // ── Silent failures ──────────────────────────────────────────────────────
  {
    id: 'silent-failure',
    name: 'Silent failure (`.catch(() => {})`)',
    severity: 'critical',
    when: isJS,
    scan(file, content) {
      const out = [];
      const re = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g;
      let m;
      while ((m = re.exec(content))) {
        out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index) });
      }
      // also: .catch(() => null) / .catch(() => undefined)
      const re2 = /\.catch\(\s*\(?[_\w]*\)?\s*=>\s*(null|undefined)\s*\)/g;
      while ((m = re2.exec(content))) {
        out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index) });
      }
      // also: try {} catch {} con cuerpo vacío
      const re3 = /catch\s*(\([^)]*\))?\s*\{\s*\}/g;
      while ((m = re3.exec(content))) {
        out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index) });
      }
      return out;
    },
  },

  // ── Mutations without onError ────────────────────────────────────────────
  {
    id: 'mutation-no-onerror',
    name: 'useMutation sin `onError` (UI silenciosa)',
    severity: 'high',
    when: isReactish,
    scan(file, content) {
      const out = [];
      // Match useMutation({ ... }) blocks — best-effort with brace counting.
      const re = /useMutation\s*\(\s*\{/g;
      let m;
      while ((m = re.exec(content))) {
        const start = m.index + m[0].length - 1; // index of '{'
        // Walk braces to find matching close
        let depth = 1, i = start + 1;
        while (i < content.length && depth > 0) {
          const ch = content[i];
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          else if (ch === '"' || ch === "'" || ch === '`') {
            // skip string
            const q = ch;
            i++;
            while (i < content.length && content[i] !== q) {
              if (content[i] === '\\') i++;
              i++;
            }
          }
          i++;
        }
        const block = content.slice(start, i);
        if (!/onError\s*[:=]/.test(block)) {
          out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 60) });
        }
      }
      return out;
    },
  },

  // ── Off-by-one TZ in JS (toLocaleDateString sin timeZone) ────────────────
  {
    id: 'tz-tolocale-no-zone',
    name: '`toLocaleDateString`/`toLocaleString` sin `timeZone` (TZ del navegador)',
    severity: 'high',
    when: isJS,
    scan(file, content) {
      const out = [];
      const re = /\.toLocale(?:Date)?(?:Time)?String\s*\([^)]*\)/g;
      let m;
      while ((m = re.exec(content))) {
        const block = m[0];
        if (!/timeZone\s*:/.test(block)) {
          out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 80) });
        }
      }
      return out;
    },
  },

  // ── new Date("YYYY-MM-DD") parsing as UTC midnight ───────────────────────
  {
    id: 'tz-naive-iso-parse',
    name: '`new Date("YYYY-MM-DD")` (UTC midnight → off-by-one en TZ negativas)',
    severity: 'high',
    when: isJS,
    scan(file, content) {
      const out = [];
      // Catch new Date('YYYY-MM-DD') and new Date(`...${var}`) patterns where
      // the literal is a date-only ISO without time/offset.
      const re = /new\s+Date\s*\(\s*(['"`])(\d{4}-\d{2}-\d{2})\1\s*\)/g;
      let m;
      while ((m = re.exec(content))) {
        out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 60) });
      }
      return out;
    },
  },

  // ── DATE columns returned without to_char ────────────────────────────────
  {
    id: 'sql-date-no-tochar',
    name: 'Columna DATE seleccionada sin `to_char(..., \'YYYY-MM-DD\')` (off-by-one al cliente)',
    severity: 'high',
    when: (f) => isJS(f) || isSQL(f),
    scan(file, content) {
      const out = [];
      // Heuristic: SELECT ... <ident>_date or .date as alias without to_char
      const re = /SELECT[\s\S]{0,400}?(?:^|\s|,|\.)([a-z_][a-z0-9_]*\.)?(start_date|end_date|date)\b/gim;
      let m;
      while ((m = re.exec(content))) {
        // Look ahead in the current SELECT to see if to_char wraps it
        const start = Math.max(0, m.index - 50);
        const window = content.slice(start, m.index + m[0].length + 100);
        if (/to_char\s*\(/i.test(window)) continue;
        // Locate the SELECT that owns this match and check if the column appears
        // after a WHERE in *that* statement (then it's a predicate, not a projection).
        const selectStart = content.lastIndexOf('SELECT', m.index);
        if (selectStart >= 0) {
          const stmt = content.slice(selectStart, m.index);
          if (/\bWHERE\b/i.test(stmt)) continue;
        }
        out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 100) });
      }
      return out;
    },
  },

  // ── Naive ::timestamp comparison with NOW() ──────────────────────────────
  {
    id: 'sql-timestamp-naive',
    name: '`::timestamp` (sin TZ) comparado contra `NOW()` (TIMESTAMPTZ)',
    severity: 'high',
    when: (f) => isJS(f) || isSQL(f),
    scan(file, content) {
      const out = [];
      const re = /::timestamp\b(?![z_])/g;
      let m;
      while ((m = re.exec(content))) {
        const window = content.slice(Math.max(0, m.index - 200), m.index + 200);
        if (/AT\s+TIME\s+ZONE/i.test(window)) continue;
        if (/NOW\s*\(\s*\)|CURRENT_TIMESTAMP/i.test(window)) {
          out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 120) });
        }
      }
      return out;
    },
  },

  // ── Schema drift: DROP NOT NULL with .catch ──────────────────────────────
  {
    id: 'schema-drift-silent-alter',
    name: '`ALTER TABLE ... DROP NOT NULL` con `.catch(()=>{})` (drift silencioso)',
    severity: 'critical',
    when: isJS,
    scan(file, content) {
      const out = [];
      const re = /ALTER\s+TABLE[\s\S]{0,200}?DROP\s+NOT\s+NULL[\s\S]{0,80}?\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/gi;
      let m;
      while ((m = re.exec(content))) {
        out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 160) });
      }
      // Also: ADD COLUMN IF NOT EXISTS + .catch(()=>{}) cuando es un campo crítico
      const re2 = /ALTER\s+TABLE[\s\S]{0,200}?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS[\s\S]{0,200}?\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/gi;
      while ((m = re2.exec(content))) {
        out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 160) });
      }
      return out;
    },
  },

  // ── Admin endpoint sin middleware ────────────────────────────────────────
  {
    id: 'admin-no-middleware',
    name: 'Endpoint `/api/admin/*` sin `adminMiddleware`',
    severity: 'critical',
    when: isJS,
    scan(file, content) {
      const out = [];
      const re = /app\.(post|put|delete|patch|get)\s*\(\s*['"`](\/api\/admin\/[^'"`]+)['"`]\s*,([^)]+)\)/g;
      let m;
      while ((m = re.exec(content))) {
        const args = m[3];
        if (!/adminMiddleware|requireAdmin|isAdmin/.test(args)) {
          out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 140) });
        }
      }
      return out;
    },
  },

  // ── Counter mutation without reconciliation ──────────────────────────────
  {
    id: 'counter-no-reconcile',
    name: 'Contador (`current_bookings`/`stock`/`count`) mutado sin función de reconciliación',
    severity: 'high',
    when: isJS,
    scan(file, content) {
      const out = [];
      const re = /(current_bookings|stock|usage_count|uses_count|cancellations_used)\s*=\s*\1\s*[+\-]\s*1/g;
      let m;
      const counters = new Set();
      while ((m = re.exec(content))) {
        counters.add(m[1]);
      }
      // Only emit if no reconcile / recompute helper exists in the same file
      if (counters.size && !/reconcile|recompute|recalc/i.test(content)) {
        // emit one finding per counter occurrence (helps locate)
        re.lastIndex = 0;
        while ((m = re.exec(content))) {
          out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 100) });
        }
      }
      return out;
    },
  },

  // ── Aggregations over bookings/orders sin filtrar cancelled ──────────────
  {
    id: 'agg-leak-cancelled',
    name: 'Agregación sobre `bookings`/`orders` sin filtrar `status=cancelled`',
    severity: 'info',
    when: (f) => isJS(f) || isSQL(f),
    scan(file, content) {
      const out = [];
      const re = /COUNT\([^)]*\)\s*FROM\s+(bookings|orders)\b/gi;
      let m;
      while ((m = re.exec(content))) {
        const window = content.slice(m.index, m.index + 400);
        if (!/cancelled|canceled/i.test(window)) {
          out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 160) });
        }
      }
      return out;
    },
  },

  // ── JSONB destructive overwrite ──────────────────────────────────────────
  {
    id: 'jsonb-overwrite',
    name: '`JSON.stringify(value)` directo a UPDATE settings (pierde defaults)',
    severity: 'high',
    when: isJS,
    scan(file, content) {
      const out = [];
      // Pattern: settings.value = JSON.stringify(...) without a merge step.
      const re = /UPDATE\s+settings[\s\S]{0,200}?value\s*=\s*\$\d+/gi;
      let m;
      while ((m = re.exec(content))) {
        const window = content.slice(Math.max(0, m.index - 400), m.index);
        if (!/merge|deepMerge|mergeWithDefaults/i.test(window)) {
          out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 160) });
        }
      }
      return out;
    },
  },

  // ── SELECT antes de UPDATE en transacción sin FOR UPDATE ─────────────────
  {
    id: 'tx-no-for-update',
    name: 'Transacción con SELECT + UPDATE de la misma tabla sin `FOR UPDATE` (race)',
    severity: 'high',
    when: isJS,
    scan(file, content) {
      const out = [];
      // Heuristic: BEGIN ... SELECT ... FROM <T> ... UPDATE <T> ... COMMIT
      // Without FOR UPDATE in the same transaction window.
      const re = /BEGIN[\s\S]{0,2000}?SELECT[\s\S]{0,800}?FROM\s+([a-z_]+)\b[\s\S]{0,1500}?UPDATE\s+\1\b[\s\S]{0,200}?COMMIT/gi;
      let m;
      while ((m = re.exec(content))) {
        const block = m[0];
        if (!/FOR\s+UPDATE/i.test(block)) {
          out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 100) });
        }
      }
      return out;
    },
  },

  // ── process.env sin fallback ─────────────────────────────────────────────
  {
    id: 'env-no-fallback',
    name: '`process.env.X` usado sin fallback (`||` / `??`)',
    severity: 'info',
    when: isJS,
    scan(file, content) {
      const out = [];
      const re = /process\.env\.([A-Z_][A-Z0-9_]*)\b/g;
      let m;
      const seen = new Set();
      while ((m = re.exec(content))) {
        const key = `${m[1]}@${m.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Look ahead up to the next statement boundary for a fallback (|| / ??).
        // 20 chars wasn't enough for long names like NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID.
        const after = content.slice(m.index + m[0].length, m.index + m[0].length + 200);
        const stmtEnd = after.search(/[;,)\n]/);
        const lookahead = stmtEnd >= 0 ? after.slice(0, stmtEnd) : after;
        if (/(\|\||\?\?)/.test(lookahead)) continue;
        // skip "if (process.env.X)" / "process.env.X ?" guards
        if (/^\s*(\?|&&)/.test(content.slice(m.index + m[0].length).trimStart())) continue;
        if (/^if\s*\(\s*process\.env\.[A-Z_]+\s*\)/.test(content.slice(Math.max(0, m.index - 4), m.index + m[0].length + 1))) continue;
        out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 80) });
      }
      // dedupe: cap to 5 per file (noisy)
      return out.slice(0, 5);
    },
  },

  // ── staleTime: Infinity sin invalidate visible ───────────────────────────
  {
    id: 'staletime-infinity',
    name: '`staleTime: Infinity` (cache que solo se refresca con `invalidateQueries`)',
    severity: 'info',
    when: isReactish,
    scan(file, content) {
      const out = [];
      const re = /staleTime\s*:\s*Infinity/g;
      let m;
      while ((m = re.exec(content))) {
        out.push({ line: lineOf(content, m.index), snippet: snippet(content, m.index, 60) });
      }
      return out;
    },
  },
];

// ─── Run ────────────────────────────────────────────────────────────────────
const findings = [];
let scannedFiles = 0;

const SELF_FILE = path.resolve(fileURLToPath(import.meta.url));

for (const file of walk(ROOT)) {
  // Avoid self-detection: scanner's own regex/JSDoc literals would match its own rules.
  if (path.resolve(file) === SELF_FILE) continue;
  if (/\.(test|spec)\.[mc]?[jt]sx?$/.test(file)) continue;
  scannedFiles++;
  const content = readFile(file);
  if (!content) continue;
  const rel = path.relative(ROOT, file);
  for (const rule of rules) {
    if (ONLY_RULE && rule.id !== ONLY_RULE) continue;
    if (SEV_RANK[rule.severity] < SEV_RANK[MIN_SEV]) continue;
    if (rule.when && !rule.when(file)) continue;
    let hits;
    try { hits = rule.scan(file, content) || []; }
    catch (e) {
      if (!QUIET) console.error(`[rule ${rule.id}] error in ${rel}: ${e.message}`);
      continue;
    }
    for (const h of hits) {
      findings.push({
        rule: rule.id,
        name: rule.name,
        severity: rule.severity,
        file: rel,
        line: h.line,
        snippet: h.snippet,
      });
    }
  }
}

// ─── Output ─────────────────────────────────────────────────────────────────
const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}

const criticals = findings.filter((f) => f.severity === 'critical').length;
const highs = findings.filter((f) => f.severity === 'high').length;
const infos = findings.filter((f) => f.severity === 'info').length;

if (AS_JSON) {
  process.stdout.write(JSON.stringify({
    root: ROOT,
    scannedFiles,
    summary: { total: findings.length, critical: criticals, high: highs, info: infos },
    findings,
  }, null, 2));
  process.exit(criticals > 0 ? 1 : 0);
}

const SEV_BADGE = { critical: '🔴 CRITICAL', high: '🟠 HIGH', info: '🔵 INFO' };

console.log('');
console.log(`# Runtime traps audit — ${ROOT}`);
console.log('');
console.log(`Scanned **${scannedFiles}** files. Found **${findings.length}** issues:`);
console.log(`- 🔴 Critical: **${criticals}**`);
console.log(`- 🟠 High:     **${highs}**`);
console.log(`- 🔵 Info:     **${infos}**`);
console.log('');

if (findings.length === 0) {
  console.log('✓ Clean. No runtime traps detected by this scanner.');
  process.exit(0);
}

const ruleOrder = rules
  .filter((r) => byRule.has(r.id))
  .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);

for (const rule of ruleOrder) {
  const list = byRule.get(rule.id);
  console.log(`## ${SEV_BADGE[rule.severity]} ${rule.name}`);
  console.log(`Rule: \`${rule.id}\` — ${list.length} hit${list.length === 1 ? '' : 's'}`);
  console.log('');
  for (const f of list.slice(0, 25)) {
    console.log(`- \`${f.file}:${f.line}\``);
    console.log(`  > ${f.snippet.slice(0, 200)}`);
  }
  if (list.length > 25) console.log(`  …and ${list.length - 25} more (use --json for full list)`);
  console.log('');
}

console.log('---');
console.log(`Tip: re-run with \`--rule <id>\` to focus on one category, or \`--severity critical\` to gate CI.`);
console.log('');

process.exit(criticals > 0 ? 1 : 0);
