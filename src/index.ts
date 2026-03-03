import { handleWebhook } from './routes/webhook';
import { handleForm } from './routes/form';
import { handleResponse } from './routes/response';
import { handleConfig } from './routes/config';
import type { Env } from './types';

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
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      if (method === 'POST' && path === '/nps/webhook') {
        return handleWebhook(request, env);
      }
      if (method === 'GET' && path.startsWith('/nps/form/')) {
        const token = path.replace('/nps/form/', '');
        return handleForm(token, env);
      }
      if (method === 'POST' && path === '/nps/response') {
        return handleResponse(request, env);
      }
      if (method === 'GET' && path === '/nps/config') {
        return handleConfig(env);
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      console.error(e);
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext) {
    // Phase 5, 6 で実装
  },
};
