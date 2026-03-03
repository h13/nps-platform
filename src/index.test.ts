import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupTestDb } from './test-helpers/setup-db';

describe('Worker router', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM nps_responses').run();
    await env.DB.prepare('DELETE FROM nps_survey_requests').run();
    await env.DB.prepare('DELETE FROM survey_config').run();
  });

  it('returns CORS preflight headers for OPTIONS', async () => {
    const res = await SELF.fetch('https://example.com/nps/config', {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('returns 404 for unknown paths', async () => {
    const res = await SELF.fetch('https://example.com/unknown');
    expect(res.status).toBe(404);
  });

  it('returns 404 for wrong method on existing path', async () => {
    const res = await SELF.fetch('https://example.com/nps/webhook', {
      method: 'GET',
    });
    expect(res.status).toBe(404);
  });

  describe('POST /nps/sync', () => {
    it('returns 401 without auth', async () => {
      const res = await SELF.fetch('https://example.com/nps/sync', {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });
  });
});
