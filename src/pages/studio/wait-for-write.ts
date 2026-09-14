import type { Page, Response } from '@playwright/test';

/** How to recognise the write a UI action triggers. */
export interface WriteMatch {
  /** The HTTP method(s) the write uses; any method matches when omitted. */
  readonly method?: string | readonly string[];
  /** A substring the response URL must contain (e.g. the endpoint path + key). */
  readonly urlIncludes?: string;
  /** A full predicate, for the few writes a substring cannot pin down. */
  readonly predicate?: (response: Response) => boolean;
  /** A per-write timeout, for writes slower than the default (e.g. a settings save). */
  readonly timeout?: number;
}

/**
 * Runs `action` and waits for the write it triggers, returning that response —
 * the "click, wait for the resulting POST/PUT/PATCH, read its status" shape the
 * Studio page objects share. The action and the wait start together, so the
 * response is never missed. Callers narrow the return themselves (`.status()`,
 * `.text()`); page objects don't assert.
 */
export async function waitForWrite(
  page: Page,
  match: WriteMatch,
  action: () => Promise<unknown>,
): Promise<Response> {
  const methods = match.method === undefined ? undefined : [match.method].flat();
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) => {
        if (methods !== undefined && !methods.includes(response.request().method())) return false;
        if (match.urlIncludes !== undefined && !response.url().includes(match.urlIncludes))
          return false;
        return match.predicate ? match.predicate(response) : true;
      },
      match.timeout !== undefined ? { timeout: match.timeout } : undefined,
    ),
    action(),
  ]);
  return response;
}
