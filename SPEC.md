# NPS Platform 実装仕様書

> **目的**: NPS 計測に特化した軽量プラットフォーム。
> **対象読者**: Claude Code（実装 AI エージェント）

---

## ゴール

1. Salesforce 商談ステージ変更 → NPS アンケートメール自動送信（SendGrid）
2. LP にポップアップで NPS アンケートを表示・収集
3. 回答データを D1 に蓄積
4. アンケートの設問・選択肢・設定は Google Spreadsheet で管理（非エンジニアが編集可能）

## 非ゴール

- チャネル横断での同一人物紐付け（チャネル別集計で十分）
- リアルタイム分析（日次バッチで十分）

---

## 技術スタック

| レイヤー | 技術 | 理由 |
|----------|------|------|
| ランタイム | Cloudflare Workers | サーバーレス、無料枠で十分、`wrangler deploy` 一発 |
| DB | Cloudflare D1 (SQLite) | Workers ネイティブ、SQL が使える、無料枠 5GB |
| 設問管理 | Google Spreadsheet + Sheets API | 非エンジニアが編集可能、変更履歴が自動で残る |
| メール送信 | SendGrid API v3 | `fetch()` で直接呼べる、Workers と相性が良い |
| LP Widget | Vanilla JS (Shadow DOM) | 依存ゼロ、Workers Static Assets で同一ドメイン配信 |
| バッチ | Workers Cron Trigger | Spreadsheet → D1 Sync / 失敗メールリトライ |
| 認証 | Bearer Token（固定 API キー） | Workers Secret に格納、SF Webhook 認証用 |

---

## アーキテクチャ概要

```
[Google Spreadsheet]
  │ 設問・選択肢・設定マスタ
  │ Cron Trigger（1時間ごと）で D1 にキャッシュ同期
  ▼
[Cloudflare Workers]  ─── 単一プロジェクト、単一ドメインで全て完結
  │
  ├─ POST /nps/webhook          … SF webhook 受信 → D1 保存 → SendGrid メール送信
  ├─ GET  /nps/form/:token      … アンケートフォーム HTML（設問を config から動的生成）
  ├─ POST /nps/response         … 回答受付（メール経由 / LP 共通）
  ├─ GET  /nps/widget.js        … LP 埋め込みスクリプト（Static Assets）
  ├─ GET  /nps/config            … 設問・選択肢・設定を一括返却
  │
  ├─ [Cron: 毎時] Spreadsheet → D1 config 同期
  └─ [Cron: 毎日 AM 3:00 JST] 失敗メールリトライ
  │
  └─→ [D1]

[Salesforce]
  │ Record-Triggered Flow → HTTP Callout
  │ Authorization: Bearer {NPS_API_KEY}
  └─→ POST /nps/webhook
```

---

## ディレクトリ構成

```
nps-platform/
├── src/
│   ├── index.ts                  # Workers エントリポイント（ルーティング）
│   ├── routes/
│   │   ├── webhook.ts            # POST /nps/webhook
│   │   ├── form.ts               # GET  /nps/form/:token
│   │   ├── response.ts           # POST /nps/response
│   │   └── config.ts             # GET  /nps/config
│   ├── services/
│   │   ├── sendgrid.ts           # SendGrid API v3 ラッパー
│   │   ├── token.ts              # UUID v4 トークン生成
│   │   └── spreadsheet-sync.ts   # Cron: Spreadsheet → D1 config 同期
│   ├── middleware/
│   │   └── auth.ts               # Bearer Token 検証
│   ├── templates/
│   │   ├── form.html             # アンケートフォーム HTML（設問は config JSON から動的生成）
│   │   ├── expired.html          # 有効期限切れページ
│   │   ├── already-responded.html # 回答済みページ
│   │   └── email.html            # メール本文テンプレート
│   ├── types.ts                  # 型定義
│   └── constants.ts              # 定数
├── widget/
│   ├── src/
│   │   ├── widget.ts             # エントリポイント
│   │   ├── trigger.ts            # スクロール率・滞在時間監視
│   │   ├── popup.ts              # Shadow DOM レンダリング（設問は config JSON から動的生成）
│   │   └── style.css             # ポップアップ CSS
│   └── dist/
│       └── nps/
│           └── widget.js         # ビルド成果物
├── sql/
│   ├── schema.sql                # D1 テーブル定義
│   └── seed.sql                  # survey_config 初期データ（Spreadsheet 未接続時のフォールバック）
├── test/
│   ├── routes/
│   │   ├── webhook.test.ts
│   │   ├── form.test.ts
│   │   ├── response.test.ts
│   │   └── config.test.ts
│   └── services/
│       ├── sendgrid.test.ts
│       └── spreadsheet-sync.test.ts
├── wrangler.toml
├── package.json
├── tsconfig.json
└── README.md
```

---

## wrangler.toml

```toml
name = "nps-platform"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[triggers]
crons = [
  "0 * * * *",     # 毎時 00分: Spreadsheet → D1 config 同期
  "0 18 * * *"     # 毎日 18:00 UTC (AM 3:00 JST): 失敗メールリトライ
]

[[d1_databases]]
binding = "DB"
database_name = "nps-platform"
database_id = "<prod-db-id>"

[assets]
directory = "./widget/dist"

# 環境変数（非秘匿）- Production
[vars]
NPS_BASE_URL = "https://nps.example.com"
NPS_SURVEY_EXPIRY_DAYS = "30"
SENDGRID_FROM_ADDRESS = "noreply@nps.example.com"
SENDGRID_FROM_NAME = "NPS アンケート"
SPREADSHEET_ID = "<Google Spreadsheet ID>"

# --- Staging 環境 ---
[env.staging]
name = "nps-platform-staging"

[env.staging.triggers]
crons = [
  "0 * * * *",
  "0 18 * * *"
]

[[env.staging.d1_databases]]
binding = "DB"
database_name = "nps-platform-staging"
database_id = "<staging-db-id>"

[env.staging.vars]
NPS_BASE_URL = "https://nps-staging.example.com"
NPS_SURVEY_EXPIRY_DAYS = "30"
SENDGRID_FROM_ADDRESS = "noreply-staging@nps.example.com"
SENDGRID_FROM_NAME = "NPS アンケート [STAGING]"
SPREADSHEET_ID = "<Staging 用 Spreadsheet ID>"

# 秘匿情報は wrangler secret で登録（環境ごとに設定）
# Production:
#   wrangler secret put NPS_API_KEY
#   wrangler secret put SENDGRID_API_KEY
#   wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
#   wrangler secret put SLACK_WEBHOOK_URL
# Staging:
#   wrangler secret put NPS_API_KEY --env staging
#   wrangler secret put SENDGRID_API_KEY --env staging
#   wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --env staging
#   wrangler secret put SLACK_WEBHOOK_URL --env staging
```

