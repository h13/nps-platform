import { verifyBearerToken } from './middleware/auth';
import { handleConfig } from './routes/config';
import { handleForm } from './routes/form';
import { handleResponse } from './routes/response';
import { handleWebhook, retryFailedEmails } from './routes/webhook';
import { runSpreadsheetSync, syncSpreadsheetToD1 } from './services/spreadsheet-sync';
import type { Env } from './types';

async function handleSync(request: Request, env: Env): Promise<Response> {
  const authError = verifyBearerToken(request, env);
  if (authError) return authError;

  try {
    await syncSpreadsheetToD1(env);
    return new Response(JSON.stringify({ ok: true, message: 'Spreadsheet sync completed' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (syncErr) {
    const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
    console.error('[Spreadsheet Sync]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS（LP Widget からのリクエスト用）
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400', // 1 day
        },
      });
    }

    try {
      if (method === 'POST' && path === '/nps/webhook') {
        return await handleWebhook(request, env);
      }
      if (method === 'GET' && path.startsWith('/nps/form/')) {
        const token = path.replace('/nps/form/', '');
        return await handleForm(token, env);
      }
      if (method === 'POST' && path === '/nps/response') {
        return await handleResponse(request, env);
      }
      if (method === 'GET' && path === '/nps/config') {
        return await handleConfig(env);
      }
      if (method === 'POST' && path === '/nps/sync') {
        return await handleSync(request, env);
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      console.error(e);
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case '0 * * * *':
        // 毎時: Spreadsheet → D1 config 同期
        ctx.waitUntil(runSpreadsheetSync(env));
        break;
      case '0 18 * * *':
        // 毎日 18:00 UTC (AM 3:00 JST): 失敗メールリトライ
        ctx.waitUntil(retryFailedEmails(env));
        break;
    }
  },
};
