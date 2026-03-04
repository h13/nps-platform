import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupTestDb } from '../test-helpers/setup-db';

beforeAll(async () => {
  await setupTestDb();
});

async function seedConfig(configJson: string) {
  await env.DB.prepare(
    `INSERT INTO survey_config (id, config_json, updated_at)
     VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json`,
  )
    .bind(configJson)
    .run();
}

describe('GET /nps/config', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM survey_config');
  });

  it('returns 404 when config is not seeded', async () => {
    const res = await SELF.fetch('https://example.com/nps/config');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Config not found');
  });

  it('returns config JSON with CORS and cache headers', async () => {
    const config = JSON.stringify({ survey_title: 'Test', questions: [] });
    await seedConfig(config);

    const res = await SELF.fetch('https://example.com/nps/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Cache-Control')).toContain('max-age=300');

    const body = (await res.json()) as { survey_title: string };
    expect(body.survey_title).toBe('Test');
  });

  it('returns Content-Type application/json', async () => {
    await seedConfig('{}');
    const res = await SELF.fetch('https://example.com/nps/config');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});