---

## Google Spreadsheet 設計

### 前提

- Google Service Account でアクセス（Sheets API v4）
- Service Account のメールアドレスに Spreadsheet の閲覧権限を付与
- Spreadsheet の変更履歴が自動で残る（設問変更の監査ログとして機能）

### シート1: questions（設問定義）

| 列名 | 型 | 説明 | 例 |
|------|-----|------|-----|
| id | TEXT | 設問の一意識別子。`POST /nps/response` の answers キーになる | `q_nps` |
| type | TEXT | 設問タイプ（後述） | `nps_score` |
| text | TEXT | 設問文 | `この製品をおすすめする可能性は？` |
| required | BOOLEAN | 必須かどうか | `TRUE` |
| display_order | INTEGER | 表示順（昇順） | `1` |
| is_active | BOOLEAN | 有効/無効 | `TRUE` |
| placeholder | TEXT | free_text のプレースホルダー | `具体的にお聞かせください...` |
| max_length | INTEGER | free_text の最大文字数 | `500` |
| min_value | INTEGER | rating の最小値 | `1` |
| max_value | INTEGER | rating の最大値 | `5` |
| min_label | TEXT | nps_score / rating のラベル（左端） | `全く思わない` |
| max_label | TEXT | nps_score / rating のラベル（右端） | `非常にそう思う` |

**設問タイプ一覧**:

| type | UI | answers に格納される値 |
|------|----|----------------------|
| `nps_score` | 0-10 ボタン | 整数（0-10）。1フォームに1つだけ。`nps_score` カラムにも書き込み |
| `free_text` | textarea | 文字列 |
| `single_select` | セレクトボックス（ドロップダウン） | 選択肢の value（文字列1つ） |
| `multi_select` | チェックボックス群 | 選択肢の value 配列 |
| `radio` | ラジオボタン | 選択肢の value（文字列1つ） |
| `rating` | ★ or 数値ボタン | 整数（min_value 〜 max_value） |

**Spreadsheet 上のデータ例**:

| id | type | text | required | display_order | is_active | placeholder | max_length | min_value | max_value | min_label | max_label |
|----|------|------|----------|---------------|-----------|-------------|------------|-----------|-----------|-----------|-----------|
| q_nps | nps_score | この製品を友人や同僚におすすめする可能性はどのくらいですか？ | TRUE | 1 | TRUE | | | | | 全く思わない | 非常にそう思う |
| q_satisfaction | rating | 今回の対応にどの程度満足していますか？ | TRUE | 2 | TRUE | | | 1 | 5 | 不満 | 非常に満足 |
| q_category | multi_select | 関連するカテゴリを選択してください | FALSE | 3 | TRUE | | | | | | |
| q_contact_method | single_select | ご希望の連絡方法を選択してください | FALSE | 4 | TRUE | | | | | | |
| q_department | radio | 主にやり取りした部署はどこですか？ | FALSE | 5 | TRUE | | | | | | |
| q_reason | free_text | スコアの理由をお聞かせください | FALSE | 6 | TRUE | 具体的にお聞かせください... | 500 | | | | |
| q_improve | free_text | 改善してほしい点はありますか？ | FALSE | 7 | FALSE | | 1000 | | | | |

### シート2: options（選択肢定義）

`single_select`, `multi_select`, `radio` タイプの設問で使用。

| 列名 | 型 | 説明 | 例 |
|------|-----|------|-----|
| question_id | TEXT | 対応する設問の id | `q_category` |
| value | TEXT | 送信される値（answers に格納） | `product` |
| label | TEXT | 表示ラベル | `製品品質` |
| display_order | INTEGER | 表示順 | `1` |
| is_active | BOOLEAN | 有効/無効 | `TRUE` |

**Spreadsheet 上のデータ例**:

| question_id | value | label | display_order | is_active |
|-------------|-------|-------|---------------|-----------|
| q_category | product | 製品品質 | 1 | TRUE |
| q_category | support | サポート対応 | 2 | TRUE |
| q_category | price | 価格 | 3 | TRUE |
| q_category | usability | 使いやすさ | 4 | TRUE |
| q_category | docs | ドキュメント | 5 | TRUE |
| q_category | onboarding | 導入プロセス | 6 | TRUE |
| q_category | other | その他 | 7 | TRUE |
| q_contact_method | email | メール | 1 | TRUE |
| q_contact_method | phone | 電話 | 2 | TRUE |
| q_contact_method | chat | チャット | 3 | TRUE |
| q_department | sales | 営業 | 1 | TRUE |
| q_department | cs | カスタマーサポート | 2 | TRUE |
| q_department | tech | テクニカルサポート | 3 | TRUE |

### シート3: config（グローバル設定）

| key | value |
|-----|-------|
| survey_title | ご利用に関するアンケート |
| thanks_message | ご回答ありがとうございました |
| email_subject_template | 【{account_name}】{survey_title}（1分で完了） |
| widget_primary_color | #2563EB |
| widget_bg_color | #FFFFFF |
| widget_text_color | #1F2937 |

---

## Spreadsheet → D1 同期

### src/services/spreadsheet-sync.ts

**処理フロー**:
```
1. Google Service Account の JWT 認証で access_token 取得（Web Crypto API で署名）
2. Sheets API v4 で 3 シートを一括取得:
   GET https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values:batchGet
     ?ranges=questions!A:L&ranges=options!A:E&ranges=config!A:B
3. 各シートをパースして JSON に変換:
   - questions シート → 1行目をヘッダーとして、2行目以降をオブジェクト配列に
   - options シート → question_id でグループ化して questions にマージ
   - config シート → key-value のオブジェクトに
   - is_active = FALSE の行はフィルタで除外
   - display_order 昇順でソート
4. 結合した config JSON を D1 の survey_config テーブルに UPSERT
5. エラー時は Slack 通知。D1 の既存データは残す（フォールバック）
```

