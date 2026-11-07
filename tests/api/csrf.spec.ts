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
});
