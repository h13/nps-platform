#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Pushing SA keys to Workers secrets ==="

# Sheets SA key → GOOGLE_SERVICE_ACCOUNT_JSON
echo "Pushing GOOGLE_SERVICE_ACCOUNT_JSON (production)..."
terraform output -raw sheets_sa_key_json | base64 -d | wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON

echo "Pushing GOOGLE_SERVICE_ACCOUNT_JSON (staging)..."
terraform output -raw sheets_sa_key_json | base64 -d | wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --env staging

# BigQuery SA key → BQ_SERVICE_ACCOUNT_JSON
echo "Pushing BQ_SERVICE_ACCOUNT_JSON (production)..."
terraform output -raw bigquery_sa_key_json | base64 -d | wrangler secret put BQ_SERVICE_ACCOUNT_JSON

echo "Pushing BQ_SERVICE_ACCOUNT_JSON (staging)..."
terraform output -raw bigquery_sa_key_json | base64 -d | wrangler secret put BQ_SERVICE_ACCOUNT_JSON --env staging

echo "=== Done ==="
