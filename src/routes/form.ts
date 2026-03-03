import type { Env } from '../types';
import { renderFormHtml } from '../templates/form';
import { renderExpiredHtml } from '../templates/expired';
import { renderAlreadyRespondedHtml } from '../templates/already-responded';

interface SurveyRequest {
  id: number;
  token: string;
  status: string;
  expires_at: string;
  contact_name: string;
  account_name: string;
}

export async function handleForm(token: string, env: Env): Promise<Response> {
  if (!token) {
    return new Response('Not Found', { status: 404 });
  }

  const row = await env.DB.prepare(
    'SELECT id, token, status, expires_at, contact_name, account_name FROM nps_survey_requests WHERE token = ?'
  ).bind(token).first<SurveyRequest>();

  if (!row) {
    return new Response('Not Found', { status: 404 });
  }

  if (new Date(row.expires_at) < new Date()) {
    if (row.status !== 'expired') {
      await env.DB.prepare(
        "UPDATE nps_survey_requests SET status = 'expired', updated_at = datetime('now') WHERE id = ?"
      ).bind(row.id).run();
    }
    return new Response(renderExpiredHtml(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (row.status === 'responded') {
    return new Response(renderAlreadyRespondedHtml(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (row.status === 'sent') {
    await env.DB.prepare(
      "UPDATE nps_survey_requests SET status = 'opened', opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).bind(row.id).run();
  }

  const config = await env.DB.prepare(
    'SELECT config_json FROM survey_config WHERE id = 1'
  ).first<{ config_json: string }>();

  const configJson = config?.config_json ?? '{}';

  return new Response(renderFormHtml(configJson, token), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
