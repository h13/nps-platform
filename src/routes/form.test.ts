import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupTestDb } from '../test-helpers/setup-db';

async function seedSurveyRequest(
  overrides: Partial<{
    token: string;
    status: string;
    expires_at: string;
  }> = {},
) {
  const token = overrides.token ?? 'test-token-123';
  const status = overrides.status ?? 'sent';
  const expiresAt = overrides.expires_at ?? new Date(Date.now() + 86400000).toISOString();

  await env.DB.prepare(
    `INSERT INTO nps_survey_requests
     (token, opportunity_id, account_id, account_name, stage, contact_email, contact_name, status, expires_at)
     VALUES (?, 'opp-1', 'acc-1', 'Test Corp', 'closed_won', 'test@example.com', 'Test User', ?, ?)`,
  )
    .bind(token, status, expiresAt)
    .run();
}

describe('GET /nps/form/:token', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await env.DB.exec('DELETE FROM nps_survey_requests');
    await env.DB.exec('DELETE FROM nps_responses');
    await env.DB.exec('DELETE FROM survey_config');

    await env.DB.prepare(
      `INSERT INTO survey_config (id, config_json, updated_at)
       VALUES (1, '{"survey_title":"Test","questions":[]}', datetime('now'))`,
    ).run();
  });

  it('returns 404 for empty token', async () => {
    const res = await SELF.fetch('https://example.com/nps/form/');
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown token', async () => {
    const res = await SELF.fetch('https://example.com/nps/form/nonexistent');
    expect(res.status).toBe(404);
  });

  it('renders expired page for expired survey', async () => {
    await seedSurveyRequest({
      token: 'expired-token',
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    });

    const res = await SELF.fetch('https://example.com/nps/form/expired-token');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('期限');
  });

  it('renders already-responded page', async () => {
    await seedSurveyRequest({ token: 'responded-token', status: 'responded' });

    const res = await SELF.fetch('https://example.com/nps/form/responded-token');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('回答');
  });

  it('renders form HTML for valid sent survey', async () => {
    await seedSurveyRequest({ token: 'valid-token', status: 'sent' });

    const res = await SELF.fetch('https://example.com/nps/form/valid-token');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('updates status to opened when current status is sent', async () => {
    await seedSurveyRequest({ token: 'open-token', status: 'sent' });

    await SELF.fetch('https://example.com/nps/form/open-token');

    const row = await env.DB.prepare('SELECT status FROM nps_survey_requests WHERE token = ?')
      .bind('open-token')
      .first<{ status: string }>();
    expect(row!.status).toBe('opened');
  });
});
