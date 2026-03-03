# Infrastructure (Terraform)

NPS Platform のインフラをコードで管理する。

## 管理対象

- **GCP**: API 有効化、Service Account、SA Key、IAM Binding
- **Cloudflare**: D1 Database、Cron Trigger

Workers スクリプトのデプロイは `wrangler deploy` で行う（Terraform 管理外）。

## 前提条件

- Terraform >= 1.5
- [TFLint](https://github.com/terraform-linters/tflint)
- [Trivy](https://github.com/aquasecurity/trivy)
- GCP 認証済み（`gcloud auth application-default login`）
- GCS バケット `nps-platform-tfstate` を事前作成

```bash
gcloud storage buckets create gs://nps-platform-tfstate \
  --location=asia-northeast1 \
  --uniform-bucket-level-access
gcloud storage buckets update gs://nps-platform-tfstate --versioning
```

## 初回セットアップ

```bash
cd infra

# 1. terraform.tfvars を作成（example をコピーして値を設定）
cp terraform.tfvars.example terraform.tfvars
vim terraform.tfvars

# 2. Cloudflare API token を環境変数で渡す
export TF_VAR_cloudflare_api_token="your-token"

# 3. 初期化
make init

# 4. GCP リソース + D1 のみ先に適用（Cron は Workers 未デプロイのためスキップ）
terraform apply \
  -target=google_project_service.sheets \
  -target=google_project_service.bigquery \
  -target=google_project_service.iam \
  -target=google_service_account.sheets_reader \
  -target=google_service_account.bigquery_writer \
  -target=google_service_account_key.sheets_reader \
  -target=google_service_account_key.bigquery_writer \
  -target=google_project_iam_member.bigquery_data_editor \
  -target=google_project_iam_member.bigquery_job_user \
  -target=cloudflare_d1_database.production \
  -target=cloudflare_d1_database.staging

# 5. wrangler.toml の database_id を更新
terraform output d1_production_id
terraform output d1_staging_id
# → wrangler.toml に反映

# 6. Workers デプロイ
cd .. && wrangler deploy && cd infra

# 7. Cron Trigger を含め全リソース適用
terraform apply

# 8. SA key を Workers secrets に登録
make secrets

# 9. Spreadsheet 共有
./scripts/setup-spreadsheet.sh
```

## 日常ワークフロー

```bash
# 差分確認
make plan

# 適用
make apply

# lint + security チェック
make check
```

## 既存リソースの import

手動作成済みのリソースを state に取り込む:

```bash
# D1
terraform import cloudflare_d1_database.production <account_id>/<database_id>

# Service Account
terraform import google_service_account.sheets_reader \
  projects/nps-platform-489110/serviceAccounts/nps-spreadsheet-reader@nps-platform-489110.iam.gserviceaccount.com
```

## 鍵ローテーション

```bash
# 古い鍵を taint して再生成
terraform taint google_service_account_key.sheets_reader
terraform taint google_service_account_key.bigquery_writer
terraform apply

# Workers secrets を更新
make secrets
```
