import {
  createExecutionContext,
  createScheduledController,
  env,
  fetchMock,
  SELF,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import worker from './index';
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

    it('returns 500 when syncSpreadsheetToD1 throws', async () => {
      const badEnv = {
        ...env,
        GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
        SPREADSHEET_ID: '',
      };

      const request = new Request('https://example.com/nps/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.NPS_API_KEY}` },
      });

      const res = await worker.fetch(request, badEnv);
      expect(res.status).toBe(500);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBeTruthy();
    });

    it('returns 200 on successful sync', async () => {
      fetchMock.activate();
      fetchMock.disableNetConnect();

      // Mock Google OAuth token exchange
      fetchMock
        .get('https://oauth2.googleapis.com')
        .intercept({ path: '/token', method: 'POST' })
        .reply(
          200,
          JSON.stringify({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );

      // Mock Google Sheets API
      fetchMock
        .get('https://sheets.googleapis.com')
        .intercept({ path: /\/v4\/spreadsheets\/.*/, method: 'GET' })
        .reply(
          200,
          JSON.stringify({
            spreadsheetId: 'test-sheet',
            valueRanges: [
              {
                range: 'questions!A:L',
                majorDimension: 'ROWS',
                values: [
                  [
                    'id',
                    'type',
                    'text',
                    'required',
                    'is_active',
                    'display_order',
                    'placeholder',
                    'max_length',
                    'min_value',
                    'max_value',
                    'min_label',
                    'max_label',
                  ],
                  ['nps', 'nps_score', 'How likely?', 'TRUE', 'TRUE', '1', '', '', '', '', '', ''],
                ],
              },
              {
                range: 'options!A:E',
                majorDimension: 'ROWS',
                values: [['question_id', 'value', 'label', 'is_active', 'display_order']],
              },
              {
                range: 'config!A:B',
                majorDimension: 'ROWS',
                values: [
                  ['key', 'value'],
                  ['survey_title', 'Test Survey'],
                  ['thanks_message', 'Thank you'],
                ],
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );

      // Generate a test RSA key pair
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['sign', 'verify'],
      );
      const pkcs8 = await crypto.subtle.exportKey('pkcs8', (keyPair as CryptoKeyPair).privateKey);
      const pemBase64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8 as ArrayBuffer)));
      const pem = `-----BEGIN PRIVATE KEY-----\n${pemBase64}\n-----END PRIVATE KEY-----`;

      const testEnv = {
        ...env,
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: 'test@test.iam.gserviceaccount.com',
          private_key: pem,
        }),
        SPREADSHEET_ID: 'test-spreadsheet-id',
      };

      const request = new Request('https://example.com/nps/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${testEnv.NPS_API_KEY}` },
      });

      const res = await worker.fetch(request, testEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; message: string };
      expect(body.ok).toBe(true);
      expect(body.message).toBe('Spreadsheet sync completed');

      // Verify config was written to D1
      const configRow = await env.DB.prepare(
        'SELECT config_json FROM survey_config WHERE id = 1',
      ).first<{ config_json: string }>();
      expect(configRow).toBeTruthy();
      const config = JSON.parse(configRow!.config_json);
      expect(config.survey_title).toBe('Test Survey');

      fetchMock.deactivate();
    });
  });

  it('returns 500 for unexpected errors', async () => {
    const brokenEnv = {
      ...env,
      DB: {
        prepare: () => {
          throw new Error('DB crashed');
        },
      } as unknown as D1Database,
    };

    const request = new Request('https://example.com/nps/config', { method: 'GET' });
    const res = await worker.fetch(request, brokenEnv);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal Server Error');
  });

  describe('scheduled handler', () => {
    it('calls runSpreadsheetSync for hourly cron', async () => {
      const controller = createScheduledController({ cron: '0 * * * *' });
      const ctx = createExecutionContext();
      worker.scheduled(controller, env, ctx);
      await waitOnExecutionContext(ctx);
    });

    it('calls retryFailedEmails for daily cron', async () => {
      const controller = createScheduledController({ cron: '0 18 * * *' });
      const ctx = createExecutionContext();
      worker.scheduled(controller, env, ctx);
      await waitOnExecutionContext(ctx);
    });

    it('does nothing for unknown cron', async () => {
      const controller = createScheduledController({ cron: '*/5 * * * *' });
      const ctx = createExecutionContext();
      worker.scheduled(controller, env, ctx);
      await waitOnExecutionContext(ctx);
    });
  });
});
