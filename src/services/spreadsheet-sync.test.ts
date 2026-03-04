import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env, fetchMock } from 'cloudflare:test';
import { setupTestDb } from '../test-helpers/setup-db';
import {
  parseRowsToObjects,
  parseBool,
  parseOptionalInt,
  parseQuestions,
  parseOptions,
  parseConfig,
  buildSurveyConfig,
  syncSpreadsheetToD1,
  runSpreadsheetSync,
} from './spreadsheet-sync';

describe('parseBool', () => {
  it('returns true for "TRUE"', () => {
    expect(parseBool('TRUE')).toBe(true);
  });

  it('returns true for "true" (case-insensitive)', () => {
    expect(parseBool('true')).toBe(true);
  });

  it('returns false for "FALSE"', () => {
    expect(parseBool('FALSE')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(parseBool('')).toBe(false);
  });

  it('returns false for arbitrary string', () => {
    expect(parseBool('yes')).toBe(false);
  });
});

describe('parseOptionalInt', () => {
  it('returns number for valid integer string', () => {
    expect(parseOptionalInt('42')).toBe(42);
  });

  it('returns undefined for empty string', () => {
    expect(parseOptionalInt('')).toBeUndefined();
  });

  it('returns undefined for non-numeric string', () => {
    expect(parseOptionalInt('abc')).toBeUndefined();
  });

  it('returns integer part for float string', () => {
    expect(parseOptionalInt('3.14')).toBe(3);
  });

  it('returns 0 for "0"', () => {
    expect(parseOptionalInt('0')).toBe(0);
  });

  it('returns negative numbers', () => {
    expect(parseOptionalInt('-5')).toBe(-5);
  });
});

describe('parseRowsToObjects', () => {
  it('returns empty array when less than 2 rows', () => {
    expect(parseRowsToObjects([])).toEqual([]);
    expect(parseRowsToObjects([['header1', 'header2']])).toEqual([]);
  });

  it('maps header row to object keys', () => {
    const values = [
      ['name', 'age'],
      ['Alice', '30'],
      ['Bob', '25'],
    ];
    expect(parseRowsToObjects(values)).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ]);
  });

  it('fills missing values with empty string', () => {
    const values = [['a', 'b', 'c'], ['1']];
    expect(parseRowsToObjects(values)).toEqual([{ a: '1', b: '', c: '' }]);
  });
});

describe('parseQuestions', () => {
  const baseRow = {
    id: 'q1',
    type: 'nps_score',
    text: 'How likely?',
    required: 'TRUE',
    is_active: 'TRUE',
    display_order: '1',
    placeholder: '',
    max_length: '',
    min_value: '',
    max_value: '',
    min_label: '',
    max_label: '',
  };

  it('filters out inactive questions', () => {
    const rows = [{ ...baseRow, is_active: 'FALSE' }];
    expect(parseQuestions(rows)).toEqual([]);
  });

  it('parses basic question fields', () => {
    const result = parseQuestions([baseRow]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'q1',
      type: 'nps_score',
      text: 'How likely?',
      required: true,
      display_order: 1,
    });
  });

  it('includes optional fields when present', () => {
    const row = {
      ...baseRow,
      id: 'q2',
      type: 'free_text',
      placeholder: 'Enter text...',
      max_length: '500',
    };
    const result = parseQuestions([row]);
    expect(result[0].placeholder).toBe('Enter text...');
    expect(result[0].max_length).toBe(500);
  });

  it('includes min/max labels for nps_score', () => {
    const row = {
      ...baseRow,
      min_label: 'Not likely',
      max_label: 'Very likely',
    };
    const result = parseQuestions([row]);
    expect(result[0].min_label).toBe('Not likely');
    expect(result[0].max_label).toBe('Very likely');
  });

  it('includes min/max values for rating type', () => {
    const row = {
      ...baseRow,
      id: 'q3',
      type: 'rating',
      min_value: '1',
      max_value: '5',
    };
    const result = parseQuestions([row]);
    expect(result[0].min_value).toBe(1);
    expect(result[0].max_value).toBe(5);
  });

  it('sorts by display_order', () => {
    const rows = [
      { ...baseRow, id: 'q2', display_order: '3' },
      { ...baseRow, id: 'q1', display_order: '1' },
      { ...baseRow, id: 'q3', display_order: '2' },
    ];
    const result = parseQuestions(rows);
    expect(result.map((q) => q.id)).toEqual(['q1', 'q3', 'q2']);
  });

  it('handles required=FALSE', () => {
    const row = { ...baseRow, required: 'FALSE' };
    const result = parseQuestions([row]);
    expect(result[0].required).toBe(false);
  });
});