**Google Sheets API の認証**:
```typescript
// Service Account JSON から JWT を生成
// Header: { alg: "RS256", typ: "JWT" }
// Payload: {
//   iss: service_account_email,
//   scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
//   aud: "https://oauth2.googleapis.com/token",
//   iat: now,
//   exp: now + 3600
// }
// Web Crypto API (crypto.subtle.sign) で RS256 署名
// POST https://oauth2.googleapis.com/token で access_token を取得
```

**D1 キャッシュテーブル**: `survey_config`（後述）

**同期頻度**: 毎時（Cron `0 * * * *`）。Spreadsheet 変更後、最大1時間で反映。

---

## D1 スキーマ

### sql/schema.sql

```sql
-- 設問・選択肢・設定のキャッシュ（Spreadsheet から同期）
CREATE TABLE IF NOT EXISTS survey_config (
    id          INTEGER PRIMARY KEY CHECK (id = 1),  -- 常に1行
    config_json TEXT    NOT NULL,                     -- GET /nps/config のレスポンスそのもの
    synced_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- アンケート送信リクエスト（SF Webhook → メール送信管理）
CREATE TABLE IF NOT EXISTS nps_survey_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    token           TEXT    NOT NULL UNIQUE,
    -- Salesforce コンテキスト
    opportunity_id  TEXT    NOT NULL,
    account_id      TEXT    NOT NULL,
    account_name    TEXT    NOT NULL,
    stage           TEXT    NOT NULL,
    contact_email   TEXT    NOT NULL,
    contact_name    TEXT    NOT NULL,
    amount          REAL,
    close_date      TEXT,
    owner_name      TEXT,
    -- ステータス
    status          TEXT    NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'sending', 'sent', 'opened', 'responded', 'expired', 'failed')),
    sent_at         TEXT,
    opened_at       TEXT,
    responded_at    TEXT,
    expires_at      TEXT    NOT NULL,
    error_message   TEXT,
    send_attempts   INTEGER NOT NULL DEFAULT 0,
    -- タイムスタンプ
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_survey_requests_token ON nps_survey_requests(token);
CREATE INDEX IF NOT EXISTS idx_survey_requests_status ON nps_survey_requests(status);
CREATE INDEX IF NOT EXISTS idx_survey_requests_stage ON nps_survey_requests(stage);
CREATE INDEX IF NOT EXISTS idx_survey_requests_dedup ON nps_survey_requests(opportunity_id, stage, status);

-- 回答データ
CREATE TABLE IF NOT EXISTS nps_responses (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_request_id INTEGER,
    channel           TEXT    NOT NULL CHECK (channel IN ('email', 'lp')),
    -- NPS スコア（集計用に独立カラム。nps_score 設問がない場合は NULL）
    nps_score         INTEGER CHECK (nps_score IS NULL OR nps_score BETWEEN 0 AND 10),
    segment           TEXT    CHECK (segment IS NULL OR segment IN ('promoter', 'passive', 'detractor')),
    -- 全設問の回答（JSON）
    answers           TEXT    NOT NULL,
    -- LP メタデータ（channel = 'lp' の場合のみ）
    page_url          TEXT,
    scroll_percent    INTEGER,
    dwell_seconds     INTEGER,
    user_agent        TEXT,
    -- SF コンテキスト（channel = 'email' の場合、survey_request から引き継ぎ）
    stage             TEXT,
    opportunity_id    TEXT,
    -- タイムスタンプ
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    synced_at         TEXT,

    FOREIGN KEY (survey_request_id) REFERENCES nps_survey_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_responses_channel ON nps_responses(channel);
CREATE INDEX IF NOT EXISTS idx_responses_segment ON nps_responses(segment);
CREATE INDEX IF NOT EXISTS idx_responses_nps_score ON nps_responses(nps_score);
CREATE INDEX IF NOT EXISTS idx_responses_stage ON nps_responses(stage);
CREATE INDEX IF NOT EXISTS idx_responses_created ON nps_responses(created_at);
CREATE INDEX IF NOT EXISTS idx_responses_synced ON nps_responses(synced_at);
```

**D1 固有の注意点**:
- `GENERATED ALWAYS AS` は D1 未サポート。`segment` はアプリケーション側で `calculateSegment()` で算出して INSERT 時に書き込む
- `ENUM` は D1 未サポート。`TEXT` + `CHECK` 制約で代替
- タイムスタンプは `TEXT` 型で ISO 8601 形式（`datetime('now')` は UTC）
- `survey_config` は常に1行。`id = 1` の `CHECK` 制約で強制

### sql/seed.sql

Spreadsheet 未接続時のフォールバック用初期データ:

```sql
INSERT OR REPLACE INTO survey_config (id, config_json, synced_at) VALUES (1, '{
  "survey_title": "ご利用に関するアンケート",
  "thanks_message": "ご回答ありがとうございました",
  "widget_primary_color": "#2563EB",
  "widget_bg_color": "#FFFFFF",
  "widget_text_color": "#1F2937",
  "questions": [
    {
      "id": "q_nps",
      "type": "nps_score",
      "text": "この製品を友人や同僚におすすめする可能性はどのくらいですか？",
      "required": true,
      "display_order": 1,
      "min_label": "全く思わない",
      "max_label": "非常にそう思う"
    },
    {
      "id": "q_category",
      "type": "multi_select",
      "text": "関連するカテゴリを選択してください",
      "required": false,
      "display_order": 2,
      "options": [
        {"value": "product", "label": "製品品質"},
        {"value": "support", "label": "サポート対応"},
        {"value": "price", "label": "価格"},
        {"value": "usability", "label": "使いやすさ"},
        {"value": "docs", "label": "ドキュメント"},
        {"value": "other", "label": "その他"}
      ]
    },
    {
      "id": "q_reason",
      "type": "free_text",
      "text": "理由をお聞かせください",
      "required": false,
      "display_order": 3,
      "placeholder": "具体的にお聞かせください...",
      "max_length": 500
    }
  ]
}', datetime('now'));
```

