-- E2E / Lighthouse テスト用シードデータ
-- 有効なトークンを持つ survey request を挿入

INSERT OR REPLACE INTO survey_config (id, config_json, synced_at) VALUES (1, '{
  "survey_title": "E2E Test Survey",
  "thanks_message": "Thank you",
  "widget_primary_color": "#2563EB",
  "widget_bg_color": "#FFFFFF",
  "widget_text_color": "#1F2937",
  "questions": [
    {
      "id": "q_nps",
      "type": "nps_score",
      "text": "How likely are you to recommend?",
      "required": true,
      "display_order": 1,
      "min_label": "Not at all",
      "max_label": "Extremely likely"
    }
  ]
}', datetime('now'));

INSERT OR IGNORE INTO nps_survey_requests (
  token, opportunity_id, account_id, account_name, stage,
  contact_email, contact_name, status, expires_at
) VALUES (
  'e2e-lighthouse-token',
  'OPP-E2E-001', 'ACC-E2E-001', 'E2E Test Account', 'Closed Won',
  'e2e@test.example.com', 'E2E User', 'sent',
  datetime('now', '+30 days')
);
