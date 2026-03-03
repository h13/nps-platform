import { verifyBearerToken } from '../middleware/auth';
import type { Env, WebhookPayload } from '../types';

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const authError = verifyBearerToken(request, env);
  if (authError) return authError;

  let body: WebhookPayload;
  try {
    body = await request.json() as WebhookPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { opportunity_id, account_id, account_name, stage, contact_email, contact_name } = body;
  if (!opportunity_id || !account_id || !account_name || !stage || !contact_email || !contact_name) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: opportunity_id, account_id, account_name, stage, contact_email, contact_name' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const duplicate = await env.DB.prepare(
    `SELECT id FROM nps_survey_requests
     WHERE opportunity_id = ? AND stage = ? AND status IN ('queued', 'sent', 'opened')
     LIMIT 1`
  ).bind(opportunity_id, stage).first();

  if (duplicate) {
    return new Response(
      JSON.stringify({ status: 'skipped', reason: 'duplicate' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = crypto.randomUUID();
  const expiryDays = parseInt(env.NPS_SURVEY_EXPIRY_DAYS, 10) || 30;
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO nps_survey_requests
     (token, opportunity_id, account_id, account_name, stage, contact_email, contact_name, amount, close_date, owner_name, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`
  ).bind(
    token,
    opportunity_id,
    account_id,
    account_name,
    stage,
    contact_email,
    contact_name,
    body.amount ?? null,
    body.close_date ?? null,
    body.owner_name ?? null,
    expiresAt
  ).run();

  // Phase 3 でメール送信を統合。現時点では queued のまま返却。

  return new Response(
    JSON.stringify({ status: 'accepted', token }),
    { status: 202, headers: { 'Content-Type': 'application/json' } }
  );
}