### D1 セットアップコマンド

```bash
wrangler d1 create nps-platform
# → 出力された database_id を wrangler.toml に設定
wrangler d1 execute nps-platform --file=./sql/schema.sql
wrangler d1 execute nps-platform --file=./sql/seed.sql
```

---

## 型定義

### src/types.ts

```typescript
export interface Env {
  DB: D1Database;
  NPS_API_KEY: string;
  NPS_BASE_URL: string;
  NPS_SURVEY_EXPIRY_DAYS: string;
  SENDGRID_API_KEY: string;
  SENDGRID_FROM_ADDRESS: string;
  SENDGRID_FROM_NAME: string;
  SPREADSHEET_ID: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  SLACK_WEBHOOK_URL: string;
}

// --- Spreadsheet → config ---

export type QuestionType = 'nps_score' | 'free_text' | 'single_select' | 'multi_select' | 'radio' | 'rating';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  display_order: number;
  // free_text
  placeholder?: string;
  max_length?: number;
  // rating
  min_value?: number;
  max_value?: number;
  // nps_score / rating
  min_label?: string;
  max_label?: string;
  // single_select / multi_select / radio
  options?: QuestionOption[];
}

export interface SurveyConfig {
  survey_title: string;
  thanks_message: string;
  email_subject_template: string;
  widget_primary_color: string;
  widget_bg_color: string;
  widget_text_color: string;
  questions: Question[];
}

// --- Webhook ---

export interface WebhookPayload {
  opportunity_id: string;
  account_id: string;
  account_name: string;
  stage: string;
  contact_email: string;
  contact_name: string;
  amount?: number;
  close_date?: string;
  owner_name?: string;
}

// --- Response ---

export interface NpsResponsePayload {
  token?: string;
  channel?: 'lp';
  answers: Record<string, unknown>;  // { "q_nps": 8, "q_category": ["product"], "q_reason": "..." }
  // LP メタデータ
  page_url?: string;
  scroll_percent?: number;
  dwell_seconds?: number;
  user_agent?: string;
}

export type SurveyStatus = 'queued' | 'sending' | 'sent' | 'opened' | 'responded' | 'expired' | 'failed';
export type NpsSegment = 'promoter' | 'passive' | 'detractor';
export type Channel = 'email' | 'lp';

export function calculateSegment(score: number): NpsSegment {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}
```

---

## ルーティング

### src/index.ts

```typescript
import { handleWebhook } from './routes/webhook';
import { handleForm } from './routes/form';
import { handleResponse } from './routes/response';
import { handleConfig } from './routes/config';
import { handleSpreadsheetSync } from './services/spreadsheet-sync';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS（LP Widget からのリクエスト用）
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      if (method === 'POST' && path === '/nps/webhook') {
        return handleWebhook(request, env);
      }
      if (method === 'GET' && path.startsWith('/nps/form/')) {
        const token = path.replace('/nps/form/', '');
        return handleForm(token, env);
      }
      if (method === 'POST' && path === '/nps/response') {
        return handleResponse(request, env);
      }
      if (method === 'GET' && path === '/nps/config') {
        return handleConfig(env);
      }
      // widget.js は Static Assets が自動配信

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      console.error(e);
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case '0 * * * *':
        // 毎時: Spreadsheet → D1 config 同期
        ctx.waitUntil(handleSpreadsheetSync(env));
        break;
      case '0 18 * * *':
        // 毎日 18:00 UTC (AM 3:00 JST): 失敗メールリトライ
        ctx.waitUntil(retryFailedEmails(env));
        break;
    }
  },
};
```

---

## API 仕様

### POST /nps/webhook

**認証**: `Authorization: Bearer {NPS_API_KEY}`

**リクエスト**:
```json
{
  "opportunity_id": "006xxxxxxxxxxxx",
  "account_id": "001xxxxxxxxxxxx",
  "account_name": "株式会社サンプル",
  "stage": "Closed Won",
  "contact_email": "tanaka@example.com",
  "contact_name": "田中太郎",
  "amount": 1500000,
  "close_date": "2026-03-15",
  "owner_name": "佐藤花子"
}
```

**処理**:
1. Bearer Token 検証 → 不一致なら `401 Unauthorized`
2. `opportunity_id`, `contact_email`, `stage` の必須チェック → 不足なら `400 Bad Request`
3. 重複チェック: 同一 `opportunity_id` + `stage` で status が `queued` or `sent` or `opened` → スキップ `200 OK`（冪等）
4. `token` を `crypto.randomUUID()` で生成
5. `nps_survey_requests` に INSERT（status: `queued`, expires_at: 30日後）
6. D1 から `survey_config.config_json` を取得 → `email_subject_template` で件名生成
7. SendGrid API v3 でメール送信
   - 成功 → status を `sent` に更新、`sent_at` を記録
   - 失敗 → status を `failed` に更新、`error_message` と `send_attempts` を記録
8. `202 Accepted` を返却

