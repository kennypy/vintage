#!/usr/bin/env node
// One-command local dev setup. Idempotent — safe to re-run.
//
//   npm run setup             # full setup
//   npm run setup -- --fresh  # nuke node_modules + reinstall before everything else
//   npm run setup -- --reset  # drop the database before migrating + seeding
//
// After this finishes successfully, run `npm run dev` to start API + web + mobile.

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const args = new Set(process.argv.slice(2));
const FRESH = args.has('--fresh');
const RESET_DB = args.has('--reset');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};
const log = (msg) => console.log(msg);
const step = (n, total, msg) => log(`\n${C.cyan}${C.bold}[${n}/${total}]${C.reset} ${C.bold}${msg}${C.reset}`);
const ok = (msg) => log(`  ${C.green}✓${C.reset} ${msg}`);
const warn = (msg) => log(`  ${C.yellow}!${C.reset} ${msg}`);
const fail = (msg) => { log(`\n${C.red}${C.bold}✗ ${msg}${C.reset}`); process.exit(1); };

function run(cmd, opts = {}) {
  const { cwd = ROOT, silent = false, allowFail = false } = opts;
  const result = spawnSync(cmd, {
    cwd, shell: true, stdio: silent ? 'pipe' : 'inherit', encoding: 'utf8',
  });
  if (result.status !== 0 && !allowFail) {
    if (silent && result.stderr) log(result.stderr);
    fail(`Command failed: ${cmd}`);
  }
  return result;
}

function runQuiet(cmd, opts = {}) {
  return run(cmd, { ...opts, silent: true, allowFail: true });
}

// ---------------------------------------------------------------------------
// 1. Prerequisites
// ---------------------------------------------------------------------------
function checkPrereqs() {
  step(1, 8, 'Checking prerequisites');

  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 20) fail(`Node.js >= 20 required (you have ${process.version}). Install from https://nodejs.org`);
  ok(`Node.js ${process.version}`);

  const docker = runQuiet('docker --version');
  if (docker.status !== 0) fail('Docker not found. Install Docker Desktop and start it.');
  ok(docker.stdout.trim());

  const dockerInfo = runQuiet('docker info');
  if (dockerInfo.status !== 0) fail('Docker is installed but the daemon is not running. Open Docker Desktop and wait for it to say "Engine running".');
  ok('Docker daemon is running');
}

// ---------------------------------------------------------------------------
// 2. Env files — create from .env.example, patch dev secrets, leave the rest
// ---------------------------------------------------------------------------
const PLACEHOLDERS = new Set(['', '""', "''", 'CHANGE_ME_IN_PRODUCTION', '"CHANGE_ME_IN_PRODUCTION"']);

function patchEnv(filePath, patches) {
  let content = readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [key, newValue] of Object.entries(patches)) {
    const re = new RegExp(`^${key}=(.*)$`, 'm');
    const match = content.match(re);
    if (!match) {
      content += `\n${key}=${newValue}\n`;
      changed = true;
      continue;
    }
    const current = match[1].trim();
    if (PLACEHOLDERS.has(current)) {
      content = content.replace(re, `${key}=${newValue}`);
      changed = true;
    }
  }
  if (changed) writeFileSync(filePath, content);
  return changed;
}

function detectLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

