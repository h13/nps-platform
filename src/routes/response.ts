import type { Env, NpsResponsePayload, SurveyConfig, Question } from '../types';
import { calculateSegment } from '../types';

function corsHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
}

export function validateAnswers(
  answers: Record<string, unknown>,
  questions: Question[]
): { sanitized: Record<string, unknown>; errors: string[] } {
  const sanitized: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const question of questions) {
    const value = answers[question.id];
    const missing = value === undefined || value === null || value === '';

    if (question.required && missing) {
      errors.push(`${question.id} is required`);
      continue;
    }

    if (missing) continue;

    switch (question.type) {
      case 'nps_score': {
        const num = Number(value);
        if (!Number.isInteger(num) || num < 0 || num > 10) {
          errors.push(`${question.id} must be an integer between 0 and 10`);
        } else {
          sanitized[question.id] = num;
        }
        break;
      }
      case 'rating': {
        const num = Number(value);
        const min = question.min_value ?? 1;
        const max = question.max_value ?? 5;
        if (!Number.isInteger(num) || num < min || num > max) {
          errors.push(`${question.id} must be an integer between ${min} and ${max}`);
        } else {
          sanitized[question.id] = num;
        }
        break;
      }
      case 'free_text': {
        let text = String(value);
        if (question.max_length && text.length > question.max_length) {
          text = text.slice(0, question.max_length);
        }
        sanitized[question.id] = text;
        break;
      }
      case 'single_select':
      case 'radio': {
        const validValues = (question.options ?? []).map((o) => o.value);
        if (validValues.includes(String(value))) {
          sanitized[question.id] = String(value);
        }
        break;
      }
      case 'multi_select': {
        const validValues = (question.options ?? []).map((o) => o.value);
        const arr = Array.isArray(value) ? value : [];
        const filtered = arr.map(String).filter((v) => validValues.includes(v));
        if (filtered.length > 0) {
          sanitized[question.id] = filtered;
        }
        break;
      }
    }
  }

  // config に存在しない question_id は無視（sanitized に含めない）

  return { sanitized, errors };
}

export async function handleResponse(request: Request, env: Env): Promise<Response> {
  let body: NpsResponsePayload;
  try {
    body = await request.json() as NpsResponsePayload;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: corsHeaders() }
    );
  }

  if (!body.answers || typeof body.answers !== 'object') {
    return new Response(
      JSON.stringify({ error: 'answers is required' }),
      { status: 400, headers: corsHeaders() }
    );
  }

  const configRow = await env.DB.prepare(
    'SELECT config_json FROM survey_config WHERE id = 1'
  ).first<{ config_json: string }>();

  if (!configRow) {
    return new Response(
      JSON.stringify({ error: 'Config not found' }),
      { status: 500, headers: corsHeaders() }
    );
  }

  let config: SurveyConfig;
  try {
    config = JSON.parse(configRow.config_json);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Survey configuration is invalid' }),
      { status: 500, headers: corsHeaders() }
    );
  }
  const { sanitized, errors } = validateAnswers(body.answers, config.questions);

  if (errors.length > 0) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: errors }),
      { status: 400, headers: corsHeaders() }
    );
  }

  const npsQuestion = config.questions.find((q) => q.type === 'nps_score');
  const npsScore = npsQuestion && sanitized[npsQuestion.id] !== undefined
    ? Number(sanitized[npsQuestion.id])
    : null;
  const segment = npsScore !== null ? calculateSegment(npsScore) : null;

  const hasToken = typeof body.token === 'string' && body.token.length > 0;
  const channel = hasToken ? 'email' : 'lp';

  let surveyRequestId: number | null = null;
  let stage: string | null = null;
  let opportunityId: string | null = null;

  if (hasToken) {
    const row = await env.DB.prepare(
      'SELECT id, stage, opportunity_id, status FROM nps_survey_requests WHERE token = ?'
    ).bind(body.token).first<{ id: number; stage: string; opportunity_id: string; status: string }>();

    if (!row) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 404, headers: corsHeaders() }
      );
    }

    if (row.status === 'responded') {
      return new Response(
        JSON.stringify({ error: 'Already responded' }),
        { status: 409, headers: corsHeaders() }
      );
    }

    surveyRequestId = row.id;
    stage = row.stage;
    opportunityId = row.opportunity_id;
  }

  await env.DB.prepare(
    `INSERT INTO nps_responses
     (survey_request_id, channel, nps_score, segment, answers, page_url, scroll_percent, dwell_seconds, user_agent, stage, opportunity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    surveyRequestId,
    channel,
    npsScore,
    segment,
    JSON.stringify(sanitized),
    body.page_url ?? null,
    body.scroll_percent ?? null,
    body.dwell_seconds ?? null,
    body.user_agent ?? null,
    stage,
    opportunityId
  ).run();

  if (hasToken && surveyRequestId) {
    await env.DB.prepare(
      "UPDATE nps_survey_requests SET status = 'responded', responded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).bind(surveyRequestId).run();
  }

  return new Response(
    JSON.stringify({ status: 'created', segment }),
    { status: 201, headers: corsHeaders() }
  );
}
