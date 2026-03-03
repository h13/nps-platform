import { describe, it, expect } from 'vitest';
import { verifyBearerToken } from './auth';
import type { Env } from '../types';

function makeEnv(apiKey = 'test-api-key'): Env {
  return { NPS_API_KEY: apiKey } as Env;
}

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) {
    headers.set('Authorization', authHeader);
  }
  return new Request('https://example.com', { headers });
}

describe('verifyBearerToken', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const result = verifyBearerToken(makeRequest(), makeEnv());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const body = await result!.json() as { error: string };
    expect(body.error).toBe('Authorization header required');
  });

  it('returns 401 when scheme is not Bearer', async () => {
    const result = verifyBearerToken(makeRequest('Basic abc'), makeEnv());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const body = await result!.json() as { error: string };
    expect(body.error).toBe('Invalid token');
  });

  it('returns 401 when token does not match', async () => {
    const result = verifyBearerToken(makeRequest('Bearer wrong-key'), makeEnv());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns 401 when header has extra parts', async () => {
    const result = verifyBearerToken(makeRequest('Bearer test-api-key extra'), makeEnv());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns null when token is valid', () => {
    const result = verifyBearerToken(makeRequest('Bearer test-api-key'), makeEnv());
    expect(result).toBeNull();
  });
});