function setupEnvFiles() {
  step(2, 8, 'Configuring env files');

  // API
  const apiEnv = join(ROOT, 'apps/api/.env');
  const apiEnvExample = join(ROOT, 'apps/api/.env.example');
  if (!existsSync(apiEnv)) {
    copyFileSync(apiEnvExample, apiEnv);
    ok('Created apps/api/.env from .env.example');
  } else {
    ok('apps/api/.env already exists (preserving your values)');
  }
  const apiChanged = patchEnv(apiEnv, {
    JWT_SECRET: `"${randomBytes(32).toString('hex')}"`,
    CSRF_SECRET: `"${randomBytes(32).toString('hex')}"`,
    CPF_ENCRYPTION_KEY: `"${randomBytes(32).toString('hex')}"`,
    CPF_LOOKUP_KEY: `"${randomBytes(32).toString('hex')}"`,
    REDIS_PASSWORD: '"vintage_dev_redis_pw"',
    REDIS_URL: '"redis://:vintage_dev_redis_pw@localhost:6380"',
    MEILI_MASTER_KEY: '"vintage_dev_key"',
    MEILI_HOST: '"http://localhost:7700"',
  });
  if (apiChanged) ok('Patched dev secrets into apps/api/.env');

  // Web
  const webEnv = join(ROOT, 'apps/web/.env.local');
  const webEnvExample = join(ROOT, 'apps/web/.env.example');
  if (!existsSync(webEnv)) {
    copyFileSync(webEnvExample, webEnv);
    ok('Created apps/web/.env.local');
  } else {
    ok('apps/web/.env.local already exists');
  }

  // Mobile — auto-detect LAN IP for Expo Go on physical devices
  const mobileEnv = join(ROOT, 'apps/mobile/.env');
  const mobileEnvExample = join(ROOT, 'apps/mobile/.env.example');
  if (!existsSync(mobileEnv)) {
    copyFileSync(mobileEnvExample, mobileEnv);
    ok('Created apps/mobile/.env');
  } else {
    ok('apps/mobile/.env already exists');
  }
  const lanIp = detectLanIp();
  if (lanIp) {
    let mobileContent = readFileSync(mobileEnv, 'utf8');
    const apiUrlRe = /^EXPO_PUBLIC_API_URL=.*$/m;
    const newApiUrl = `EXPO_PUBLIC_API_URL=http://${lanIp}:3001/api/v1`;
    const currentMatch = mobileContent.match(apiUrlRe);
    const isPlaceholder = !currentMatch || /192\.168\.1\.100/.test(currentMatch[0]);
    if (isPlaceholder) {
      mobileContent = currentMatch ? mobileContent.replace(apiUrlRe, newApiUrl) : mobileContent + `\n${newApiUrl}\n`;
      writeFileSync(mobileEnv, mobileContent);
      ok(`Set mobile API URL to your LAN IP: http://${lanIp}:3001/api/v1`);
    } else {
      ok(`Mobile API URL already set: ${currentMatch[0].split('=')[1]}`);
    }
  } else {
    warn('Could not detect LAN IP — edit apps/mobile/.env manually if testing on a physical phone');
  }
}