**レスポンス**:
```json
{ "status": "accepted", "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

重複スキップ時:
```json
{ "status": "skipped", "reason": "duplicate" }
```

**リトライ**: Cron Trigger（日次）で `status = 'failed' AND send_attempts < 3` のレコードを再送信。

---

### GET /nps/form/:token

**処理**:
1. `token` で `nps_survey_requests` を検索 → なければ `404`
2. `expires_at` < 現在時刻 → `expired.html`（status も `expired` に更新）
3. `status = 'responded'` → `already-responded.html`
4. `status` が `sent` → `opened` に更新、`opened_at` を記録
5. D1 から `survey_config.config_json` を取得
6. `form.html` テンプレートに config JSON + token を埋め込んで返却

**レスポンス**: `200 OK`（`Content-Type: text/html`）

**form.html の要件**:
- config JSON の `questions` 配列をループして、`type` に応じた UI 要素を動的生成
- hidden: `token`
- 送信先: `POST /nps/response`（fetch 送信、ページ遷移なし）
- `required: true` の設問は送信前にクライアントバリデーション
- レスポンシブ対応（モバイル優先）
- config の `survey_title`, `thanks_message`, カラー設定を反映

**type → UI マッピング**:
| type | 描画する UI |
|------|------------|
| nps_score | 0-10 ボタン行。min_label / max_label を両端に表示 |
| rating | min_value 〜 max_value のボタン行。min_label / max_label を両端に表示 |
| free_text | textarea。placeholder と max_length を適用 |
| single_select | `<select>` ドロップダウン。options から `<option>` を生成 |
| multi_select | チェックボックス群。options からチェックボックスを生成 |
| radio | ラジオボタン群。options からラジオボタンを生成 |

---

### POST /nps/response

**リクエスト（メール経由）**:
```json
{
  "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "answers": {
    "q_nps": 8,
    "q_satisfaction": 4,
    "q_category": ["product", "support"],
    "q_contact_method": "email",
    "q_reason": "サポートが丁寧でした"
  }
}
```

**リクエスト（LP 経由）**:
```json
{
  "channel": "lp",
  "answers": {
    "q_nps": 6,
    "q_category": ["docs"],
    "q_reason": "ドキュメントがわかりにくい"
  },
  "page_url": "https://example.com/product",
  "scroll_percent": 72,
  "dwell_seconds": 45,
  "user_agent": "Mozilla/5.0 ..."
}
```

**処理**:
1. D1 から `survey_config.config_json` を取得
2. `answers` を config の `questions` 定義に基づいてバリデーション:
   - `required: true` の設問が未回答 → `400`
   - `nps_score` の値が 0-10 整数でない → `400`
   - `rating` の値が min_value 〜 max_value 整数でない → `400`
   - `single_select` / `radio` の値が options の value に含まれない → 無視（エラーにしない）
   - `multi_select` の各値が options の value に含まれない → 不正値のみ除外
   - `free_text` が max_length 超過 → 切り詰め
   - config に存在しない question_id のキー → 無視
3. `nps_score` 設問があれば `nps_score` カラムに値を抽出、`segment` を `calculateSegment()` で算出
4. チャネル判定:
   - `token` あり → メール経由。`channel = 'email'`、`stage` / `opportunity_id` を引き継ぎ
   - `token` なし → LP 経由。`channel = 'lp'`
5. `nps_responses` に INSERT（`answers` は JSON 文字列で保存）
6. メール経由: `nps_survey_requests.status = 'responded'`、`responded_at` を記録

**レスポンス**: `201 Created`
```json
{ "status": "created", "segment": "passive" }
```

segment が算出できない場合（nps_score 設問がない場合）:
```json
{ "status": "created", "segment": null }
```

CORS ヘッダー付与。

---

### GET /nps/config

D1 の `survey_config.config_json` をそのまま返す。

**レスポンス**: `200 OK`
```json
{
  "survey_title": "ご利用に関するアンケート",
  "thanks_message": "ご回答ありがとうございました",
  "email_subject_template": "【{account_name}】{survey_title}（1分で完了）",
  "widget_primary_color": "#2563EB",
  "widget_bg_color": "#FFFFFF",
  "widget_text_color": "#1F2937",
  "questions": [
    {
      "id": "q_nps",
      "type": "nps_score",
      "text": "この製品を友人や同僚におすすめする可能性はどのくらいですか？",
      "required": true,
      "display_order": 1,
      "min_label": "全く思わない",
      "max_label": "非常にそう思う"
    },
    {
      "id": "q_satisfaction",
      "type": "rating",
      "text": "今回の対応にどの程度満足していますか？",
      "required": true,
      "display_order": 2,
      "min_value": 1,
      "max_value": 5,
      "min_label": "不満",
      "max_label": "非常に満足"
    },
    {
      "id": "q_category",
      "type": "multi_select",
      "text": "関連するカテゴリを選択してください",
      "required": false,
      "display_order": 3,
      "options": [
        { "value": "product", "label": "製品品質" },
        { "value": "support", "label": "サポート対応" },
        { "value": "price", "label": "価格" },
        { "value": "usability", "label": "使いやすさ" },
        { "value": "docs", "label": "ドキュメント" },
        { "value": "other", "label": "その他" }
      ]
    },
    {
      "id": "q_contact_method",
      "type": "single_select",
      "text": "ご希望の連絡方法を選択してください",
      "required": false,
      "display_order": 4,
      "options": [
        { "value": "email", "label": "メール" },
        { "value": "phone", "label": "電話" },
        { "value": "chat", "label": "チャット" }
      ]
    },
    {
      "id": "q_reason",
      "type": "free_text",
      "text": "スコアの理由をお聞かせください",
      "required": false,
      "display_order": 6,
      "placeholder": "具体的にお聞かせください...",
      "max_length": 500
    }
  ]
}
```

CORS ヘッダー付与。`Cache-Control: public, max-age=300`（5分キャッシュ）。

---

### GET /nps/widget.js

Static Assets が自動配信。`widget/dist/nps/widget.js` → `https://nps.example.com/nps/widget.js`。

---

## SendGrid メール送信

### src/services/sendgrid.ts の実装要件

```typescript
// SendGrid API v3 Mail Send を fetch() で呼ぶ
// endpoint: https://api.sendgrid.com/v3/mail/send
// method: POST
// auth: Bearer {SENDGRID_API_KEY}
// 成功: status 202
// 失敗: { ok: false, error: string }
```

### メール件名

`survey_config` の `email_subject_template` を使用。プレースホルダー:
- `{account_name}` → webhook payload の account_name
- `{survey_title}` → config の survey_title
- `{contact_name}` → webhook payload の contact_name

### メール本文要件

- `{contact_name}` 様への宛名
- 簡潔な依頼文（3行以内）
- CTA ボタン: `{NPS_BASE_URL}/nps/form/{token}`
- 有効期限の表示
- 配信停止リンク（特定電子メール法準拠）
- レスポンシブ HTML（モバイル対応）
- config の `widget_primary_color` を CTA ボタンの色に使用

---

## LP Widget 仕様

### 埋め込みコード（LP 管理者に渡すもの）

