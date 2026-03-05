import { verifyBearerToken } from '../middleware/auth';
import { sendMail } from '../services/sendgrid';
import { renderEmailHtml, renderEmailSubject } from '../templates/email';
import type { Env, SurveyConfig, WebhookPayload } from '../types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const DEFAULT_SURVEY_CONFIG: SurveyConfig = {
  survey_title: 'アンケート',
  thanks_message: '',
  email_subject_template: '{survey_title}',
  widget_primary_color: '#2563EB',
  widget_bg_color: '#FFFFFF',
  widget_text_color: '#1F2937',
  questions: [],
};

async function loadOrDefaultConfig(db: D1Database): Promise<SurveyConfig> {
  const row = await db
    .prepare('SELECT config_json FROM survey_config WHERE id = 1')
    .first<{ config_json: string }>();

  if (!row) return { ...DEFAULT_SURVEY_CONFIG };

  try {
    return JSON.parse(row.config_json) as SurveyConfig;
  } catch {
    return { ...DEFAULT_SURVEY_CONFIG };
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateWebhookPayload(body: WebhookPayload): Response | null {
  const { opportunity_id, account_id, account_name, stage, contact_email, contact_name } = body;
  if (
    !opportunity_id ||
    !account_id ||
    !account_name ||
    !stage ||
    !contact_email ||
    !contact_name
  ) {
    return new Response(
      JSON.stringify({
        error:
          'Missing required fields: opportunity_id, account_id, account_name, stage, contact_email, contact_name',
      }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  if (!EMAIL_REGEX.test(contact_email)) {
    return new Response(JSON.stringify({ error: 'Invalid contact_email format' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  return null;
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const authError = verifyBearerToken(request, env);
  if (authError) return authError;

  let body: WebhookPayload;
  try {
    body = (await request.json()) as WebhookPayload;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const validationError = validateWebhookPayload(body);
  if (validationError) return validationError;

  const { opportunity_id, account_id, account_name, stage, contact_email, contact_name } = body;

  const duplicate = await env.DB.prepare(
    `SELECT id FROM nps_survey_requests
     WHERE opportunity_id = ? AND stage = ? AND status IN ('queued', 'sent', 'opened')
     LIMIT 1`,
  )
    .bind(opportunity_id, stage)
    .first();

  if (duplicate) {
    return new Response(JSON.stringify({ status: 'skipped', reason: 'duplicate' }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  const token = crypto.randomUUID();
  const DEFAULT_EXPIRY_DAYS = 30;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const expiryDays = parseInt(env.NPS_SURVEY_EXPIRY_DAYS, 10) || DEFAULT_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + expiryDays * MS_PER_DAY).toISOString();

  await env.DB.prepare(
    `INSERT INTO nps_survey_requests
     (token, opportunity_id, account_id, account_name, stage, contact_email, contact_name, amount, close_date, owner_name, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
  )
    .bind(
      token,
      opportunity_id,
      account_id,
      account_name,
      stage,
      contact_email,
      contact_name,
      body.amount != null ? Math.round(body.amount) : null,
      body.close_date ?? null,
      body.owner_name ?? null,
      expiresAt,
    )
    .run();

  const config = await loadOrDefaultConfig(env.DB);

  const subject = renderEmailSubject(config.email_subject_template || '{survey_title}', {
    account_name,
    survey_title: config.survey_title,
    contact_name,
  });

  const formUrl = `${env.NPS_BASE_URL}/nps/form/${token}`;
  const htmlBody = renderEmailHtml({
    contactName: contact_name,
    surveyTitle: config.survey_title,
    formUrl,
    expiresAt,
    primaryColor: config.widget_primary_color || '#2563EB',
  });

  const result = await sendMail(env, {
    to: contact_email,
    toName: contact_name,
    subject,
    htmlBody,
  });

  if (result.ok) {
    await env.DB.prepare(
      "UPDATE nps_survey_requests SET status = 'sent', sent_at = datetime('now'), send_attempts = send_attempts + 1, updated_at = datetime('now') WHERE token = ?",
    )
      .bind(token)
      .run();
  } else {
    await env.DB.prepare(
      "UPDATE nps_survey_requests SET status = 'failed', error_message = ?, send_attempts = send_attempts + 1, updated_at = datetime('now') WHERE token = ?",
    )
      .bind(result.error ?? 'Unknown error', token)
      .run();
  }

  return new Response(JSON.stringify({ status: 'accepted', token }), {
    status: 202,
    headers: JSON_HEADERS,
  });
}

const MAX_SEND_ATTEMPTS = 3;
const RETRY_BATCH_SIZE = 50;

export async function retryFailedEmails(env: Env): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id, token, contact_email, contact_name, account_name, expires_at
     FROM nps_survey_requests
     WHERE status = 'failed' AND send_attempts < ${MAX_SEND_ATTEMPTS}
     LIMIT ${RETRY_BATCH_SIZE}`,
  ).all<{
    id: number;
    token: string;
    contact_email: string;
    contact_name: string;
    account_name: string;
    expires_at: string;
  }>();

  if (!rows.results || rows.results.length === 0) return;

  const config = await loadOrDefaultConfig(env.DB);

  for (const row of rows.results) {
    try {
      const subject = renderEmailSubject(config.email_subject_template || '{survey_title}', {
        account_name: row.account_name,
        survey_title: config.survey_title,
        contact_name: row.contact_name,
      });

      const formUrl = `${env.NPS_BASE_URL}/nps/form/${row.token}`;
      const htmlBody = renderEmailHtml({
        contactName: row.contact_name,
        surveyTitle: config.survey_title,
        formUrl,
        expiresAt: row.expires_at,
        primaryColor: config.widget_primary_color || '#2563EB',
      });

      const result = await sendMail(env, {
        to: row.contact_email,
        toName: row.contact_name,
        subject,
        htmlBody,
      });

      if (result.ok) {
        await env.DB.prepare(
          "UPDATE nps_survey_requests SET status = 'sent', sent_at = datetime('now'), send_attempts = send_attempts + 1, error_message = NULL, updated_at = datetime('now') WHERE id = ?",
        )
          .bind(row.id)
          .run();
      } else {
        await env.DB.prepare(
          "UPDATE nps_survey_requests SET error_message = ?, send_attempts = send_attempts + 1, updated_at = datetime('now') WHERE id = ?",
        )
          .bind(result.error ?? 'Unknown error', row.id)
          .run();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[retryFailedEmails] Error processing id=${row.id}:`, message);
    }
  }
}
