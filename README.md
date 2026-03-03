# NPS Platform

[![CI](https://github.com/h13/nps-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/h13/nps-platform/actions/workflows/ci.yml)
[![Terraform](https://github.com/h13/nps-platform/actions/workflows/terraform.yml/badge.svg)](https://github.com/h13/nps-platform/actions/workflows/terraform.yml)
[![CodeQL](https://github.com/h13/nps-platform/actions/workflows/dynamic/github-code-scanning/codeql/badge.svg)](https://github.com/h13/nps-platform/actions/workflows/dynamic/github-code-scanning/codeql)

Qualtrics 代替の NPS（Net Promoter Score）計測プラットフォーム。Cloudflare Workers + D1 で構築し、Salesforce 連携・メール配信・LP ウィジェットを単一プロジェクトで完結させる。

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| ランタイム | Cloudflare Workers |
| DB | Cloudflare D1 (SQLite) |
| 設問管理 | Google Spreadsheet → D1 同期 |
| メール送信 | SendGrid API v3 |
| LP Widget | Vanilla JS (Shadow DOM) |
| バッチ | Workers Cron Trigger |
| 認証 | Bearer Token（固定 API キー） |
| IaC | Terraform (GCP + Cloudflare) |

## セットアップ

### 前提条件

- Node.js 22+
- [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [tfenv](https://github.com/tfutils/tfenv) + [TFLint](https://github.com/terraform-linters/tflint) + [Trivy](https://github.com/aquasecurity/trivy)（インフラ管理時）

### インストール & ローカル起動

```bash
npm install
npm run db:setup   # D1 スキーマ作成 + シードデータ投入
npm run dev         # http://localhost:8787
```

### .dev.vars（ローカル開発用シークレット）

プロジェクトルートに `.dev.vars` を作成し、以下のキーを設定する：

```
NPS_API_KEY=<任意の API キー>
SENDGRID_API_KEY=<SendGrid API キー>
GOOGLE_SERVICE_ACCOUNT_JSON=<サービスアカウント JSON>
SLACK_WEBHOOK_URL=<Slack Incoming Webhook URL>
```

## API エンドポイント

| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| POST | `/nps/webhook` | Bearer Token | Salesforce Webhook 受信 → メール送信 |
| GET | `/nps/form/:token` | なし | アンケートフォーム HTML |
| POST | `/nps/response` | なし | 回答受付（メール経由 / LP 共通） |
| GET | `/nps/config` | なし | 設問・選択肢・設定を JSON で返却 |
| POST | `/nps/sync` | Bearer Token | Spreadsheet → D1 手動同期 |
| GET | `/nps/widget.js` | なし | LP 埋め込みウィジェット（Static Assets） |

### Cron Trigger

| スケジュール | 処理 |
|-------------|------|
| `0 * * * *` (毎時) | Spreadsheet → D1 config 同期 |
| `0 18 * * *` (AM 3:00 JST) | 失敗メールリトライ |

## 環境変数

### wrangler.toml vars（非秘匿）

| 変数名 | 説明 |
|--------|------|
| `NPS_BASE_URL` | プラットフォームの公開 URL |
| `NPS_SURVEY_EXPIRY_DAYS` | アンケート有効期限（日数） |
| `SENDGRID_FROM_ADDRESS` | 送信元メールアドレス |
| `SENDGRID_FROM_NAME` | 送信元表示名 |
| `SPREADSHEET_ID` | 設問管理用 Google Spreadsheet ID |

### Secrets（`wrangler secret put` で登録）

| 変数名 | 説明 |
|--------|------|
| `NPS_API_KEY` | Webhook / Sync 認証用 API キー |
| `SENDGRID_API_KEY` | SendGrid API キー |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Spreadsheet 読み取り用サービスアカウント |
| `SLACK_WEBHOOK_URL` | エラー通知用 Slack Webhook |

## テスト

```bash
npm test              # テスト実行
npm run test:watch    # ウォッチモード
npm run test:coverage # カバレッジレポート付き
```

カバレッジしきい値: statements 75% / branches 75% / functions 65% / lines 70%

## インフラ管理

GCP / Cloudflare リソースは Terraform で宣言的に管理する。詳細は [infra/README.md](./infra/README.md) を参照。

```bash
# ツールインストール（macOS）
brew install tfenv tflint trivy

cd infra
tfenv install          # .terraform-version に従い自動インストール
make hooks             # pre-commit フック（fmt + lint + trivy）
make check             # CI 相当のローカルチェック
```

## デプロイ

### Secrets 登録（初回のみ）

Terraform で SA Key を管理している場合は `make -C infra secrets` で一括登録できる。
それ以外の Secrets は手動で登録する：

```bash
# Production
wrangler secret put NPS_API_KEY
wrangler secret put SENDGRID_API_KEY
wrangler secret put SLACK_WEBHOOK_URL

# Staging
wrangler secret put NPS_API_KEY --env staging
wrangler secret put SENDGRID_API_KEY --env staging
wrangler secret put SLACK_WEBHOOK_URL --env staging

# SA Key（Terraform 管理の場合は make -C infra secrets で代替可）
# wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
```

### デプロイ実行

```bash
npm run deploy            # Production
npm run deploy:staging    # Staging
```

## Widget 埋め込み

LP に以下のスクリプトタグを追加する：

```html
<script
  src="https://<NPS_BASE_URL>/nps/widget.js"
  data-customer-id="顧客ID"
  data-channel="web"
  defer
></script>
```

## プロジェクト構成

```
├── src/
│   ├── index.ts              # ルーティング / Cron ハンドラ
│   ├── types.ts              # 型定義 (Env, etc.)
│   ├── middleware/
│   │   └── auth.ts           # Bearer Token 認証
│   ├── routes/
│   │   ├── webhook.ts        # POST /nps/webhook + リトライ
│   │   ├── form.ts           # GET /nps/form/:token
│   │   ├── response.ts       # POST /nps/response
│   │   └── config.ts         # GET /nps/config
│   ├── services/
│   │   ├── sendgrid.ts       # SendGrid メール送信
│   │   └── spreadsheet-sync.ts # Spreadsheet → D1 同期
│   └── templates/            # HTML テンプレート
├── widget/
│   ├── src/                  # Widget ソース
│   └── dist/                 # ビルド済み Static Assets
├── sql/
│   ├── schema.sql            # D1 スキーマ
│   └── seed.sql              # シードデータ
├── infra/
│   ├── *.tf                  # Terraform リソース定義
│   ├── Makefile              # init / plan / apply / check / hooks
│   ├── .terraform-version    # tfenv 用バージョン指定
│   └── scripts/              # secrets 登録 / Spreadsheet 共有 / pre-commit
├── wrangler.toml             # Workers 設定
├── vitest.config.ts          # テスト設定
└── SPEC.md                   # 詳細実装仕様書
```

## 詳細仕様

アーキテクチャ・DB スキーマ・各フェーズの実装仕様は [SPEC.md](./SPEC.md) を参照。
