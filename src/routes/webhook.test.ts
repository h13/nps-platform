import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupTestDb } from '../test-helpers/setup-db';

const API_KEY = env.NPS_API_KEY;

function webhookRequest(body: Record<string, unknown>, apiKey?: string) {
  return SELF.fetch('https://example.com/nps/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey ?? API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  opportunity_id: 'opp-001',
  account_id: 'acc-001',
  account_name: 'Test Corp',
  stage: 'closed_won',
  contact_email: 'test@example.com',
  contact_name: 'Test User',
};

describe('POST /nps/webhook', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await env.DB.exec('DELETE FROM nps_survey_requests');
    await env.DB.exec('DELETE FROM nps_responses');
    await env.DB.exec('DELETE FROM survey_config');

    // Seed config so email template can render
    const config = JSON.stringify({
      survey_title: 'NPS Survey',
      email_subject_template: '{survey_title}',
      widget_primary_color: '#2563EB',
    });
    await env.DB.prepare(
      `INSERT INTO survey_config (id, config_json, updated_at) VALUES (1, ?, datetime('now'))`
    ).bind(config).run();

    // Mock global fetch to intercept SendGrid calls
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.sendgrid.com')) {
        return new Response(null, { status: 202 });
      }
      return new Response('Not mocked', { status: 500 });
    });
  });

  it('returns 401 without auth header', async () => {
    const res = await SELF.fetch('https://example.com/nps/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong API key', async () => {
    const res = await webhookRequest(validPayload, 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await webhookRequest({ opportunity_id: 'opp-001' });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Missing required fields');
  });

  it('returns 400 for invalid email format', async () => {
    const res = await webhookRequest({ ...validPayload, contact_email: 'not-an-email' });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Invalid contact_email');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await SELF.fetch('https://example.com/nps/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 202 and creates survey request', async () => {
    const res = await webhookRequest(validPayload);
    expect(res.status).toBe(202);
    const body = await res.json() as { status: string; token: string };
    expect(body.status).toBe('accepted');
    expect(body.token).toBeTruthy();

    // Verify DB record
    const row = await env.DB.prepare(
      'SELECT * FROM nps_survey_requests WHERE token = ?'
    ).bind(body.token).first();
    expect(row).not.toBeNull();
  });

  it('deduplicates requests for same opportunity+stage', async () => {
    const res1 = await webhookRequest(validPayload);
    expect(res1.status).toBe(202);

    const res2 = await webhookRequest(validPayload);
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as { status: string; reason: string };
    expect(body2.status).toBe('skipped');
    expect(body2.reason).toBe('duplicate');
  });

  it('allows different stages for same opportunity', async () => {
    const res1 = await webhookRequest(validPayload);
    expect(res1.status).toBe(202);

    const res2 = await webhookRequest({ ...validPayload, stage: 'renewal' });
    expect(res2.status).toBe(202);
  });

  it('sets status to sent when email succeeds', async () => {
    const res = await webhookRequest(validPayload);
    const body = await res.json() as { token: string };

    const row = await env.DB.prepare(
      'SELECT status FROM nps_survey_requests WHERE token = ?'
    ).bind(body.token).first<{ status: string }>();
    expect(row!.status).toBe('sent');
  });

  it('sets status to failed when email fails', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.sendgrid.com')) {
        return new Response('Bad Request', { status: 400 });
      }
      return new Response('Not mocked', { status: 500 });
    });

    const res = await webhookRequest(validPayload);
    expect(res.status).toBe(202);
    const body = await res.json() as { token: string };

    const row = await env.DB.prepare(
      'SELECT status, error_message FROM nps_survey_requests WHERE token = ?'
    ).bind(body.token).first<{ status: string; error_message: string }>();
    expect(row!.status).toBe('failed');
    expect(row!.error_message).toContain('SendGrid 400');
  });

  it('uses default config when survey_config is empty', async () => {
    await env.DB.exec('DELETE FROM survey_config');

    const res = await webhookRequest(validPayload);
    expect(res.status).toBe(202);
  });
});

describe('retryFailedEmails', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await env.DB.exec('DELETE FROM nps_survey_requests');
    await env.DB.exec('DELETE FROM nps_responses');
    await env.DB.exec('DELETE FROM survey_config');

    const config = JSON.stringify({
      survey_title: 'NPS Survey',
      email_subject_template: '{survey_title}',
      widget_primary_color: '#2563EB',
    });
    await env.DB.prepare(
      `INSERT INTO survey_config (id, config_json, updated_at) VALUES (1, ?, datetime('now'))`
    ).bind(config).run();
  });

  it('retries failed emails and updates status on success', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.sendgrid.com')) {
        return new Response(null, { status: 202 });
      }
      return new Response('Not mocked', { status: 500 });
    });

    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    await env.DB.prepare(
      `INSERT INTO nps_survey_requests
       (token, opportunity_id, account_id, account_name, stage, contact_email, contact_name, status, expires_at, send_attempts)
       VALUES ('retry-tok', 'opp-r1', 'acc-r1', 'Retry Corp', 'closed_won', 'retry@example.com', 'Retry User', 'failed', ?, 1)`
    ).bind(expiresAt).run();

    const { retryFailedEmails } = await import('./webhook');
    await retryFailedEmails(env);

    const row = await env.DB.prepare(
      'SELECT status, send_attempts FROM nps_survey_requests WHERE token = ?'
    ).bind('retry-tok').first<{ status: string; send_attempts: number }>();
    expect(row!.status).toBe('sent');
    expect(row!.send_attempts).toBe(2);
  });

  it('does nothing when no failed emails exist', async () => {
    const { retryFailedEmails } = await import('./webhook');
    await retryFailedEmails(env);
    // No error thrown
  });

  it('increments send_attempts on retry failure', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.sendgrid.com')) {
        return new Response('Error', { status: 500 });
      }
      return new Response('Not mocked', { status: 500 });
    });

    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    await env.DB.prepare(
      `INSERT INTO nps_survey_requests
       (token, opportunity_id, account_id, account_name, stage, contact_email, contact_name, status, expires_at, send_attempts)
       VALUES ('fail-tok', 'opp-f1', 'acc-f1', 'Fail Corp', 'closed_won', 'fail@example.com', 'Fail User', 'failed', ?, 1)`
    ).bind(expiresAt).run();

    const { retryFailedEmails } = await import('./webhook');
    await retryFailedEmails(env);

    const row = await env.DB.prepare(
      'SELECT status, send_attempts FROM nps_survey_requests WHERE token = ?'
    ).bind('fail-tok').first<{ status: string; send_attempts: number }>();
    expect(row!.status).toBe('failed');
    expect(row!.send_attempts).toBe(2);
  });
});
