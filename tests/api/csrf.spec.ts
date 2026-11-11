import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { ApiError, fetchCsrfToken } from '../../src/api';
import { loadConfig } from '../../src/config';

/**
 * What the CSRF token fetch makes of an install that redirects a request with no
 * live session to an external sign-in. Following the redirect is how a context
 * that still holds the identity provider's session gets signed back in, so the
 * fetch must take the token it lands on; only a redirect that ends anywhere else
 * is a refusal. No browser or target.
 */

const config = loadConfig({
  LMS_BASE_URL: 'https://lms.example.com',
  APPS_BASE_URL: 'https://apps.example.com',
});
const TOKEN_URL = 'https://lms.example.com/csrf/api/v1/token';

/**
 * A request context whose token endpoint redirects (302) when redirects are not
 * followed, and whose followed redirect ends at `landsOn` with a 200 carrying a
 * token, as a browser following it would.
 */
const redirecting = (landsOn: string): APIRequestContext => {
  const redirect = { ok: () => false, status: () => 302, text: () => Promise.resolve('') };
  const landed = {
    ok: () => true,
    status: () => 200,
    url: () => landsOn,
    json: () => Promise.resolve({ csrfToken: 'fresh' }),
    text: () => Promise.resolve('<!DOCTYPE html>'),
  };
  return {
    get: (_url: string, options?: { maxRedirects?: number }) =>
      Promise.resolve(options?.maxRedirects === 0 ? redirect : landed),
  } as unknown as APIRequestContext;
};

const redirectResponse = { ok: () => false, status: () => 302, text: () => Promise.resolve('') };

/**
 * Playwright's timeout error as it really reads: a first line, then a call log
 * listing each request's headers, the jar's cookies among them.
 */
const TIMEOUT_MESSAGE = [
  'apiRequestContext.get: Timeout 15000ms exceeded.',
  'Call log:',
  '  - → GET https://lms.example.com/csrf/api/v1/token',
  '    - accept: */*',
  '    - cookie: sessionid=session-cookie-value',
].join('\n');

/** A token endpoint that redirects (302), and whose followed redirect times out. */
const timingOutFollow = (): APIRequestContext =>
  ({
    get: (_url: string, options?: { maxRedirects?: number }) =>
      options?.maxRedirects === 0
        ? Promise.resolve(redirectResponse)
        : Promise.reject(new Error(TIMEOUT_MESSAGE)),
  }) as unknown as APIRequestContext;

/** A token endpoint that always redirects (302), recording each GET's `maxRedirects`. */
const recordingRedirects = (gets: (number | undefined)[]): APIRequestContext =>
  ({
    get: (_url: string, options?: { maxRedirects?: number }) => {
      gets.push(options?.maxRedirects);
      return Promise.resolve(redirectResponse);
    },
  }) as unknown as APIRequestContext;

test.describe('fetchCsrfToken — redirected to sign-in', { tag: '@unit' }, () => {
  test('takes the token when following the redirect signs the context back in', async () => {
    await expect(fetchCsrfToken(redirecting(TOKEN_URL), config)).resolves.toBe('fresh');
  });

  for (const { where, landsOn } of [
    {
      where: "the identity provider's sign-in page",
      landsOn: 'https://sso.example.com/realms/x/protocol/openid',
    },
    { where: 'another page on the same host', landsOn: 'https://lms.example.com/dashboard' },
  ]) {
    test(`reports the redirect's own status when following it ends on ${where}`, async () => {
      const error: unknown = await fetchCsrfToken(redirecting(landsOn), config).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(302);
    });
  }

  test('reports the redirect, not the failure, when following it times out', async () => {
    // The provider's sign-in chain can outlast the request timeout; that is a
    // redirect that did not come back with a token, like any other.
    const error: unknown = await fetchCsrfToken(timingOutFollow(), config).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(302);
    // Why the follow failed stays in the report: its first line, not the call
    // log of request headers (and cookies) after it.
    expect((error as ApiError).message).toContain(
      'following it failed: apiRequestContext.get: Timeout 15000ms exceeded.).',
    );
    expect((error as ApiError).message).not.toContain('Call log');
    expect((error as ApiError).message).not.toContain('session-cookie-value');
  });

  test('does not follow the redirect when told not to', async () => {
    const gets: (number | undefined)[] = [];

    const error: unknown = await fetchCsrfToken(
      recordingRedirects(gets),
      config,
      config.baseUrls.lms,
      { followRedirect: false },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(302);
    // One request, made without following redirects.
    expect(gets).toHaveLength(1);
    expect(gets[0]).toBe(0);
  });
});