```html
<script>
  window.NpsWidget = {
    endpoint: "https://nps.example.com",
    triggers: {
      scrollPercent: 60,
      dwellSeconds: 30,
      operator: "OR"
    },
    display: {
      cooldownDays: 90,
      maxShowCount: 3,
      position: "bottom-right",
      delay: 0
    }
  };
</script>
<script src="https://nps.example.com/nps/widget.js" async></script>
```

### 初期化フロー

```
1. スクリプトロード完了
2. window.NpsWidget の設定を読み取り
3. localStorage チェック
   - nps_responded_at が cooldownDays 以内 → 終了
   - nps_show_count が maxShowCount 以上 → 終了
4. GET {endpoint}/nps/config を fetch → config JSON 取得
5. トリガー監視開始
6. 条件達成 → display.delay ms 待機 → ポップアップ表示
```

### trigger.ts

**スクロール率**: `scroll イベント → (scrollY + innerHeight) / scrollHeight * 100`
**滞在時間**: 初期化時の `Date.now()` からの経過秒数を 1秒ごとにチェック
**operator**: `OR` = どちらか先 / `AND` = 両方

### popup.ts

**Shadow DOM レンダリング**:
- `document.createElement('div')` → `attachShadow({ mode: 'closed' })`
- config JSON の `questions` をループして type に応じた UI を動的生成
- `position: fixed`、`z-index: 2147483647`
- config の `widget_primary_color`, `widget_bg_color`, `widget_text_color` を CSS 変数として適用

**type → UI マッピング**: form.html と同一のロジック（共通化推奨）

**NPS スコアボタン配色**: 0-6 赤系 / 7-8 黄系 / 9-10 緑系

**送信**:
```
1. answers オブジェクトを組み立て
2. POST {endpoint}/nps/response
   body: { channel: "lp", answers, page_url, scroll_percent, dwell_seconds, user_agent }
3. localStorage に nps_responded_at = Date.now()
4. config.thanks_message を表示 → 2秒後フェードアウト
```

**閉じる**: `nps_show_count` インクリメント → ポップアップ削除

### ビルド

```bash
pnpm exec esbuild widget/src/widget.ts --bundle --minify --target=es2020 --outfile=widget/dist/nps/widget.js
```

---

## Salesforce Flow 依頼テンプレート

```
■ 依頼内容: NPS アンケート自動送信用の Flow 作成

■ トリガー
  - オブジェクト: Opportunity
  - イベント: レコード更新時
  - 条件: StageName が以下のいずれかに変更されたとき
    - Closed Won
    - Proposal
    - Negotiation
    （※ 対象ステージは後日追加の可能性あり）

■ アクション
  - HTTP Callout（外部サービス）で以下を POST
  - URL: https://nps.example.com/nps/webhook
  - Method: POST
  - Headers:
    - Authorization: Bearer {後日共有}
    - Content-Type: application/json
  - Body:
    {
      "opportunity_id": "{!Opportunity.Id}",
      "account_id": "{!Opportunity.AccountId}",
      "account_name": "{!Opportunity.Account.Name}",
      "stage": "{!Opportunity.StageName}",
      "contact_email": "{!Opportunity.PrimaryContact.Email}",
      "contact_name": "{!Opportunity.PrimaryContact.Name}",
      "amount": "{!Opportunity.Amount}",
      "close_date": "{!Opportunity.CloseDate}",
      "owner_name": "{!Opportunity.Owner.Name}"
    }

■ エラーハンドリング
  - Fault Path でエラーログを残す（カスタムオブジェクト or Platform Event）
  - HTTP ステータスが 202 以外はエラーとする

■ 提供するもの
  - エンドポイント URL
  - Bearer Token
```

---

## 環境変数・シークレット

### wrangler.toml [vars]（非秘匿）

| 変数名 | 値 | 説明 |
|--------|-----|------|
| NPS_BASE_URL | https://nps.example.com | 公開 URL |
| NPS_SURVEY_EXPIRY_DAYS | 30 | アンケートリンク有効期限（日） |
| SENDGRID_FROM_ADDRESS | noreply@nps.example.com | 送信元メールアドレス |
| SENDGRID_FROM_NAME | NPS アンケート | 送信元表示名 |
| SPREADSHEET_ID | (Spreadsheet ID) | 設問管理 Spreadsheet の ID |

### wrangler secret（秘匿）

| 変数名 | 説明 |
|--------|------|
| NPS_API_KEY | SF Webhook 認証用 Bearer Token |
| SENDGRID_API_KEY | SendGrid API キー |
| GOOGLE_SERVICE_ACCOUNT_JSON | Sheets API 認証用サービスアカウント JSON |
| SLACK_WEBHOOK_URL | エラー通知用 Slack Webhook URL |

---

## 実装順序

### Phase 1: プロジェクト初期化 + DB + Config

1. `pnpm create cloudflare@latest nps-platform`（TypeScript テンプレート）
2. `wrangler.toml` 設定（staging 環境含む）
3. `.dev.vars` 作成（ローカル用シークレット）
4. `.gitignore` 設定
5. ローカル D1 作成 → スキーマ適用 → シードデータ投入（`wrangler d1 execute --local`）
6. `src/types.ts` 作成
7. `GET /nps/config` 実装（D1 から config_json を返すだけ）
8. `wrangler dev` で起動 → `curl http://localhost:8787/nps/config` で確認

### Phase 2: API コア

1. `src/index.ts` ルーティング
2. `src/middleware/auth.ts` Bearer Token 検証
3. `POST /nps/webhook`（認証 → バリデーション → D1 INSERT → 202。メール送信はまだ）
4. `GET /nps/form/:token`（D1 検索 → config JSON 埋め込み → HTML 返却。設問は JS で動的生成）
5. `POST /nps/response`（config ベースの動的バリデーション → D1 INSERT → 201）
6. テスト: `wrangler dev` + curl で一連フロー確認

### Phase 3: メール送信

1. SendGrid アカウント設定（ドメイン認証、API キー発行）
2. `src/services/sendgrid.ts` 実装
3. `src/templates/email.html` 作成
4. webhook ルートにメール送信を統合
5. Cron でリトライ処理追加
6. テスト: webhook → メール受信 → フォーム回答の E2E

### Phase 4: LP Widget

