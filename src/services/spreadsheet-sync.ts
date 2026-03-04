import type { Env, Question, QuestionOption, QuestionType, SurveyConfig } from '../types';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SheetValueRange {
  range: string;
  majorDimension: string;
  values: string[][];
}

interface BatchGetResponse {
  spreadsheetId: string;
  valueRanges: SheetValueRange[];
}

// --- JWT Authentication (Web Crypto API) ---

function base64UrlEncode(data: Uint8Array): string {
  const binStr = Array.from(data, (b) => String.fromCharCode(b)).join('');
  return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textToBase64Url(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function createSignedJwt(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = textToBase64Url(JSON.stringify(header));
  const encodedPayload = textToBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const jwt = await createSignedJwt(serviceAccount);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as TokenResponse;
  return data.access_token;
}

// --- Sheets API ---

async function fetchSheets(accessToken: string, spreadsheetId: string): Promise<BatchGetResponse> {
  const ranges = ['questions!A:L', 'options!A:E', 'config!A:B'];
  const params = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as BatchGetResponse;
}

// --- Sheet Parsing ---

export function parseRowsToObjects(values: string[][]): Record<string, string>[] {
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i] ?? '';
    }
    return obj;
  });
}

export function parseBool(value: string): boolean {
  return value.toUpperCase() === 'TRUE';
}

export function parseOptionalInt(value: string): number | undefined {
  if (value === '') return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function parseQuestions(rows: Record<string, string>[]): Omit<Question, 'options'>[] {
  return rows
    .filter((r) => parseBool(r.is_active))
    .map((r) => {
      const q: Omit<Question, 'options'> & { options?: QuestionOption[] } = {
        id: r.id,
        type: r.type as QuestionType,
        text: r.text,
        required: parseBool(r.required),
        display_order: parseInt(r.display_order, 10) || 0,
      };
      if (r.placeholder) q.placeholder = r.placeholder;
      if (r.max_length) q.max_length = parseOptionalInt(r.max_length);
      if (r.min_value) q.min_value = parseOptionalInt(r.min_value);
      if (r.max_value) q.max_value = parseOptionalInt(r.max_value);
      if (r.min_label) q.min_label = r.min_label;
      if (r.max_label) q.max_label = r.max_label;
      return q;
    })
    .sort((a, b) => a.display_order - b.display_order);
}

export function parseOptions(rows: Record<string, string>[]): Map<string, QuestionOption[]> {
  const grouped = new Map<string, QuestionOption[]>();

  const activeRows = rows
    .filter((r) => parseBool(r.is_active))
    .sort((a, b) => (parseInt(a.display_order, 10) || 0) - (parseInt(b.display_order, 10) || 0));

  for (const r of activeRows) {
    const qid = r.question_id;
    const list = grouped.get(qid) ?? [];
    list.push({ value: r.value, label: r.label });
    grouped.set(qid, list);
  }

  return grouped;
}

export function parseConfig(rows: Record<string, string>[]): Record<string, string> {
  const config: Record<string, string> = {};
  for (const r of rows) {
    if (r.key && r.value !== undefined) {
      config[r.key] = r.value;
    }
  }
  return config;
}

export function buildSurveyConfig(
  questionRows: Record<string, string>[],
  optionRows: Record<string, string>[],
  configRows: Record<string, string>[],
): SurveyConfig {
  const questions = parseQuestions(questionRows);
  const optionsMap = parseOptions(optionRows);
  const configKv = parseConfig(configRows);

  const mergedQuestions: Question[] = questions.map((q) => {
    const opts = optionsMap.get(q.id);
    return opts ? { ...q, options: opts } : { ...q };
  });

  return {
    survey_title: configKv.survey_title ?? '',
    thanks_message: configKv.thanks_message ?? '',
    email_subject_template: configKv.email_subject_template ?? '',
    widget_primary_color: configKv.widget_primary_color ?? '#2563EB',
    widget_bg_color: configKv.widget_bg_color ?? '#FFFFFF',
    widget_text_color: configKv.widget_text_color ?? '#1F2937',
    questions: mergedQuestions,
  };
}

// --- Slack Notification ---

async function notifySlack(webhookUrl: string, message: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `[NPS Spreadsheet Sync] ${message}` }),
    });
  } catch {
    // Slack notification is best-effort
  }
}

// --- Main Sync Function ---

export async function syncSpreadsheetToD1(env: Env): Promise<void> {
  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccountKey;
  const spreadsheetId = env.SPREADSHEET_ID;

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON: missing client_email or private_key');
  }
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID is not configured');
  }

  const accessToken = await getAccessToken(serviceAccount);
  const sheetsData = await fetchSheets(accessToken, spreadsheetId);

  const questionValues = sheetsData.valueRanges[0]?.values ?? [];
  const optionValues = sheetsData.valueRanges[1]?.values ?? [];
  const configValues = sheetsData.valueRanges[2]?.values ?? [];

  const questionRows = parseRowsToObjects(questionValues);
  const optionRows = parseRowsToObjects(optionValues);
  const configRows = parseRowsToObjects(configValues);

  const config = buildSurveyConfig(questionRows, optionRows, configRows);

  if (config.questions.length === 0) {
    throw new Error(
      'Parsed config has no active questions — aborting sync to preserve existing data',
    );
  }

  await env.DB.prepare(
    `INSERT INTO survey_config (id, config_json, updated_at)
     VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       config_json = excluded.config_json,
       updated_at = excluded.updated_at`,
  )
    .bind(JSON.stringify(config))
    .run();
}

export async function runSpreadsheetSync(env: Env): Promise<void> {
  try {
    await syncSpreadsheetToD1(env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Spreadsheet Sync]', message);

    if (env.SLACK_WEBHOOK_URL) {
      await notifySlack(env.SLACK_WEBHOOK_URL, `Sync failed: ${message}`);
    }
  }
}