describe('parseOptions', () => {
  const baseRow = {
    question_id: 'q1',
    value: 'a',
    label: 'Option A',
    is_active: 'TRUE',
    display_order: '1',
  };

  it('returns empty map for no rows', () => {
    expect(parseOptions([]).size).toBe(0);
  });

  it('groups options by question_id', () => {
    const rows = [
      { ...baseRow, question_id: 'q1', value: 'a', label: 'A' },
      { ...baseRow, question_id: 'q1', value: 'b', label: 'B', display_order: '2' },
      { ...baseRow, question_id: 'q2', value: 'x', label: 'X' },
    ];
    const result = parseOptions(rows);
    expect(result.get('q1')).toEqual([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);
    expect(result.get('q2')).toEqual([{ value: 'x', label: 'X' }]);
  });

  it('filters out inactive options', () => {
    const rows = [{ ...baseRow, is_active: 'FALSE' }];
    expect(parseOptions(rows).size).toBe(0);
  });

  it('sorts options by display_order', () => {
    const rows = [
      { ...baseRow, value: 'b', label: 'B', display_order: '2' },
      { ...baseRow, value: 'a', label: 'A', display_order: '1' },
    ];
    const result = parseOptions(rows);
    expect(result.get('q1')![0].value).toBe('a');
    expect(result.get('q1')![1].value).toBe('b');
  });
});

describe('parseConfig', () => {
  it('returns empty object for no rows', () => {
    expect(parseConfig([])).toEqual({});
  });

  it('maps key-value pairs', () => {
    const rows = [
      { key: 'survey_title', value: 'My Survey' },
      { key: 'thanks_message', value: 'Thank you!' },
    ];
    expect(parseConfig(rows)).toEqual({
      survey_title: 'My Survey',
      thanks_message: 'Thank you!',
    });
  });

  it('skips rows with empty key', () => {
    const rows = [
      { key: '', value: 'ignored' },
      { key: 'valid', value: 'kept' },
    ];
    expect(parseConfig(rows)).toEqual({ valid: 'kept' });
  });
});

describe('buildSurveyConfig', () => {
  const questionRows = [
    {
      id: 'nps',
      type: 'nps_score',
      text: 'How likely?',
      required: 'TRUE',
      is_active: 'TRUE',
      display_order: '1',
      placeholder: '',
      max_length: '',
      min_value: '',
      max_value: '',
      min_label: '全く推奨しない',
      max_label: '強く推奨する',
    },
    {
      id: 'reason',
      type: 'single_select',
      text: 'Why?',
      required: 'FALSE',
      is_active: 'TRUE',
      display_order: '2',
      placeholder: '',
      max_length: '',
      min_value: '',
      max_value: '',
      min_label: '',
      max_label: '',
    },
  ];

  const optionRows = [
    {
      question_id: 'reason',
      value: 'quality',
      label: '品質',
      is_active: 'TRUE',
      display_order: '1',
    },
    { question_id: 'reason', value: 'price', label: '価格', is_active: 'TRUE', display_order: '2' },
  ];

  const configRows = [
    { key: 'survey_title', value: 'NPS アンケート' },
    { key: 'thanks_message', value: 'ありがとうございます' },
    { key: 'email_subject_template', value: '{account_name} 様アンケート' },
    { key: 'widget_primary_color', value: '#FF0000' },
  ];

  it('builds a complete SurveyConfig', () => {
    const config = buildSurveyConfig(questionRows, optionRows, configRows);
    expect(config.survey_title).toBe('NPS アンケート');
    expect(config.thanks_message).toBe('ありがとうございます');
    expect(config.email_subject_template).toBe('{account_name} 様アンケート');
    expect(config.widget_primary_color).toBe('#FF0000');
    expect(config.questions).toHaveLength(2);
  });

  it('merges options into matching questions', () => {
    const config = buildSurveyConfig(questionRows, optionRows, configRows);
    const reasonQ = config.questions.find((q) => q.id === 'reason');
    expect(reasonQ?.options).toEqual([
      { value: 'quality', label: '品質' },
      { value: 'price', label: '価格' },
    ]);
  });

  it('leaves options undefined for questions without options', () => {
    const config = buildSurveyConfig(questionRows, optionRows, configRows);
    const npsQ = config.questions.find((q) => q.id === 'nps');
    expect(npsQ?.options).toBeUndefined();
  });

  it('uses defaults for missing config keys', () => {
    const config = buildSurveyConfig(questionRows, optionRows, []);
    expect(config.survey_title).toBe('');
    expect(config.widget_primary_color).toBe('#2563EB');
    expect(config.widget_bg_color).toBe('#FFFFFF');
    expect(config.widget_text_color).toBe('#1F2937');
  });

  it('preserves question ordering by display_order', () => {
    const config = buildSurveyConfig(questionRows, optionRows, configRows);
    expect(config.questions[0].id).toBe('nps');
    expect(config.questions[1].id).toBe('reason');
  });
});

// --- Integration tests for syncSpreadsheetToD1 / runSpreadsheetSync ---

async function generateTestPem(): Promise<string> {
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
  return `-----BEGIN PRIVATE KEY-----\n${pemBase64}\n-----END PRIVATE KEY-----`;
}

function mockSheetsResponse(questionValues: string[][]): string {
  return JSON.stringify({
    spreadsheetId: 'test-sheet',
    valueRanges: [
      { range: 'questions!A:L', majorDimension: 'ROWS', values: questionValues },
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
        ],
      },
    ],
  });
}

