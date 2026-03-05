import { expect, test } from '@playwright/test';

test.describe('Widget assets', () => {
  test('GET /nps/widget.js serves JavaScript', async ({ request }) => {
    const res = await request.get('/nps/widget.js');
    expect(res.ok()).toBeTruthy();
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('javascript');
  });
});
