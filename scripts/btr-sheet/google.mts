/**
 * The smallest Google client the publisher needs: a service-account access token
 * (RS256 JWT signed with `node:crypto`, exchanged at the OAuth token endpoint) and
 * the five Sheets v4 REST calls the plan uses. No SDK — the surface is tiny and
 * the suite's dependency footprint stays as it is.
 *
 * `fetch` and `sleep` are injectable so the client is unit-tested with stubs.
 */

import { createSign } from 'node:crypto';

import type { Grid } from './render.mts';

/** The fields of a service-account JSON key this module uses. */
export interface ServiceAccountKey {
  readonly client_email: string;
  readonly private_key: string;
  /** Present in real keys; defaults to Google's endpoint when absent. */
  readonly token_uri?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Retry budget for transient Sheets/OAuth failures (429 and 5xx). */
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = 1_000;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** Parses the key from the secret's JSON text, with a clear error on a bad value. */
export function parseServiceAccountKey(json: string): ServiceAccountKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('BTR_SHEET_CREDENTIALS is not valid JSON (expected a service-account key).');
  }
  const key = parsed as Partial<ServiceAccountKey>;
  if (typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
    throw new Error(
      'BTR_SHEET_CREDENTIALS is missing client_email/private_key (expected a service-account key).',
    );
  }
  return { client_email: key.client_email, private_key: key.private_key, token_uri: key.token_uri };
}

/** Builds and signs the JWT assertion Google exchanges for an access token. */
export function signAssertion(key: ServiceAccountKey, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SHEETS_SCOPE,
      aud: key.token_uri ?? DEFAULT_TOKEN_URI,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(key.private_key).toString('base64url');
  return `${header}.${claims}.${signature}`;
}

/** Exchanges a signed assertion for a bearer token. Never logs key material. */
export async function mintAccessToken(
  key: ServiceAccountKey,
  fetchImpl: FetchLike = fetch,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signAssertion(key, nowSeconds),
  });
  const response = await fetchImpl(key.token_uri ?? DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(
      `Google token endpoint answered ${response.status}; the service-account key may be revoked or malformed.`,
    );
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('Google token endpoint returned no access_token.');
  }
  return json.access_token;
}

/** Pulls the spreadsheet id out of any Google Sheets URL (or accepts a bare id). */
export function parseSpreadsheetId(urlOrId: string): string {
  const match = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(urlOrId);
  if (match?.[1]) {
    return match[1];
  }
  if (/^[A-Za-z0-9_-]{20,}$/.test(urlOrId)) {
    return urlOrId;
  }
  throw new Error(
    `'${urlOrId}' is not a Google Sheets URL (expected https://docs.google.com/spreadsheets/d/<id>/…).`,
  );
}

/** Error from the Sheets API, with the hints an operator needs. */
export class SheetsApiError extends Error {
  readonly status: number;
  readonly operation: string;

  constructor(status: number, operation: string, detail: string, hint = '') {
    super(`Sheets API ${operation} failed with HTTP ${status}: ${detail}${hint ? ` ${hint}` : ''}`);
    this.status = status;
    this.operation = operation;
  }
}

export interface SheetsClientOptions {
  readonly fetchImpl?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  /** For the 403 hint: who the sheet must be shared with. */
  readonly clientEmail?: string;
}

/** Shape of `spreadsheets.get` we read. */
export interface SpreadsheetResource {
  readonly properties?: { readonly title?: string };
  readonly sheets?: readonly {
    readonly properties?: {
      readonly sheetId?: number;
      readonly title?: string;
      readonly index?: number;
    };
  }[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Thin, retrying wrapper over the Sheets v4 endpoints the publisher uses. */
export class SheetsClient {
  private readonly token: string;
  private readonly spreadsheetId: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly clientEmail: string;

  constructor(token: string, spreadsheetId: string, options: SheetsClientOptions = {}) {
    this.token = token;
    this.spreadsheetId = spreadsheetId;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.clientEmail = options.clientEmail ?? '(the service account)';
  }

  get(): Promise<SpreadsheetResource> {
    return this.call<SpreadsheetResource>(
      'GET',
      '?fields=properties.title,sheets.properties',
      'get',
    );
  }

  batchUpdate(requests: readonly Readonly<Record<string, unknown>>[]): Promise<unknown> {
    if (requests.length === 0) {
      return Promise.resolve(undefined);
    }
    return this.call('POST', ':batchUpdate', 'batchUpdate', { requests });
  }

  async valuesGet(range: string): Promise<Grid | undefined> {
    const result = await this.call<{ values?: Grid }>(
      'GET',
      `/values/${encodeURIComponent(range)}`,
      'values.get',
    );
    return result.values;
  }

  valuesClear(range: string): Promise<unknown> {
    return this.call('POST', `/values/${encodeURIComponent(range)}:clear`, 'values.clear', {});
  }

  valuesBatchUpdate(data: readonly { range: string; values: Grid }[]): Promise<unknown> {
    if (data.length === 0) {
      return Promise.resolve(undefined);
    }
    return this.call('POST', '/values:batchUpdate', 'values.batchUpdate', {
      valueInputOption: 'USER_ENTERED',
      data,
    });
  }

  valuesAppend(range: string, values: Grid): Promise<unknown> {
    const query = 'valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
    return this.call(
      'POST',
      `/values/${encodeURIComponent(range)}:append?${query}`,
      'values.append',
      { values },
    );
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    operation: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${SHEETS_API}/${this.spreadsheetId}${path}`;
    for (let attempt = 1; ; attempt += 1) {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (response.ok) {
        return (await response.json()) as T;
      }
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < MAX_ATTEMPTS) {
        await this.sleep(BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
      throw new SheetsApiError(
        response.status,
        operation,
        await describeError(response),
        this.hintFor(response.status),
      );
    }
  }

  private hintFor(status: number): string {
    switch (status) {
      case 403:
        return `Share the spreadsheet with ${this.clientEmail} as an Editor.`;
      case 404:
        return 'Check the spreadsheet URL; the id was not found.';
      default:
        return '';
    }
  }
}

async function describeError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: { message?: string } };
    return json.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