1. `widget/src/trigger.ts`
2. `widget/src/popup.ts`（config JSON から動的に UI 生成）
3. `widget/src/widget.ts`（初期化 → config fetch → トリガー → ポップアップ）
4. esbuild ビルド
5. テスト: ローカル HTML でトリガー・回答送信確認

### Phase 5: Spreadsheet 同期

1. Google Cloud でサービスアカウント作成、Sheets API 有効化
2. Spreadsheet 作成、シート3つのヘッダー行設定
3. サービスアカウントに閲覧権限付与
4. `src/services/spreadsheet-sync.ts` 実装（JWT 認証 → Sheets API → D1 UPSERT）
5. Cron Trigger 動作確認
6. Spreadsheet で設問変更 → 1時間以内に反映されることを確認

### Phase 6: SF Flow 連携 + 本番

1. ステージング環境セットアップ（「ステージング環境セットアップ」セクション参照）
2. `wrangler deploy --env staging` → Staging で全機能確認
3. SF 管理者に依頼テンプレート送付 + Staging 用 Bearer Token 共有
4. SF Sandbox → Staging Workers で E2E 疎通テスト
5. Production 初回セットアップ（「デプロイフロー」セクション参照）
6. `wrangler deploy` → Production デプロイ
7. SF 本番 Flow 有効化 → 本番 E2E 確認

---

## テスト方針

### 単体テスト（Vitest）

| 対象 | テストケース |
|------|-------------|
| auth middleware | 正しい Token → pass、不正 → 401、ヘッダーなし → 401 |
| webhook | 必須パラメータ不足 → 400、正常 → 202 + D1 確認、重複 → 200 skipped |
| form | 有効 token → 200 HTML、期限切れ → expired、回答済み → already-responded、不正 → 404 |
| response | required 未回答 → 400、nps_score 範囲外 → 400、正常メール → 201 + status 更新、正常 LP → 201 |
| response バリデーション | config にない question_id → 無視、single_select 不正 value → 無視、free_text 超過 → 切り詰め |
| calculateSegment | 0-6 → detractor、7-8 → passive、9-10 → promoter |
| config | D1 から config_json 返却確認 |
| spreadsheet-sync | Sheets API レスポンスの正常パース、config_json への変換、D1 UPSERT |

### E2E テスト

```
1. POST /nps/webhook → 202 → D1 レコード確認
2. SendGrid sandbox でメール送信確認
3. GET /nps/form/{token} → 200 + 設問が config に基づいて描画
4. POST /nps/response (token + answers) → 201 + survey_request.status = responded
5. POST /nps/response (LP + answers) → 201 + channel = lp
6. Spreadsheet に設問追加 → Cron 実行 → GET /nps/config に反映確認
```

---

## 環境構成

### 3 環境の使い分け

| 環境 | Workers 名 | D1 | SendGrid | 用途 |
|------|-----------|-----|----------|------|
| **local** | - | `.wrangler/state/` のローカル SQLite | sandbox mode（メール不送信） | 開発・デバッグ |
| **staging** | nps-platform-staging | nps-platform-staging | テスト用 API Key | SF Flow 疎通テスト、LP Widget 結合テスト |
| **production** | nps-platform | nps-platform | 本番 API Key | 本番運用 |

### ローカル開発環境セットアップ

```bash
# 1. リポジトリ clone
git clone git@github.com:<org>/nps-platform.git
cd nps-platform

# 2. 依存インストール
pnpm install

# 3. ローカル D1 にスキーマ・シードデータ適用
wrangler d1 execute nps-platform --local --file=./sql/schema.sql
wrangler d1 execute nps-platform --local --file=./sql/seed.sql

# 4. Widget ビルド
pnpm exec esbuild widget/src/widget.ts --bundle --minify --target=es2020 --outfile=widget/dist/nps/widget.js

# 5. ローカル起動
wrangler dev

# → http://localhost:8787 で全エンドポイントが動作
# → D1 は .wrangler/state/v3/d1/ にローカル SQLite として作成される
# → Cron Trigger はローカルでは自動実行されない（手動テスト方法は後述）
```

**ローカル環境の特徴**:
- D1 はローカルの SQLite。外部接続不要で全 API が動作する
- `wrangler dev` はホットリロード対応。ファイル保存で即反映
- SendGrid API は実際に呼ばれる。テスト時は `.dev.vars` に sandbox 用キーを設定するか、環境変数で送信をスキップする仕組みを入れる
- Spreadsheet 同期はローカルでは seed.sql のフォールバックデータが使われる

### .dev.vars（ローカル用シークレット）

`wrangler dev` で使うローカル専用のシークレットファイル。`.gitignore` に追加すること。

```
NPS_API_KEY=local-dev-api-key-for-testing
SENDGRID_API_KEY=SG.sandbox-key-here
GOOGLE_SERVICE_ACCOUNT_JSON={}
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
```

### ローカルでの Cron Trigger テスト

Cron は `wrangler dev` では自動実行されない。手動でテストする方法:

```bash
# Spreadsheet → D1 同期をテスト
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"

# 失敗メールリトライをテスト
curl "http://localhost:8787/__scheduled?cron=0+18+*+*+*"
```

### ローカルでの curl テスト例

```bash
# Webhook テスト
curl -X POST http://localhost:8787/nps/webhook \
  -H "Authorization: Bearer local-dev-api-key-for-testing" \
  -H "Content-Type: application/json" \
  -d '{
    "opportunity_id": "006TEST000000001",
    "account_id": "001TEST000000001",
    "account_name": "テスト株式会社",
    "stage": "Closed Won",
    "contact_email": "test@example.com",
    "contact_name": "テスト太郎"
  }'

# Config 取得
curl http://localhost:8787/nps/config

# フォーム表示（token は webhook レスポンスから取得）
curl http://localhost:8787/nps/form/<token>

# 回答送信（メール経由）
curl -X POST http://localhost:8787/nps/response \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<token>",
    "answers": {
      "q_nps": 8,
      "q_category": ["product", "support"],
      "q_reason": "テスト回答です"
    }
  }'

# 回答送信（LP 経由）
curl -X POST http://localhost:8787/nps/response \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "lp",
    "answers": {
      "q_nps": 6,
      "q_reason": "LP からのテスト"
    },
    "page_url": "https://example.com/test",
    "scroll_percent": 72,
    "dwell_seconds": 45
  }'
```

