#!/usr/bin/env bash
# Pre-commit hook for Terraform files under infra/
# Install: ln -sf ../../infra/scripts/pre-commit-terraform.sh .git/hooks/pre-commit-terraform
# Or run: make -C infra hooks
set -euo pipefail

# Only run if infra/ files are staged
staged_infra=$(git diff --cached --name-only --diff-filter=ACMR -- 'infra/*.tf' 'infra/*.tfvars' 2>/dev/null || true)
if [ -z "${staged_infra}" ]; then
  exit 0
fi

echo "=== Terraform pre-commit checks ==="
cd "$(git rev-parse --show-toplevel)/infra"

errors=0

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

if [ "${errors}" -gt 0 ]; then
  echo ""
  echo "Terraform checks failed (${errors} error(s)). Commit aborted."
  exit 1
fi

echo "=== All Terraform checks passed ==="
