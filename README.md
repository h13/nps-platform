# NPS Platform

[![CI](https://github.com/h13/nps-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/h13/nps-platform/actions/workflows/ci.yml)
[![E2E](https://github.com/h13/nps-platform/actions/workflows/e2e.yml/badge.svg)](https://github.com/h13/nps-platform/actions/workflows/e2e.yml)
[![codecov](https://codecov.io/gh/h13/nps-platform/graph/badge.svg)](https://codecov.io/gh/h13/nps-platform)
[![Terraform](https://github.com/h13/nps-platform/actions/workflows/terraform.yml/badge.svg)](https://github.com/h13/nps-platform/actions/workflows/terraform.yml)
[![CodeQL](https://github.com/h13/nps-platform/actions/workflows/dynamic/github-code-scanning/codeql/badge.svg)](https://github.com/h13/nps-platform/actions/workflows/dynamic/github-code-scanning/codeql)

NPS（Net Promoter Score）計測プラットフォーム。Cloudflare Workers + D1 で構築し、Salesforce 連携・メール配信・LP ウィジェットを単一プロジェクトで完結させる。

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

- Node.js 24+（`.node-version` で指定済み）
- pnpm 10.30+（`packageManager` フィールドで指定済み、`corepack enable` で自動インストール）
- [tfenv](https://github.com/tfutils/tfenv) + [TFLint](https://github.com/terraform-linters/tflint) + [Trivy](https://github.com/aquasecurity/trivy)（インフラ管理時のみ）

### ローカル起動

```bash
git clone git@github.com:h13/nps-platform.git
cd nps-platform
pnpm install          # 依存インストール + husky の Git hooks セットアップ
pnpm run db:setup     # D1 スキーマ作成 + シードデータ投入
```

`.dev.vars` をプロジェクトルートに作成（`.gitignore` 済み）：

```
NPS_API_KEY=local-dev-api-key
SENDGRID_API_KEY=SG.test-key
GOOGLE_SERVICE_ACCOUNT_JSON={}
SLACK_WEBHOOK_URL=https://hooks.slack.com/test
```

起動：

```bash
pnpm run dev           # http://localhost:8787
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

## 開発コマンド

### Lint / Format / 型チェック

```bash
pnpm exec biome check .       # lint + format を一括チェック
pnpm exec biome check --write . # 自動修正
pnpm run typecheck             # tsc (src + widget + e2e)
pnpm run knip                  # 未使用コード検出
```

### テスト

```bash
pnpm test              # Workers 単体テスト (Vitest + Cloudflare pool)
pnpm run test:widget   # Widget 単体テスト (Vitest + jsdom)
pnpm run test:watch    # ウォッチモード
pnpm run test:coverage # カバレッジレポート付き
pnpm run test:e2e      # E2E テスト (Playwright + wrangler dev)
```

カバレッジしきい値: statements / branches / functions / lines すべて 80%

### コミット規約

[Conventional Commits](https://www.conventionalcommits.org/) を採用。husky + commitlint で強制。

```
feat: 新機能
fix: バグ修正
refactor: リファクタリング
docs: ドキュメント
test: テスト
chore: 雑務
perf: パフォーマンス改善
ci: CI/CD
```

pre-commit フック（lint-staged）で `biome check --write` が自動実行される。

## インフラ管理

GCP / Cloudflare リソースは Terraform で宣言的に管理する。詳細は [infra/README.md](./infra/README.md) を参照。

```bash
# ツールインストール（macOS）
brew install tfenv tflint trivy

cd infra
tfenv install          # .terraform-version に従い自動インストール
make hooks             # pre-commit フック（Biome + Terraform fmt/lint/trivy）
make check             # CI 相当のローカルチェック（fmt + lint + trivy + shellcheck）
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
pnpm run deploy            # Production
pnpm run deploy:staging    # Staging
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

## CI

| ワークフロー | トリガー | 内容 |
|-------------|---------|------|
| **CI** (`ci.yml`) | push / PR to main | commitlint, biome check, knip, typecheck, tests, coverage, bundle size, audit, actionlint |
| **E2E** (`e2e.yml`) | push / PR to main | Playwright E2E テスト, Lighthouse CI |
| **Terraform** (`terraform.yml`) | infra/** 変更時 | fmt, tflint, trivy, shellcheck |
| **CodeQL** | GitHub Default Setup | javascript-typescript セキュリティ分析 |

Branch protection: `check` + `e2e` が必須。force push 禁止。PR 経由でのマージが必要。

## プロジェクト構成

```
├── src/                       # Workers ソース
│   ├── index.ts               # ルーティング / Cron ハンドラ
│   ├── types.ts               # 型定義 (Env, etc.)
│   ├── middleware/auth.ts     # Bearer Token 認証
│   ├── routes/                # API ルートハンドラ
│   ├── services/              # SendGrid, Spreadsheet 同期
│   └── templates/             # HTML テンプレート
├── widget/                    # LP Widget (Shadow DOM)
│   ├── src/                   # Widget ソース
│   ├── dist/                  # ビルド済み Static Assets
│   ├── tsconfig.json          # DOM 型用
│   └── vitest.config.ts       # Widget テスト設定
├── e2e/                       # Playwright E2E テスト
│   └── tsconfig.json          # Playwright 型用
├── sql/
│   ├── schema.sql             # D1 スキーマ
│   ├── seed.sql               # シードデータ
│   └── seed-e2e.sql           # E2E/Lighthouse テスト用データ
├── infra/                     # Terraform (GCP + Cloudflare)
├── .github/
│   ├── workflows/             # CI, E2E, Terraform
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── wrangler.toml              # Workers 設定
├── biome.json                 # Linter / Formatter 設定
├── tsconfig.json              # Workers 型用
└── SPEC.md                    # 詳細実装仕様書
```

## 詳細仕様

アーキテクチャ・DB スキーマ・各フェーズの実装仕様は [SPEC.md](./SPEC.md) を参照。
