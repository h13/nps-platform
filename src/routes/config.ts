import type { Env } from '../types';

export async function handleConfig(env: Env): Promise<Response> {
  const row = await env.DB.prepare('SELECT config_json FROM survey_config WHERE id = 1').first<{
    config_json: string;
  }>();

  if (!row) {
    return new Response(JSON.stringify({ error: 'Config not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(row.config_json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
