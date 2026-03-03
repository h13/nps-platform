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
