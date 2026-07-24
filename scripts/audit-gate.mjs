#!/usr/bin/env node
// Reachability-based security gate. Replaces the bare
// `npm audit --audit-level=high` that CI used to run.
//
//   node scripts/audit-gate.mjs          # the gate (CI + ci-parity)
//   npm run audit:gate
//
// WHY THIS EXISTS
//
// `npm audit --audit-level=high` fails this repo on 13 high/critical
// advisories, none of which we can act on right now: they are either
// dev/build tooling that never executes in the deployed API or web
// runtime, or their published fix breaks a version pin recorded in
// CLAUDE.md (Expo SDK 54, next 15.5.x). A gate that is permanently red
// tells you nothing — it trains people to skip it, and a genuinely new
// advisory lands invisibly among the noise.
//
// So this gate asks a sharper question: is anything high or critical
// BOTH reachable from deployed code AND fixable? Anything else must be
// listed in scripts/audit-allowlist.json with an explicit rationale in
// one of exactly two categories. New advisories are never silent —
// anything not on the list fails the build.
//
// The base scan is `npm audit --omit=dev` so pure devDependencies are
// excluded up front; the allowlist then covers what --omit=dev still
// reports (npm counts a workspace's production deps as production even
// when the workspace itself is build tooling).

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ALLOWLIST = join(__dirname, 'audit-allowlist.json');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

const BLOCKING = new Set(['high', 'critical']);
const VALID_CATEGORIES = new Set(['unreachable', 'pin-locked']);

function runAudit() {
  // Shell form on purpose: Node >=20.12 refuses to spawn `npm.cmd` directly
  // on Windows (EINVAL, the CVE-2024-27980 hardening), and this script is
  // the gate for the Windows ci-parity runner too. No user input is
  // interpolated into the command string.
  //
  // npm audit exits non-zero whenever it finds anything, which is the
  // normal case here — read stdout off the error and carry on.
  try {
    return execSync('npm audit --json --omit=dev', {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

const allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
const entries = allowlist.allow ?? [];

// Fail fast on a malformed allowlist — a typo'd category must not silently
// widen what the gate excuses.
for (const e of entries) {
  if (!e.package || !e.reason || !VALID_CATEGORIES.has(e.category)) {
    console.error(
      `${C.red}Invalid allowlist entry (needs package, reason, and category of ${[...VALID_CATEGORIES].join('|')}):${C.reset}`,
      JSON.stringify(e),
    );
    process.exit(2);
  }
  if (e.category === 'pin-locked' && !e.pin) {
    console.error(`${C.red}pin-locked entry must name the pin:${C.reset} ${e.package}`);
    process.exit(2);
  }
}

const byPackage = new Map(entries.map((e) => [e.package, e]));

const report = JSON.parse(runAudit());
const vulns = report.vulnerabilities ?? {};

const blocking = [];
const excused = [];
const usedEntries = new Set();

for (const [name, v] of Object.entries(vulns)) {
  if (!BLOCKING.has(v.severity)) continue;

  const entry = byPackage.get(name);
  if (!entry) {
    blocking.push({ name, severity: v.severity, why: 'not allowlisted' });
    continue;
  }

  // Path-scoped entries only excuse the locations they name. If a NEW
  // location of the same package is vulnerable, it still blocks.
  if (entry.paths) {
    const nodes = v.nodes ?? [];
    const outside = nodes.filter((n) => !entry.paths.includes(n));
    if (outside.length > 0) {
      blocking.push({
        name,
        severity: v.severity,
        why: `allowlisted only for ${entry.paths.join(', ')} — also vulnerable at: ${outside.join(', ')}`,
      });
      continue;
    }
  }

  usedEntries.add(name);
  excused.push({ name, severity: v.severity, entry });
}

const meta = report.metadata?.vulnerabilities ?? {};
console.log(`${C.bold}Reachability-based audit gate${C.reset} ${C.dim}(base: npm audit --omit=dev)${C.reset}`);
console.log(
  `${C.dim}raw totals — critical ${meta.critical ?? 0}, high ${meta.high ?? 0}, ` +
  `moderate ${meta.moderate ?? 0}, low ${meta.low ?? 0}${C.reset}\n`,
);

if (excused.length > 0) {
  console.log(`${C.bold}Excused (${excused.length})${C.reset}`);
  for (const e of excused) {
    const tag = e.entry.category === 'pin-locked'
      ? `${C.yellow}pin-locked${C.reset}` : `${C.cyan}unreachable${C.reset}`;
    console.log(`  ${e.severity.toUpperCase().padEnd(8)} ${e.name.padEnd(20)} [${tag}]`);
    console.log(`    ${C.dim}${e.entry.reason}${C.reset}`);
  }
  console.log('');
}

const tracked = excused.filter((e) => e.entry.tracked);
if (tracked.length > 0) {
  console.log(`${C.yellow}${C.bold}TRACKED — intended to be removed, not permanent (${tracked.length})${C.reset}`);
  for (const t of tracked) console.log(`  ${C.yellow}- ${t.name}${C.reset}`);
  console.log('');
}

// Stale entries: allowlisted but no longer reported. Surfaced, not fatal —
// a lockfile change can legitimately clear one mid-branch.
const stale = entries.map((e) => e.package).filter((p) => !usedEntries.has(p));
if (stale.length > 0) {
  console.log(`${C.dim}Stale allowlist entries (no longer reported — remove them): ${stale.join(', ')}${C.reset}\n`);
}

if (blocking.length > 0) {
  console.log(`${C.red}${C.bold}BLOCKING (${blocking.length})${C.reset}`);
  for (const b of blocking) {
    console.log(`  ${C.red}${b.severity.toUpperCase().padEnd(8)} ${b.name.padEnd(20)} ${b.why}${C.reset}`);
  }
  console.log('');
  console.log(`${C.red}Gate FAILED.${C.reset} Fix these, or — only if genuinely unreachable or pin-locked —`);
  console.log(`add them to scripts/audit-allowlist.json with a rationale.`);
  process.exit(1);
}

console.log(`${C.green}${C.bold}Gate PASSED${C.reset} — no reachable, fixable high/critical advisories.`);
process.exit(0);
