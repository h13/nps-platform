import { expect, test } from '@playwright/test';

test.describe('API smoke tests', () => {
  test('POST /nps/webhook without auth returns 401', async ({ request }) => {
    const res = await request.post('/nps/webhook', {
      data: { test: true },
    });
    expect(res.status()).toBe(401);
  });

  test('OPTIONS returns CORS headers', async ({ request }) => {
    const res = await request.fetch('/nps/webhook', { method: 'OPTIONS' });
    expect(res.status()).toBe(200);
    expect(res.headers()['access-control-allow-origin']).toBe('*');
    expect(res.headers()['access-control-allow-methods']).toContain('POST');
  });

  test('GET /nps/config returns survey config', async ({ request }) => {
    const res = await request.get('/nps/config');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('survey_title');
  });

  test('GET /unknown returns 404', async ({ request }) => {
    const res = await request.get('/unknown');
    expect(res.status()).toBe(404);
  });
});
