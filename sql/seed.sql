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
