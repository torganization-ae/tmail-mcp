import { safeErrorMessage } from './safe-error.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, message: string, body: string) {
    super(`api error ${status}: ${safeErrorMessage(message || body)}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function extractErrorMessage(raw: string): string {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    for (const k of ['detail', 'message', 'title', 'error']) {
      const v = m[k];
      if (typeof v === 'string' && v) {
        return safeErrorMessage(v);
      }
    }
  } catch {
    // not json
  }
  return safeErrorMessage(raw);
}

export class ApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey = '') {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
    this.apiKey = apiKey.trim();
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim();
  }

  private async do<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T | undefined> {
    const headers: Record<string, string> = {};
    let payload: string | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const raw = await resp.text();
    if (resp.status >= 400) {
      throw new ApiError(resp.status, extractErrorMessage(raw), raw);
    }
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  }

  async get<T>(path: string): Promise<T> {
    return (await this.do<T>('GET', path)) as T;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return (await this.do<T>('POST', path, body)) as T;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return (await this.do<T>('PUT', path, body)) as T;
  }

  async delete<T>(path: string): Promise<T> {
    return (await this.do<T>('DELETE', path)) as T;
  }

  async getRaw(path: string): Promise<string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const raw = await resp.text();
    if (resp.status >= 400) {
      throw new ApiError(resp.status, extractErrorMessage(raw), raw);
    }
    return raw;
  }
}
