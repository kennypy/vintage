#!/usr/bin/env node
// scripts/ci-parity.mjs
//
// Cross-platform Node mirror of scripts/ci-parity.sh. Same steps, same
// order, same cache-nuking policy. Exists so Windows devs (who can't run
// bash without git-bash/WSL) can still pass the mandatory pre-push gate
// documented in CLAUDE.md §Development Workflow.
//
// MUST stay byte-for-byte equivalent in WHAT IT CHECKS with:
//   - scripts/ci-parity.sh
//   - .github/workflows/ci.yml
// When you add a step to either of those, add it here too.
//
// Usage (any platform):
//   node scripts/ci-parity.mjs          # Full run — USE THIS BEFORE EVERY PUSH
//   node scripts/ci-parity.mjs --fast   # Skip the dep nuke+reinstall
//
// Exit: 0 → safe to push. 1 → fix failures, do not push.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LOG_DIR = join(REPO_ROOT, '.ci-parity-logs');

const isTTY = process.stdout.isTTY;
const c = {
  red: isTTY ? '\x1b[0;31m' : '',
  green: isTTY ? '\x1b[0;32m' : '',
  yellow: isTTY ? '\x1b[1;33m' : '',
  blue: isTTY ? '\x1b[0;34m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  nc: isTTY ? '\x1b[0m' : '',
};

// ── Arguments ────────────────────────────────────────────────────────────
const arg = process.argv[2];
let fast = false;
if (arg === '--fast') {
  fast = true;
} else if (arg === '-h' || arg === '--help') {
  process.stdout.write(
    'Usage:\n' +
    '  node scripts/ci-parity.mjs          Full run (matches CI exactly)\n' +
    '  node scripts/ci-parity.mjs --fast   Skip dep reinstall (local iteration)\n',
  );
  process.exit(0);
} else if (arg) {
  process.stderr.write(`Unknown option: ${arg}\n`);
  process.exit(2);
}

// ── Setup ────────────────────────────────────────────────────────────────
process.chdir(REPO_ROOT);
mkdirSync(LOG_DIR, { recursive: true });
for (const f of readdirSync(LOG_DIR)) {
  if (f.endsWith('.log')) rmSync(join(LOG_DIR, f), { force: true });
}

let step = 0;
let failed = 0;
const failedSteps = [];
const totalStart = Date.now();

// ── Runner ───────────────────────────────────────────────────────────────
function runStep(name, cmd, extraEnv = {}) {
  step += 1;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const logPath = join(LOG_DIR, `${String(step).padStart(2, '0')}-${slug}.log`);

  process.stdout.write(
    `${c.blue}${c.bold}[${String(step).padStart(2, '0')}] ${name}${c.nc}\n`,
  );
  const start = Date.now();

  return new Promise((resolveStep) => {
    const chunks = [];
    // shell: true lets us accept the same piped strings the .sh runner uses
    // (`cd apps/api && npx prisma generate`) without hand-splitting args,
    // and on Windows it ensures `npx` resolves to `npx.cmd`. We deliberately
    // do NOT set pipefail here (Windows cmd doesn't have it) — individual
    // steps must not pipe through tee/tail; that rule is enforced by
    // reviewing the step list, not by the runner.
    const child = spawn(cmd, {
      shell: true,
      env: { ...process.env, ...extraEnv },
    });

    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));

    child.on('close', (code) => {
      const elapsed = Math.round((Date.now() - start) / 1000);
      const log = Buffer.concat(chunks);
      writeFileSync(logPath, log);

      if (code === 0) {
        process.stdout.write(
          `     ${c.green}PASS${c.nc} (${elapsed}s) — log: ${logPath.replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', '')}\n`,
        );
        resolveStep();
      } else {
        process.stdout.write(
          `     ${c.red}FAIL (exit ${code}, ${elapsed}s)${c.nc} — log: ${logPath.replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', '')}\n\n`,
        );
        process.stdout.write(`${c.red}---- last 40 lines of log ----${c.nc}\n`);
        tail(logPath, 40).then(() => {
          process.stdout.write(`${c.red}---- end ----${c.nc}\n\n`);
          failed = 1;
          failedSteps.push(name);
          resolveStep();
        });
      }
    });

    child.on('error', (err) => {
      const elapsed = Math.round((Date.now() - start) / 1000);
      writeFileSync(logPath, `spawn error: ${err.stack || err.message}\n`);
      process.stdout.write(
        `     ${c.red}FAIL (spawn error, ${elapsed}s)${c.nc} — ${err.message}\n\n`,
      );
      failed = 1;
      failedSteps.push(name);
      resolveStep();
    });
  });
}

async function tail(path, n) {
  // Small log files — just read, split, slice. Avoids a tail dependency.
  if (!existsSync(path)) return;
  const lines = [];
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) {
    lines.push(line);
    if (lines.length > n * 4) lines.splice(0, lines.length - n * 4);
  }
  process.stdout.write(lines.slice(-n).join('\n') + '\n');
}

