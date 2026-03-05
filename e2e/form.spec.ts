import { expect, test } from '@playwright/test';

test.describe('NPS form page', () => {
  test('GET /nps/form/:token with invalid token returns error page', async ({ page }) => {
    const res = await page.goto('/nps/form/invalid-token');
    expect(res?.status()).toBe(404);
  });
});
