import type { APIRequestContext } from '@playwright/test';

/**
 * A stub `APIRequestContext` for the mailbox-provider unit specs: records every
 * request as `METHOD url` and answers from a route table, so no mailbox service
 * or network is involved.
 */

export interface StubResponse {
  readonly status?: number;
  readonly body?: unknown;
}

export interface StubRoute {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  /** A string matches the end of the URL; a RegExp is tested against it. */
  readonly match: string | RegExp;
  /** Answered in order; the last one repeats. */
  readonly responses: StubResponse[];
}

const matches = (url: string, match: StubRoute['match']) =>
  typeof match === 'string' ? url.endsWith(match) : match.test(url);

export function stubRequest(routes: StubRoute[]): {
  request: APIRequestContext;
  calls: string[];
} {
  const calls: string[] = [];

  const answer = (method: NonNullable<StubRoute['method']>, url: string) => {
    calls.push(`${method} ${url}`);
    const route = routes.find(
      (candidate) => (candidate.method ?? 'GET') === method && matches(url, candidate.match),
    );
    if (route === undefined) {
      throw new Error(`Unexpected request: ${method} ${url}`);
    }
    const next = route.responses.length > 1 ? route.responses.shift()! : route.responses[0]!;
    const status = next.status ?? 200;
    return {
      ok: () => status < 400,
      status: () => status,
      json: () => Promise.resolve(next.body),
      text: () => Promise.resolve(JSON.stringify(next.body ?? '')),
    };
  };

  const request = {
    get: (url: string) => Promise.resolve(answer('GET', url)),
    post: (url: string) => Promise.resolve(answer('POST', url)),
    delete: (url: string) => Promise.resolve(answer('DELETE', url)),
  } as unknown as APIRequestContext;

  return { request, calls };
}
