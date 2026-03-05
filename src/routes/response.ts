import type { Env, NpsResponsePayload, Question, SurveyConfig } from '../types';
import { calculateSegment } from '../types';

function corsHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
}

function validateNpsScore(
  id: string,
  value: unknown,
  sanitized: Record<string, unknown>,
  errors: string[],
): void {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 10) {
    errors.push(`${id} must be an integer between 0 and 10`);
  } else {
    sanitized[id] = num;
  }
}

function validateRating(
  id: string,
  value: unknown,
  minValue: number,
  maxValue: number,
  sanitized: Record<string, unknown>,
  errors: string[],
): void {
  const num = Number(value);
  if (!Number.isInteger(num) || num < minValue || num > maxValue) {
    errors.push(`${id} must be an integer between ${minValue} and ${maxValue}`);
  } else {
    sanitized[id] = num;
  }
}

function validateFreeText(
  id: string,
  value: unknown,
  maxLength: number | undefined,
  sanitized: Record<string, unknown>,
): void {
  let text = String(value);
  if (maxLength && text.length > maxLength) {
    text = text.slice(0, maxLength);
  }
  sanitized[id] = text;
}

function validateSingleChoice(
  id: string,
  value: unknown,
  options: { value: string }[],
  sanitized: Record<string, unknown>,
): void {
  const validValues = options.map((o) => o.value);
  if (validValues.includes(String(value))) {
    sanitized[id] = String(value);
  }
}

function validateMultiSelect(
  id: string,
  value: unknown,
  options: { value: string }[],
  sanitized: Record<string, unknown>,
): void {
  const validValues = options.map((o) => o.value);
  const arr = Array.isArray(value) ? value : [];
  const filtered = arr.map(String).filter((v) => validValues.includes(v));
  if (filtered.length > 0) {
    sanitized[id] = filtered;
  }
}

export function validateAnswers(
  answers: Record<string, unknown>,
  questions: Question[],
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
      case 'nps_score':
        validateNpsScore(question.id, value, sanitized, errors);
        break;
      case 'rating':
        validateRating(
          question.id,
          value,
          question.min_value ?? 1,
          question.max_value ?? 5,
          sanitized,
          errors,
        );
        break;
      case 'free_text':
        validateFreeText(question.id, value, question.max_length, sanitized);
        break;
      case 'single_select':
      case 'radio':
        validateSingleChoice(question.id, value, question.options ?? [], sanitized);
        break;
      case 'multi_select':
        validateMultiSelect(question.id, value, question.options ?? [], sanitized);
        break;
    }
  }

  return { sanitized, errors };
}

async function loadSurveyConfig(db: D1Database): Promise<SurveyConfig | null> {
  const row = await db
    .prepare('SELECT config_json FROM survey_config WHERE id = 1')
    .first<{ config_json: string }>();

  if (!row) return null;

  return JSON.parse(row.config_json) as SurveyConfig;
}

interface TokenContext {
  surveyRequestId: number;
  stage: string;
  opportunityId: string;
}

async function resolveTokenContext(
  db: D1Database,
  token: string,
): Promise<TokenContext | Response> {
  const row = await db
    .prepare('SELECT id, stage, opportunity_id, status FROM nps_survey_requests WHERE token = ?')
    .bind(token)
    .first<{ id: number; stage: string; opportunity_id: string; status: string }>();

  if (!row) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 404,
      headers: corsHeaders(),
    });
  }

  if (row.status === 'responded') {
    return new Response(JSON.stringify({ error: 'Already responded' }), {
      status: 409,
      headers: corsHeaders(),
    });
  }

  return { surveyRequestId: row.id, stage: row.stage, opportunityId: row.opportunity_id };
}

interface InsertResponseParams {
  surveyRequestId: number | null;
  channel: string;
  npsScore: number | null;
  segment: string | null;
  sanitized: Record<string, unknown>;
  body: NpsResponsePayload;
  stage: string | null;
  opportunityId: string | null;
}

async function insertResponse(db: D1Database, params: InsertResponseParams): Promise<void> {
  await db
    .prepare(
      `INSERT INTO nps_responses
     (survey_request_id, channel, nps_score, segment, answers, page_url, scroll_percent, dwell_seconds, user_agent, stage, opportunity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.surveyRequestId,
      params.channel,
      params.npsScore,
      params.segment,
      JSON.stringify(params.sanitized),
      params.body.page_url ?? null,
      params.body.scroll_percent ?? null,
      params.body.dwell_seconds ?? null,
      params.body.user_agent ?? null,
      params.stage,
      params.opportunityId,
    )
    .run();

  if (params.channel === 'email' && params.surveyRequestId) {
    await db
      .prepare(
        "UPDATE nps_survey_requests SET status = 'responded', responded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      )
      .bind(params.surveyRequestId)
      .run();
  }
}

export async function handleResponse(request: Request, env: Env): Promise<Response> {
  let body: NpsResponsePayload;
  try {
    body = (await request.json()) as NpsResponsePayload;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  if (!body.answers || typeof body.answers !== 'object') {
    return new Response(JSON.stringify({ error: 'answers is required' }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  let config: SurveyConfig;
  try {
    const loaded = await loadSurveyConfig(env.DB);
    if (!loaded) {
      return new Response(JSON.stringify({ error: 'Config not found' }), {
        status: 500,
        headers: corsHeaders(),
      });
    }
    config = loaded;
  } catch {
    return new Response(JSON.stringify({ error: 'Survey configuration is invalid' }), {
      status: 500,
      headers: corsHeaders(),
    });
  }

  const { sanitized, errors } = validateAnswers(body.answers, config.questions);

  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: 'Validation failed', details: errors }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const npsQuestion = config.questions.find((q) => q.type === 'nps_score');
  const npsScore =
    npsQuestion && sanitized[npsQuestion.id] !== undefined
      ? Number(sanitized[npsQuestion.id])
      : null;
  const segment = npsScore !== null ? calculateSegment(npsScore) : null;

  const hasToken = typeof body.token === 'string' && body.token.length > 0;
  const channel = hasToken ? 'email' : 'lp';

  let surveyRequestId: number | null = null;
  let stage: string | null = null;
  let opportunityId: string | null = null;

  if (hasToken) {
    const result = await resolveTokenContext(env.DB, body.token as string);
    if (result instanceof Response) return result;
    surveyRequestId = result.surveyRequestId;
    stage = result.stage;
    opportunityId = result.opportunityId;
  }

  await insertResponse(env.DB, {
    surveyRequestId,
    channel,
    npsScore,
    segment,
    sanitized,
    body,
    stage,
    opportunityId,
  });

  return new Response(JSON.stringify({ status: 'created', segment }), {
    status: 201,
    headers: corsHeaders(),
  });
}