// ---------------------------------------------------------------------------
// 3. Docker — postgres + redis + meilisearch
// ---------------------------------------------------------------------------
async function startDocker() {
  step(3, 8, 'Starting Docker services (postgres, redis, meilisearch)');
  run('docker compose up -d');

  // Poll for healthy status — up to 60s
  log('  waiting for healthchecks...');
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ps = runQuiet('docker compose ps --format json');
    if (ps.status === 0 && ps.stdout) {
      const lines = ps.stdout.trim().split('\n').filter(Boolean);
      const services = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const healthy = services.filter((s) => s.Health === 'healthy').length;
      const total = services.length;
      if (total > 0 && healthy === total) {
        ok(`All ${total} services healthy`);
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  warn('Some services not healthy after 60s — continuing anyway. Check `docker compose ps`.');
}

// ---------------------------------------------------------------------------
// 4. Install dependencies
// ---------------------------------------------------------------------------
function installDeps() {
  step(4, 8, 'Installing npm dependencies');
  const nodeModulesExists = existsSync(join(ROOT, 'node_modules'));
  if (FRESH && nodeModulesExists) {
    log('  --fresh: removing node_modules...');
    rmSync(join(ROOT, 'node_modules'), { recursive: true, force: true });
  }
  if (!nodeModulesExists || FRESH) {
    run('npm ci');
    ok('npm ci complete');
  } else {
    ok('node_modules already present (use --fresh to reinstall)');
  }
}

// ---------------------------------------------------------------------------
// 5. Build shared package
// ---------------------------------------------------------------------------
function buildShared() {
  step(5, 8, 'Building @vintage/shared');
  run('npx turbo build --filter=@vintage/shared');
  ok('shared package built');
}

// ---------------------------------------------------------------------------
// 6. Prisma generate
// ---------------------------------------------------------------------------
function prismaGenerate() {
  step(6, 8, 'Generating Prisma client');
  run('npx prisma generate', { cwd: join(ROOT, 'apps/api') });
  ok('Prisma client generated');
}

// ---------------------------------------------------------------------------
// 7. Migrate database
// ---------------------------------------------------------------------------
function migrate() {
  step(7, 8, 'Applying database migrations');
  if (RESET_DB) {
    warn('--reset: dropping database before migrating');
    run('npx prisma migrate reset --force --skip-seed', { cwd: join(ROOT, 'apps/api') });
  } else {
    run('npx prisma migrate deploy', { cwd: join(ROOT, 'apps/api') });
  }
  ok('Migrations applied');
}

// ---------------------------------------------------------------------------
// 8. Seed (skip if already seeded)
// ---------------------------------------------------------------------------
function seed() {
  step(8, 8, 'Seeding database');

  // Detect prior seed by checking for the buyer user via psql in the postgres container.
  const checkSql = `SELECT 1 FROM "User" WHERE email='joao.comprador@vintage.com.br' LIMIT 1;`;
  const check = runQuiet(`docker compose exec -T postgres psql -U vintage -d vintage_dev -tAc "${checkSql}"`);
  const alreadySeeded = check.status === 0 && check.stdout && check.stdout.trim() === '1';

  if (alreadySeeded && !RESET_DB) {
    ok('Database already seeded — skipping (use --reset to wipe and reseed)');
    return;
  }
  run('npx ts-node prisma/seed.ts', { cwd: join(ROOT, 'apps/api') });
  ok('Database seeded');
}

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
function summary() {
  const lanIp = detectLanIp();
  log(`\n${C.green}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  log(`${C.green}${C.bold} ✓ Setup complete${C.reset}`);
  log(`${C.green}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`);

  log(`${C.bold}Next:${C.reset}\n`);
  log(`  ${C.cyan}npm run dev${C.reset}              start API + web + mobile (turbo)`);
  log(`  ${C.cyan}npm run dev:backend${C.reset}      start API + web only (no mobile)`);
  log(`  ${C.cyan}npm run dev:mobile${C.reset}       start mobile only\n`);

  log(`${C.bold}URLs (after npm run dev):${C.reset}\n`);
  log(`  API health     ${C.dim}http://localhost:3001/health${C.reset}`);
  log(`  API docs       ${C.dim}http://localhost:3001/docs${C.reset}`);
  log(`  Web app        ${C.dim}http://localhost:3000${C.reset}`);
  log(`  Mobile (LAN)   ${C.dim}${lanIp ? `http://${lanIp}:3001/api/v1` : 'edit apps/mobile/.env'}${C.reset}`);
  log(`  Meilisearch    ${C.dim}http://localhost:7700  (key: vintage_dev_key)${C.reset}\n`);

  log(`${C.bold}Test accounts (password: ${C.cyan}Teste@123${C.reset}${C.bold}):${C.reset}\n`);
  log(`  ${C.dim}buyer    ${C.reset}joao.comprador@vintage.com.br`);
  log(`  ${C.dim}seller   ${C.reset}ana.vendedora@vintage.com.br`);
  log(`  ${C.dim}generic  ${C.reset}teste@vintage.com.br`);
  log(`  ${C.dim}admin    ${C.reset}admin@vintage.com.br\n`);

  log(`${C.bold}Common follow-ups:${C.reset}\n`);
  log(`  ${C.cyan}npm run setup -- --reset${C.reset}   wipe DB and reseed`);
  log(`  ${C.cyan}npm run setup -- --fresh${C.reset}   reinstall node_modules + everything else`);
  log(`  ${C.cyan}docker compose down${C.reset}        stop docker services`);
  log(`  ${C.cyan}docker compose logs -f${C.reset}     tail docker logs\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  log(`${C.bold}${C.cyan}Vintage.br — local dev setup${C.reset}`);
  log(`${C.dim}repo: ${ROOT}${C.reset}`);
  if (FRESH) log(`${C.yellow}--fresh: will reinstall node_modules${C.reset}`);
  if (RESET_DB) log(`${C.yellow}--reset: will drop and reseed database${C.reset}`);

  try {
    checkPrereqs();
    setupEnvFiles();
    await startDocker();
    installDeps();
    buildShared();
    prismaGenerate();
    migrate();
    seed();
    summary();
  } catch (err) {
    fail(err.message || String(err));
  }
})();
