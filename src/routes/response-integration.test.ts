import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupTestDb } from '../test-helpers/setup-db';
import type { SurveyConfig } from '../types';

const config: SurveyConfig = {
  survey_title: 'NPS Survey',
  thanks_message: 'Thanks',
  email_subject_template: '{survey_title}',
  widget_primary_color: '#2563EB',
  widget_bg_color: '#FFFFFF',
  widget_text_color: '#1F2937',
  questions: [
    {
      id: 'nps',
      type: 'nps_score',
      text: 'How likely to recommend?',
      required: true,
      display_order: 1,
      min_label: 'Not likely',
      max_label: 'Very likely',
    },
    {
      id: 'comment',
      type: 'free_text',
      text: 'Any comments?',
      required: false,
      display_order: 2,
      max_length: 1000,
    },
  ],
};

function responseRequest(body: Record<string, unknown>) {
  return SELF.fetch('https://example.com/nps/response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /nps/response', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await env.DB.exec('DELETE FROM nps_responses');
    await env.DB.exec('DELETE FROM nps_survey_requests');
    await env.DB.exec('DELETE FROM survey_config');

    await env.DB.prepare(
      `INSERT INTO survey_config (id, config_json, updated_at) VALUES (1, ?, datetime('now'))`
    ).bind(JSON.stringify(config)).run();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await SELF.fetch('https://example.com/nps/response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when answers is missing', async () => {
    const res = await responseRequest({});
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('answers is required');
  });

  it('returns 400 when required nps_score is missing', async () => {
    const res = await responseRequest({ answers: {} });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; details: string[] };
    expect(body.details).toContain('nps is required');
  });

  it('returns 201 for valid LP response (no token)', async () => {
    const res = await responseRequest({
      answers: { nps: 9, comment: 'Great!' },
      page_url: 'https://example.com',
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { status: string; segment: string };
    expect(body.status).toBe('created');
    expect(body.segment).toBe('promoter');

    // Verify DB
    const row = await env.DB.prepare(
      'SELECT * FROM nps_responses ORDER BY id DESC LIMIT 1'
    ).first<{ channel: string; nps_score: number; segment: string; page_url: string }>();
    expect(row!.channel).toBe('lp');
    expect(row!.nps_score).toBe(9);
    expect(row!.segment).toBe('promoter');
    expect(row!.page_url).toBe('https://example.com');
  });

  it('returns 201 for valid email response with token', async () => {
    await env.DB.prepare(
      `INSERT INTO nps_survey_requests
       (token, opportunity_id, account_id, account_name, stage, contact_email, contact_name, status, expires_at)
       VALUES ('tok-123', 'opp-1', 'acc-1', 'Corp', 'closed_won', 'a@b.com', 'Alice', 'sent', ?)`
    ).bind(new Date(Date.now() + 86400000).toISOString()).run();

    const res = await responseRequest({
      token: 'tok-123',
      answers: { nps: 5 },
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { segment: string };
    expect(body.segment).toBe('detractor');

    // Verify survey request status updated
    const req = await env.DB.prepare(
      'SELECT status FROM nps_survey_requests WHERE token = ?'
    ).bind('tok-123').first<{ status: string }>();
    expect(req!.status).toBe('responded');
  });

  it('returns 404 for invalid token', async () => {
    const res = await responseRequest({
      token: 'invalid-token',
      answers: { nps: 8 },
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 for already responded token', async () => {
    await env.DB.prepare(
      `INSERT INTO nps_survey_requests
       (token, opportunity_id, account_id, account_name, stage, contact_email, contact_name, status, expires_at)
       VALUES ('used-tok', 'opp-2', 'acc-2', 'Corp', 'closed_won', 'a@b.com', 'Alice', 'responded', ?)`
    ).bind(new Date(Date.now() + 86400000).toISOString()).run();

    const res = await responseRequest({
      token: 'used-tok',
      answers: { nps: 10 },
    });
    expect(res.status).toBe(409);
  });

  it('stores answers as JSON', async () => {
    const res = await responseRequest({
      answers: { nps: 7, comment: 'OK' },
    });
    expect(res.status).toBe(201);

    const row = await env.DB.prepare(
      'SELECT answers FROM nps_responses ORDER BY id DESC LIMIT 1'
    ).first<{ answers: string }>();
    const answers = JSON.parse(row!.answers);
    expect(answers.nps).toBe(7);
    expect(answers.comment).toBe('OK');
  });
});
