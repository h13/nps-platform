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
  BQ_SERVICE_ACCOUNT_JSON: string;
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
  answers: Record<string, unknown>;
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
