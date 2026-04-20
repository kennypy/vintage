#!/usr/bin/env bash
# scripts/ci-parity.sh
#
# Runs every step of .github/workflows/ci.yml locally, in the same order,
# with every cache nuked, so the result is a true reproduction of CI.
#
# MANDATORY before every `git push`. No exceptions.
#
# ──────────────────────────────────────────────────────────────────────
# Why this script exists
# ──────────────────────────────────────────────────────────────────────
# Multiple previous pushes claimed "verified locally" and broke on CI.
# Every one of those failures traced to a specific shortcut that this
# script refuses to take:
#
#   1. Turbo cache hiding fresh failures
#        → Every turbo command runs with `--force`. The .turbo dirs and
#          Next.js .next cache are deleted before each run.
#   2. `npm install` (permissive) vs `npm ci` (strict lockfile)
#        → Always `npm ci`. node_modules is deleted first.
#   3. Pipe-masked exit codes (`turbo X | tail -N; echo $?` returned tail's exit)
#        → `set -o pipefail` is set for every step. The real exit is what
#          run_step checks; tail is only used for log previews AFTER.
#   4. Stale Prisma client after schema changes
#        → Prisma generate runs explicitly (not via lazy postinstall).
#   5. Background task runner reporting a laundered 0
#        → Script is foreground-only. Exit codes come from `bash -c`.
#   6. Speculative eslint-disable directives for rules the config doesn't
#      register
#        → Lint runs against the real config. If a disable points at a
#          missing rule, lint fails here before it fails on CI.
#
# If you're tempted to add `--cache-from=...`, `--no-frozen`, or a "skip
# the reinstall" fast-path that runs in CI, DON'T. Use --fast LOCALLY
# only when iterating on a single file.
#
# ──────────────────────────────────────────────────────────────────────
# Usage
# ──────────────────────────────────────────────────────────────────────
#   ./scripts/ci-parity.sh           # Full run — USE THIS BEFORE EVERY PUSH
#   ./scripts/ci-parity.sh --fast    # Skip the dep nuke+reinstall (local iteration only)
#
# Exit:
#   0 → every step passed. Safe to push.
#   1 → at least one step failed. The failing step's last 40 log lines
#       are printed and the full log is in .ci-parity-logs/. DO NOT push.

set -euo pipefail

# ── Colors (disabled when not a tty) ──────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

# ── Arguments ─────────────────────────────────────────────────────────
FAST=0
case "${1:-}" in
  --fast) FAST=1 ;;
  -h|--help)
    sed -n '3,45p' "$0"
    exit 0
    ;;
  "") ;;
  *)
    echo "Unknown option: $1" >&2
    echo "Try: $0 --help" >&2
    exit 2
    ;;
esac

# ── Paths ─────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="$REPO_ROOT/.ci-parity-logs"
mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/*.log

# ── State ─────────────────────────────────────────────────────────────
STEP=0
FAIL=0
FAILED_STEPS=()
TOTAL_START=$(date +%s)

# ── Runner ────────────────────────────────────────────────────────────
# Runs a single CI step. The command is executed via `bash -c` so any
# pipelines inside it inherit `set -o pipefail` (pipe-masking was the
# single biggest source of "green locally, red on CI" incidents).
run_step() {
  local name="$1"
  local cmd="$2"
  STEP=$((STEP + 1))

  # Slug for the log filename.
  local slug
  slug=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | tr -c '[:alnum:]' '-' | sed 's/--*/-/g;s/^-//;s/-$//')
  local log="$LOG_DIR/$(printf '%02d' "$STEP")-$slug.log"

  printf "${BLUE}${BOLD}[%02d] %s${NC}\n" "$STEP" "$name"
  local start
  start=$(date +%s)

  if bash -c "set -euo pipefail; $cmd" > "$log" 2>&1; then
    local end
    end=$(date +%s)
    printf "     ${GREEN}PASS${NC} (%ds) — log: %s\n" "$((end - start))" "${log#"$REPO_ROOT/"}"
  else
    local exit_code=$?
    local end
    end=$(date +%s)
    printf "     ${RED}FAIL (exit %d, %ds)${NC} — log: %s\n" \
           "$exit_code" "$((end - start))" "${log#"$REPO_ROOT/"}"
    echo ""
    printf -- "${RED}---- last 40 lines of %s ----${NC}\n" "${log#"$REPO_ROOT/"}"
    tail -40 "$log" || true
    printf -- "${RED}---- end ----${NC}\n\n"
    FAIL=1
    FAILED_STEPS+=("$name")
  fi
}

