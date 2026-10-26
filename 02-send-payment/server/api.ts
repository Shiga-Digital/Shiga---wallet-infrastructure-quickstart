import type { Config } from './config.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST';
  customerId?: string;
  body?: unknown;
  idempotencyKey?: string;
}
export type Api = (path: string, options?: ApiOptions) => Promise<unknown>;

export function createApi(config: Config, fetcher: typeof fetch = fetch): Api {
  return async (path, options = {}) => {
    if (!path.startsWith('/v1/') || path.startsWith('//')) throw new Error('Invalid API path');
    const headers: Record<string, string> = {
      Authorization: 'Bearer ' + config.apiKey,
      Accept: 'application/json',
    };
    if (options.customerId) headers['x-customer-id'] = options.customerId;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    let response: Response;
    try {
      response = await fetcher(config.apiUrl + path, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new HttpError(
        502,
        'upstream_unavailable',
        'The API did not answer. Check the operation status before retrying a transfer.',
      );
    }
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new HttpError(
        502,
        'invalid_upstream_response',
        'The API returned an invalid response.',
      );
    }
    if (
      !envelope ||
      typeof envelope !== 'object' ||
      !('success' in envelope) ||
      !('data' in envelope)
    )
      throw new HttpError(
        502,
        'invalid_upstream_response',
        'The API returned an invalid envelope.',
      );
    const body = envelope as { success: unknown; data: unknown };
    if (!response.ok || body.success !== true) {
      const data =
        body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {};
      const code =
        typeof data.code === 'string' && /^[a-z_]{1,80}$/.test(data.code)
          ? data.code
          : 'upstream_error';
      const requestId =
        typeof data.request_id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(data.request_id)
          ? data.request_id
          : undefined;
      throw new HttpError(
        response.status >= 400 ? response.status : 502,
        code,
        'Wallet Infrastructure refused the request.',
        requestId,
      );
    }
    return body.data;
  };
}
