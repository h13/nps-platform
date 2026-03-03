#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SA_EMAIL=$(terraform output -raw sheets_reader_email)

cat <<EOF
=== Google Spreadsheet セットアップ ===

以下のサービスアカウントに Spreadsheet の閲覧権限を付与してください:

  ${SA_EMAIL}

手順:
  1. Google Spreadsheet を開く
  2. 右上の「共有」をクリック
  3. 上記メールアドレスを追加（閲覧者権限）
  4. wrangler.toml の SPREADSHEET_ID を Spreadsheet ID に更新

EOF