# ── Banner ────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Vintage.br — CI Parity Runner${NC}"
echo "Mirrors: .github/workflows/ci.yml (ci job + security-audit job)"
echo "Root:    $REPO_ROOT"
echo "Logs:    .ci-parity-logs/"
if [[ $FAST -eq 1 ]]; then
  echo -e "Mode:    ${YELLOW}--fast${NC} (dep reinstall skipped — LOCAL ITERATION ONLY)"
else
  echo "Mode:    full (matches CI exactly)"
fi
echo ""

# ── Cache & dependency reset ──────────────────────────────────────────
if [[ $FAST -eq 0 ]]; then
  echo -e "${YELLOW}Nuking every cache + reinstalling from lockfile...${NC}"
  # Match CI: fresh clone, npm ci.
  rm -rf node_modules apps/*/node_modules packages/*/node_modules \
         .turbo apps/*/.turbo packages/*/.turbo \
         apps/web/.next apps/*/dist packages/*/dist \
         node_modules/.cache \
         apps/*/coverage packages/*/coverage
  run_step "Install dependencies (npm ci)" "npm ci"
else
  # --fast still clears every derived cache so turbo/next can't replay a
  # stale result. Only node_modules survives.
  echo -e "${YELLOW}--fast: clearing derived caches (node_modules kept)...${NC}"
  rm -rf .turbo apps/*/.turbo packages/*/.turbo \
         apps/web/.next apps/*/dist packages/*/dist \
         node_modules/.cache
fi
echo ""

# ── CI job steps (order MUST mirror .github/workflows/ci.yml) ─────────
run_step "Build shared packages" \
  "npx turbo build --filter=@vintage/shared --force"

run_step "Generate Prisma client" \
  "cd apps/api && npx prisma generate"

run_step "Lint (all packages)" \
  "npx turbo lint --force"

run_step "Type-check API" \
  "npx tsc -p apps/api/tsconfig.json --noEmit"

run_step "Run tests (CI env vars)" \
  "DATABASE_URL=postgresql://vintage:vintage@localhost:5432/vintage_test \
   JWT_SECRET=test-secret-do-not-use-in-production \
   NODE_ENV=test \
   npx turbo test --force"

run_step "Build API" \
  "npx turbo build --filter=@vintage/api --force"

run_step "Build Web" \
  "npx turbo build --filter=@vintage/web --force"

# ── security-audit job ────────────────────────────────────────────────
run_step "Security audit (high gate, CI launch gate)" \
  "npm audit --audit-level=high"

# ── Summary ───────────────────────────────────────────────────────────
TOTAL_END=$(date +%s)
TOTAL=$((TOTAL_END - TOTAL_START))
echo ""
if [[ $FAIL -eq 0 ]]; then
  printf "${GREEN}${BOLD}═══ ALL %d STEPS PASSED (%ds total) ═══${NC}\n" "$STEP" "$TOTAL"
  echo "Safe to commit + push. Run again after any further edits."
  exit 0
else
  printf "${RED}${BOLD}═══ %d/%d STEP(S) FAILED (%ds total) ═══${NC}\n" \
         "${#FAILED_STEPS[@]}" "$STEP" "$TOTAL"
  echo "Failed:"
  for s in "${FAILED_STEPS[@]}"; do
    printf "  ${RED}• %s${NC}\n" "$s"
  done
  echo ""
  echo "Full logs: .ci-parity-logs/"
  echo "DO NOT push. Fix the failures and re-run $0."
  exit 1
fi
