# Infrastructure (Terraform)

NPS Platform のインフラをコードで管理する。

## 管理対象

| リソース | Provider | Terraform 管理 |
|---------|----------|---------------|
| GCP API 有効化 (Sheets, BigQuery, IAM) | `hashicorp/google` | Yes |
| Service Account (Sheets Reader / BigQuery Writer) | `hashicorp/google` | Yes |
| SA Key 生成 | `hashicorp/google` | Yes |
| BigQuery Dataset (`nps_responses`) | `hashicorp/google` | Yes |
| IAM Binding (BigQuery jobUser) | `hashicorp/google` | Yes |
| D1 Database (prod + staging) | `cloudflare/cloudflare` | Yes |
| Cron Trigger (prod + staging) | `cloudflare/cloudflare` | Yes |
| Workers Script デプロイ | — | No（`wrangler deploy`） |
| Workers Secrets | — | No（`wrangler secret put`） |
| Google Spreadsheet 作成 | — | No（手動） |

## 前提条件

- [tfenv](https://github.com/tfutils/tfenv)（`.terraform-version` で自動切替）
- [TFLint](https://github.com/terraform-linters/tflint)
- [Trivy](https://github.com/aquasecurity/trivy)
- GCP 認証済み（`gcloud auth application-default login`）
- GCS バケット `nps-platform-tfstate` を事前作成

```bash
# ツールインストール（macOS）
brew install tfenv tflint trivy

# Terraform バージョン（.terraform-version で指定済み）
cd infra && tfenv install

# State 用 GCS バケット
gcloud storage buckets create gs://nps-platform-tfstate \
  --location=asia-northeast1 \
  --uniform-bucket-level-access
gcloud storage buckets update gs://nps-platform-tfstate --versioning
```

## ローカル開発環境

```bash
cd infra

# 1. pre-commit フックをインストール
make hooks

# 2. terraform.tfvars を作成
cp terraform.tfvars.example terraform.tfvars
vim terraform.tfvars

# 3. Cloudflare API token を環境変数で渡す
export TF_VAR_cloudflare_api_token="your-token"

# 4. 初期化
make init
```

### Makefile ターゲット

| コマンド | 内容 |
|---------|------|
| `make init` | `terraform init` |
| `make plan` | `terraform plan` |
| `make apply` | `terraform apply` |
| `make output` | `terraform output` |
| `make secrets` | SA key を Workers secrets に登録 |
| `make fmt` | フォーマットチェック |
| `make validate` | 構文 + プロバイダスキーマ検証（要認証） |
| `make lint` | TFLint（google plugin） |
| `make security` | Trivy config scan |
| `make check` | fmt + lint + security を一括実行 |
| `make hooks` | pre-commit フックをインストール |

### Pre-commit フック

`make hooks` で `pre-commit.local` フックをインストールする。`infra/*.tf` がステージされたコミットに対して自動実行される：

1. `terraform fmt -check` — フォーマット検証
2. `tflint` — GCP リソース妥当性チェック
3. `trivy config` — セキュリティスキャン（HIGH/CRITICAL）

tflint / trivy が未インストールの場合は SKIP される（ブロックしない）。

## 初回セットアップ

Cron Trigger は Workers スクリプトが存在しないと作れないため、段階的に適用する：

```bash
cd infra

# 1. GCP リソース + D1 のみ先に適用
terraform apply \
  -target=google_project_service.sheets \
  -target=google_project_service.bigquery \
  -target=google_project_service.iam \
  -target=google_service_account.sheets_reader \
  -target=google_service_account.bigquery_writer \
  -target=google_service_account_key.sheets_reader \
  -target=google_service_account_key.bigquery_writer \
  -target=google_bigquery_dataset.nps \
  -target=google_project_iam_member.bigquery_job_user \
  -target=cloudflare_d1_database.production \
  -target=cloudflare_d1_database.staging

# 2. wrangler.toml の database_id を更新
terraform output d1_production_id
terraform output d1_staging_id
# → wrangler.toml に反映

# 3. Workers デプロイ
cd .. && wrangler deploy && cd infra

# 4. Cron Trigger を含め全リソース適用
terraform apply

# 5. SA key を Workers secrets に登録
make secrets

# 6. Spreadsheet 共有
./scripts/setup-spreadsheet.sh
```

## 日常ワークフロー

```bash
# 差分確認
make plan

# 適用
make apply

# lint + security チェック（CI 相当）
make check
```

## 既存リソースの import

手動作成済みのリソースを state に取り込む：

```bash
# D1
terraform import cloudflare_d1_database.production <account_id>/<database_id>

# Service Account
terraform import google_service_account.sheets_reader \
  projects/<project-id>/serviceAccounts/nps-spreadsheet-reader@<project-id>.iam.gserviceaccount.com
```

## 鍵ローテーション

```bash
# sa_key_rotation_id を変更して再生成
# terraform.tfvars: sa_key_rotation_id = "2026-04"
terraform apply

# Workers secrets を更新
make secrets
```

## CI

`.github/workflows/terraform.yml` で `infra/**` 変更時に自動実行：

```
terraform fmt -check → TFLint → Trivy config scan (SARIF → Code Scanning)
```

`terraform validate` / `terraform plan` はプロバイダ認証が必要なため CI ではスキップ。
