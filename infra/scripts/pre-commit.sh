#!/usr/bin/env bash
# Pre-commit hook for Terraform + TypeScript quality checks
# Install: make -C infra hooks
set -euo pipefail

errors=0
root="$(git rev-parse --show-toplevel)"

# ── Biome (TypeScript lint) ──────────────────────────────────────────
staged_ts=$(git diff --cached --name-only --diff-filter=ACMR -- '*.ts' 2>/dev/null || true)
if [ -n "${staged_ts}" ]; then
  echo "=== Biome pre-commit checks ==="
  cd "${root}"

  if command -v pnpm > /dev/null 2>&1; then
    echo "[1/2] biome lint..."
    if ! pnpm exec biome lint . > /dev/null 2>&1; then
      echo "  FAIL: Run 'pnpm run lint:fix' to fix"
      errors=$((errors + 1))
    else
      echo "  OK"
    fi

    echo "[2/2] biome format..."
    if ! pnpm exec biome format . > /dev/null 2>&1; then
      echo "  FAIL: Run 'pnpm run format' to fix"
      errors=$((errors + 1))
    else
      echo "  OK"
    fi
  else
    echo "[biome] SKIP (pnpm not available)"
  fi
fi

# ── Terraform checks ────────────────────────────────────────────────
staged_infra=$(git diff --cached --name-only --diff-filter=ACMR -- 'infra/*.tf' 'infra/*.tfvars' 2>/dev/null || true)
if [ -n "${staged_infra}" ]; then
  echo "=== Terraform pre-commit checks ==="
  cd "${root}/infra"

  # 1. Format check
  echo "[1/3] terraform fmt..."
  if ! terraform fmt -check -recursive > /dev/null 2>&1; then
    echo "  FAIL: Run 'terraform fmt -recursive' in infra/ to fix"
    errors=$((errors + 1))
  else
    echo "  OK"
  fi

  # 2. TFLint
  if command -v tflint > /dev/null 2>&1; then
    echo "[2/3] tflint..."
    if ! tflint --init > /dev/null 2>&1 || ! tflint 2>&1; then
      echo "  FAIL: Fix tflint issues above"
      errors=$((errors + 1))
    else
      echo "  OK"
    fi
  else
    echo "[2/3] tflint... SKIP (not installed: brew install tflint)"
  fi

  # 3. Trivy config scan
  if command -v trivy > /dev/null 2>&1; then
    echo "[3/3] trivy config..."
    if ! trivy config --exit-code 1 --severity HIGH,CRITICAL . > /dev/null 2>&1; then
      echo "  FAIL: Fix trivy findings (run 'trivy config .' for details)"
      errors=$((errors + 1))
    else
      echo "  OK"
    fi
  else
    echo "[3/3] trivy... SKIP (not installed: brew install trivy)"
  fi
fi

if [ "${errors}" -gt 0 ]; then
  echo ""
  echo "Pre-commit checks failed (${errors} error(s)). Commit aborted."
  exit 1
fi

if [ -n "${staged_ts}" ] || [ -n "${staged_infra}" ]; then
  echo "=== All pre-commit checks passed ==="
fi
