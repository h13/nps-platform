#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

push_secret() {
  local secret_name="$1"
  local tf_output="$2"
  shift 2
  local extra_args=("$@")

  echo "Pushing ${secret_name}${extra_args[*]:+ (${extra_args[*]})}..."
  if ! terraform output -raw "${tf_output}" | base64 -d | wrangler secret put "${secret_name}" "${extra_args[@]}"; then
    echo "ERROR: Failed to push ${secret_name} ${extra_args[*]}" >&2
    return 1
  fi
}

echo "=== Pushing SA keys to Workers secrets ==="

# Sheets SA key → GOOGLE_SERVICE_ACCOUNT_JSON
push_secret GOOGLE_SERVICE_ACCOUNT_JSON sheets_sa_key_json
push_secret GOOGLE_SERVICE_ACCOUNT_JSON sheets_sa_key_json --env staging

echo "=== Done ==="