function setupFetchMocks(sheetsBody: string): void {
  fetchMock.activate();
  fetchMock.disableNetConnect();

  fetchMock
    .get('https://oauth2.googleapis.com')
    .intercept({ path: '/token', method: 'POST' })
    .reply(
      200,
      JSON.stringify({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );

  fetchMock
    .get('https://sheets.googleapis.com')
    .intercept({ path: /\/v4\/spreadsheets\/.*/, method: 'GET' })
    .reply(200, sheetsBody, { headers: { 'Content-Type': 'application/json' } });
}

describe('syncSpreadsheetToD1', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await env.DB.exec('DELETE FROM survey_config');
  });

  it('throws when GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email', async () => {
    const testEnv = { ...env, GOOGLE_SERVICE_ACCOUNT_JSON: '{}', SPREADSHEET_ID: 'x' };
    await expect(syncSpreadsheetToD1(testEnv)).rejects.toThrow(
      'Invalid GOOGLE_SERVICE_ACCOUNT_JSON',
    );
  });

  it('throws when SPREADSHEET_ID is empty', async () => {
    const testEnv = {
      ...env,
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'a@b.com',
        private_key: 'key',
      }),
      SPREADSHEET_ID: '',
    };
    await expect(syncSpreadsheetToD1(testEnv)).rejects.toThrow('SPREADSHEET_ID is not configured');
  });

  it('throws when no active questions are found', async () => {
    const pem = await generateTestPem();
    const sheetsBody = mockSheetsResponse([
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
      ['nps', 'nps_score', 'Score?', 'TRUE', 'FALSE', '1', '', '', '', '', '', ''],
    ]);
    setupFetchMocks(sheetsBody);

    const testEnv = {
      ...env,
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'test@test.iam.gserviceaccount.com',
        private_key: pem,
      }),
      SPREADSHEET_ID: 'test-id',
    };

    await expect(syncSpreadsheetToD1(testEnv)).rejects.toThrow('no active questions');
    fetchMock.deactivate();
  });

  it('throws when Google token exchange fails', async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();

    fetchMock
      .get('https://oauth2.googleapis.com')
      .intercept({ path: '/token', method: 'POST' })
      .reply(401, 'Unauthorized');

    const pem = await generateTestPem();
    const testEnv = {
      ...env,
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'test@test.iam.gserviceaccount.com',
        private_key: pem,
      }),
      SPREADSHEET_ID: 'test-id',
    };

    await expect(syncSpreadsheetToD1(testEnv)).rejects.toThrow('Token exchange failed');
    fetchMock.deactivate();
  });

  it('throws when Sheets API fails', async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();

    fetchMock
      .get('https://oauth2.googleapis.com')
      .intercept({ path: '/token', method: 'POST' })
      .reply(200, JSON.stringify({ access_token: 't', token_type: 'Bearer', expires_in: 3600 }), {
        headers: { 'Content-Type': 'application/json' },
      });

    fetchMock
      .get('https://sheets.googleapis.com')
      .intercept({ path: /\/v4\/spreadsheets\/.*/, method: 'GET' })
      .reply(403, 'Forbidden');

    const pem = await generateTestPem();
    const testEnv = {
      ...env,
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'test@test.iam.gserviceaccount.com',
        private_key: pem,
      }),
      SPREADSHEET_ID: 'test-id',
    };

    await expect(syncSpreadsheetToD1(testEnv)).rejects.toThrow('Sheets API failed');
    fetchMock.deactivate();
  });

  it('writes config to D1 on success', async () => {
    const pem = await generateTestPem();
    const sheetsBody = mockSheetsResponse([
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
      ['nps', 'nps_score', 'Score?', 'TRUE', 'TRUE', '1', '', '', '', '', '', ''],
    ]);
    setupFetchMocks(sheetsBody);

    const testEnv = {
      ...env,
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'test@test.iam.gserviceaccount.com',
        private_key: pem,
      }),
      SPREADSHEET_ID: 'test-id',
    };

    await syncSpreadsheetToD1(testEnv);

    const row = await env.DB.prepare('SELECT config_json FROM survey_config WHERE id = 1').first<{
      config_json: string;
    }>();
    expect(row).toBeTruthy();
    const config = JSON.parse(row!.config_json);
    expect(config.survey_title).toBe('Test Survey');
    expect(config.questions).toHaveLength(1);
    fetchMock.deactivate();
  });
});

describe('runSpreadsheetSync', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('catches errors and logs them', async () => {
    const testEnv = {
      ...env,
      GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
      SPREADSHEET_ID: '',
      SLACK_WEBHOOK_URL: '',
    };

    // Should not throw
    await runSpreadsheetSync(testEnv);
  });

  it('notifies Slack on error when webhook URL is set', async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();

    // Mock Slack webhook
    fetchMock
      .get('https://hooks.slack.com')
      .intercept({ path: '/test', method: 'POST' })
      .reply(200, 'ok');

    const testEnv = {
      ...env,
      GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
      SPREADSHEET_ID: '',
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test',
    };

    await runSpreadsheetSync(testEnv);
    fetchMock.deactivate();
  });
});