### ローカル D1 の中身を確認

```bash
# テーブル一覧
wrangler d1 execute nps-platform --local --command="SELECT name FROM sqlite_master WHERE type='table';"

# survey_requests 確認
wrangler d1 execute nps-platform --local --command="SELECT * FROM nps_survey_requests;"

# responses 確認
wrangler d1 execute nps-platform --local --command="SELECT * FROM nps_responses;"

# config 確認
wrangler d1 execute nps-platform --local --command="SELECT * FROM survey_config;"
```

---

## ステージング環境セットアップ

```bash
# 1. Staging 用 D1 作成
wrangler d1 create nps-platform-staging
# → 出力された database_id を wrangler.toml の env.staging.d1_databases に設定

# 2. スキーマ・シードデータ適用
wrangler d1 execute nps-platform-staging --file=./sql/schema.sql
wrangler d1 execute nps-platform-staging --file=./sql/seed.sql

# 3. Staging 用シークレット設定
wrangler secret put NPS_API_KEY --env staging
wrangler secret put SENDGRID_API_KEY --env staging
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --env staging
wrangler secret put SLACK_WEBHOOK_URL --env staging

# 4. Staging にデプロイ
wrangler deploy --env staging

# → https://nps-platform-staging.<account>.workers.dev でアクセス可能
# → カスタムドメイン: https://nps-staging.example.com
```

**Staging 環境のポイント**:
- D1 は Production とは完全に別インスタンス
- SendGrid は同じアカウントでも API Key を分けることを推奨（テストメールの分離）
- Spreadsheet も Staging 用を別途作成（本番の設問を壊さない）
- SF Flow の疎通テストは Staging の Sandbox 環境と接続

---

## デプロイフロー

### 日常の開発サイクル

```bash
# 1. feature ブランチで開発
git checkout -b feature/add-rating-question

# 2. ローカルで動作確認
wrangler dev

# 3. テスト実行
pnpm test

# 4. Staging にデプロイして確認
wrangler deploy --env staging

# 5. PR → レビュー → main マージ

# 6. Production デプロイ
wrangler deploy
```

### Production 初回セットアップ

```bash
# 1. Production 用 D1 作成
wrangler d1 create nps-platform
# → database_id を wrangler.toml に設定

# 2. スキーマ・シードデータ適用
wrangler d1 execute nps-platform --file=./sql/schema.sql
wrangler d1 execute nps-platform --file=./sql/seed.sql

# 3. シークレット設定
wrangler secret put NPS_API_KEY
wrangler secret put SENDGRID_API_KEY
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
wrangler secret put SLACK_WEBHOOK_URL

# 4. デプロイ
wrangler deploy

# 5. カスタムドメイン設定（Cloudflare Dashboard で）
#    nps.example.com → nps-platform Workers にルーティング

# 6. 動作確認
curl https://nps.example.com/nps/config
```

### D1 マイグレーション

スキーマ変更時は直接 SQL を実行:

```bash
# Staging
wrangler d1 execute nps-platform-staging --command="ALTER TABLE nps_responses ADD COLUMN new_field TEXT;"

# Production（Staging で確認後）
wrangler d1 execute nps-platform --command="ALTER TABLE nps_responses ADD COLUMN new_field TEXT;"
```

将来的にマイグレーションが増えたら `sql/migrations/` ディレクトリに連番管理:

```
sql/
├── schema.sql
├── seed.sql
└── migrations/
    ├── 001_add_new_field.sql
    └── 002_add_index.sql
```

---

## Claude Code での使い方

### 初回セットアップ

```bash
# 1. リポジトリ作成
mkdir nps-platform && cd nps-platform
git init

# 2. スペックを配置（本ファイルをダウンロードして配置）
cp ~/Downloads/nps-platform-spec.md ./SPEC.md

# 3. Claude Code 起動
claude
```

### Phase ごとの指示例

**Phase 1**:
```
SPEC.md を読んで Phase 1 を実行して。
wrangler.toml、sql/schema.sql、sql/seed.sql、src/types.ts、
GET /nps/config のルートを作成して、wrangler dev で動作確認できる状態にして。
```

**Phase 2**:
```
SPEC.md の Phase 2 を実行して。
webhook, form, response, config の全ルートを実装して。
curl で一連のフロー（webhook → form → response）が動くことを確認して。
```

**Phase 3**:
```
SPEC.md の Phase 3 を実行して。
SendGrid のメール送信を webhook に統合して。
.dev.vars に SENDGRID_API_KEY を設定して E2E で確認して。
```

**Phase 4**:
```
SPEC.md の Phase 4 を実行して。
widget の trigger.ts、popup.ts、widget.ts を実装して。
config JSON から動的にフォームを生成する popup を Shadow DOM で描画して。
esbuild でビルドして、ローカルの HTML に埋め込んでテストして。
```

**Phase 5**:
```
SPEC.md の Phase 5 を実行して。
Spreadsheet → D1 の同期処理を実装して。
Google Service Account の JWT 認証を Web Crypto API で実装して。
```

### 注意点

- `SPEC.md` はルートに置くこと。Claude Code が自動でコンテキストとして読む
- Phase ごとに「動作確認できる状態」を求めると、壊れにくい
- テストコードも各 Phase で一緒に書かせると後が楽
- wrangler.toml の `database_id` はプレースホルダーのままなので、実際の D1 作成後に置換が必要

---

## .gitignore

```
node_modules/
.wrangler/
.dev.vars
widget/dist/
*.log
```

---

## コスト試算（月間 10,000 件）

| 項目 | 月額 |
|------|------|
| Cloudflare Workers | $0（無料枠: 10万 req/日） |
| Cloudflare D1 | $0（無料枠: 5GB, 500万 reads/日） |
| SendGrid | $0〜$19.95（Free: 100通/日 / Essentials: 50,000通/月） |
| Google Sheets API | $0（無料枠: 300 req/分） |
| Google Spreadsheet | $0 |
| ドメイン | ~$10/年 |
| **合計** | **$0 〜 $20/月** |