function nuke(paths) {
  for (const rel of paths) {
    // Support glob-ish patterns like apps/*/node_modules by expanding one level.
    if (rel.includes('*')) {
      const [head, ...tail] = rel.split('*');
      const parent = head.endsWith('/') ? head.slice(0, -1) : head;
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        const target = join(parent, entry.name, tail.join('*').replace(/^\//, ''));
        rmSync(target, { recursive: true, force: true });
      }
      continue;
    }
    rmSync(rel, { recursive: true, force: true });
  }
}

// ── Banner ───────────────────────────────────────────────────────────────
process.stdout.write('\n');
process.stdout.write(`${c.bold}Vintage.br — CI Parity Runner (Node)${c.nc}\n`);
process.stdout.write('Mirrors: .github/workflows/ci.yml (ci job + security-audit job)\n');
process.stdout.write(`Root:    ${REPO_ROOT}\n`);
process.stdout.write('Logs:    .ci-parity-logs/\n');
if (fast) {
  process.stdout.write(`Mode:    ${c.yellow}--fast${c.nc} (dep reinstall skipped — LOCAL ITERATION ONLY)\n`);
} else {
  process.stdout.write('Mode:    full (matches CI exactly)\n');
}
process.stdout.write('\n');

// ── Cache & dependency reset ─────────────────────────────────────────────
async function main() {
  if (!fast) {
    process.stdout.write(`${c.yellow}Nuking every cache + reinstalling from lockfile...${c.nc}\n`);
    nuke([
      'node_modules',
      'apps/*/node_modules',
      'packages/*/node_modules',
      '.turbo',
      'apps/*/.turbo',
      'packages/*/.turbo',
      'apps/web/.next',
      'apps/*/dist',
      'packages/*/dist',
      'node_modules/.cache',
      'apps/*/coverage',
      'packages/*/coverage',
    ]);
    await runStep('Install dependencies (npm ci)', 'npm ci');
  } else {
    process.stdout.write(`${c.yellow}--fast: clearing derived caches (node_modules kept)...${c.nc}\n`);
    nuke([
      '.turbo',
      'apps/*/.turbo',
      'packages/*/.turbo',
      'apps/web/.next',
      'apps/*/dist',
      'packages/*/dist',
      'node_modules/.cache',
    ]);
  }
  process.stdout.write('\n');

  // ── CI job steps (MUST mirror .github/workflows/ci.yml) ────────────────
  await runStep('Build shared packages', 'npx turbo build --filter=@vintage/shared --force');
  await runStep('Generate Prisma client', 'cd apps/api && npx prisma generate');
  await runStep('Lint (all packages)', 'npx turbo lint --force');
  await runStep('Type-check API', 'npx tsc -p apps/api/tsconfig.json --noEmit');
  await runStep('Run tests (CI env vars)', 'npx turbo test --force', {
    DATABASE_URL: 'postgresql://vintage:vintage@localhost:5432/vintage_test',
    JWT_SECRET: 'test-secret-do-not-use-in-production',
    NODE_ENV: 'test',
  });
  await runStep('Build API', 'npx turbo build --filter=@vintage/api --force');
  await runStep('Build Web', 'npx turbo build --filter=@vintage/web --force');

  // ── security-audit job ───────────────────────────────────────────────
  await runStep('Security audit (high gate, CI launch gate)', 'npm audit --audit-level=high');

  // ── optional: Web E2E smoke tests (Playwright) ───────────────────────
  // Skipped by default because it needs the Chromium binary
  // (`npx playwright install chromium`) which is too heavy for every
  // contributor's first checkout. Opt in with E2E=1.
  if (process.env.E2E === '1') {
    await runStep('Web E2E smoke tests (Playwright)', 'npm -w @vintage/web run test:e2e');
  } else {
    process.stdout.write('[skip] Web E2E smoke tests — set E2E=1 after `npx playwright install chromium` to run.\n');
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const total = Math.round((Date.now() - totalStart) / 1000);
  process.stdout.write('\n');
  if (failed === 0) {
    process.stdout.write(`${c.green}${c.bold}═══ ALL ${step} STEPS PASSED (${total}s total) ═══${c.nc}\n`);
    process.stdout.write('Safe to commit + push. Run again after any further edits.\n');
    process.exit(0);
  } else {
    process.stdout.write(`${c.red}${c.bold}═══ ${failedSteps.length}/${step} STEP(S) FAILED (${total}s total) ═══${c.nc}\n`);
    process.stdout.write('Failed:\n');
    for (const s of failedSteps) {
      process.stdout.write(`  ${c.red}• ${s}${c.nc}\n`);
    }
    process.stdout.write('\nFull logs: .ci-parity-logs/\n');
    process.stdout.write('DO NOT push. Fix the failures and re-run.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`runner crashed: ${err.stack || err.message}\n`);
  process.exit(1);
});
