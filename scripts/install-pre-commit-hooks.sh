#!/usr/bin/env bash
# Install the secret-scan pre-commit hook. Run once per clone:
#
#   ./scripts/install-pre-commit-hooks.sh
#
# The hook invokes `gitleaks protect --staged` before every commit. If
# gitleaks isn't on PATH, the hook prints a one-time install hint and
# passes through — we don't block dev commits just because someone
# hasn't installed the binary yet. CI enforces the same scan against
# the full history (see .github/workflows/gitleaks.yml) so a
# not-installed local hook can't smuggle a secret past the PR gate.
#
# Install gitleaks:
#   - macOS:  brew install gitleaks
#   - linux:  curl -sSL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_$(uname -s)_x64.tar.gz | tar -xz -C ~/.local/bin gitleaks
#   - go:     go install github.com/gitleaks/gitleaks/v8@latest

set -euo pipefail

HOOK_PATH=".git/hooks/pre-commit"
REPO_ROOT="$(git rev-parse --show-toplevel)"

cat > "${REPO_ROOT}/${HOOK_PATH}" <<'HOOK'
#!/usr/bin/env bash
# Vintage.br pre-commit hook — secret scan via gitleaks.
# Installed by scripts/install-pre-commit-hooks.sh.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CONFIG="${REPO_ROOT}/.gitleaks.toml"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks not found on PATH — secret scan SKIPPED locally."
  echo "Install it to enable the pre-commit gate:"
  echo "  brew install gitleaks    # macOS"
  echo "  or  https://github.com/gitleaks/gitleaks/releases"
  echo "CI will still enforce the scan on push."
  exit 0
fi

gitleaks protect --staged --redact --config="${CONFIG}" --no-banner || {
  echo ""
  echo "gitleaks found a secret in your staged changes. Review the"
  echo "finding above; if it's a false positive, add an entry to"
  echo ".gitleaks.toml's [allowlist]. DO NOT override with --no-verify."
  exit 1
}
HOOK

chmod +x "${REPO_ROOT}/${HOOK_PATH}"
echo "Installed pre-commit hook at ${HOOK_PATH}."
echo "Install gitleaks to enable it:"
echo "  brew install gitleaks  # or see gitleaks docs for linux / go install"
