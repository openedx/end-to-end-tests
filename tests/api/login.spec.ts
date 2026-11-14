import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { CSRF_HEADER, csrfTokenFromCookies, loginSession } from '../../src/api';
import { loadConfig } from '../../src/config';

/**
 * Pure unit tests for the sign-in's CSRF-cookie fallback: which `csrftoken`, of
 * those a cookie jar holds, the LMS would actually receive. Domains are written
 * as Playwright stores them — a host-only cookie under its bare host, a `Domain`
 * cookie with a leading dot. No browser or target.
 */

const LMS_LOGIN = 'https://lms.example.com/api/user/v2/account/login_session/';
const csrftoken = (domain: string, value = domain) => ({ name: 'csrftoken', domain, value });
/** A fake response with an empty body: `failure` when `failing`, otherwise 200. */
const answer = (failing: boolean, failure: number) => {
  const status = failing ? failure : 200;
  return { ok: () => status === 200, status: () => status, text: () => Promise.resolve('') };
};

/**
 * A request whose token endpoint redirects anonymous visitors (302) and whose jar
 * holds the LMS's `csrftoken`. `follows` records each GET on the token endpoint
 * made with redirects followed.
 */
const redirectingTokenEndpoint = (follows: string[]): APIRequestContext =>
  ({
    get: (url: string, options?: { maxRedirects?: number }) => {
      const tokenEndpoint = url.includes('/csrf/');
      if (tokenEndpoint && options?.maxRedirects !== 0) follows.push(url);
      return Promise.resolve({
        ok: () => !tokenEndpoint,
        status: () => (tokenEndpoint ? 302 : 200),
        text: () => Promise.resolve(''),
      });
    },
    post: () => Promise.resolve({ ok: () => true, status: () => 200 }),
    storageState: () =>
      Promise.resolve({ cookies: [csrftoken('lms.example.com', 'lms')], origins: [] }),
  }) as unknown as APIRequestContext;

test.describe('csrfTokenFromCookies', { tag: '@unit' }, () => {
  test('takes a host-only cookie for exactly the LMS host', () => {
    expect(csrfTokenFromCookies([csrftoken('lms.example.com')], LMS_LOGIN)).toBe('lms.example.com');
  });

  test('ignores a host-only cookie for a parent domain, which the LMS is not sent', () => {
    expect(csrfTokenFromCookies([csrftoken('example.com')], LMS_LOGIN)).toBeUndefined();
  });

  test('takes a domain cookie for the LMS host or a parent domain', () => {
    expect(csrfTokenFromCookies([csrftoken('.example.com')], LMS_LOGIN)).toBe('.example.com');
    expect(csrfTokenFromCookies([csrftoken('.lms.example.com')], LMS_LOGIN)).toBe(
      '.lms.example.com',
    );
  });

  test('matches a suffix only on a dot boundary', () => {
    expect(csrfTokenFromCookies([csrftoken('.ample.com')], LMS_LOGIN)).toBeUndefined();
    expect(csrfTokenFromCookies([csrftoken('ms.example.com')], LMS_LOGIN)).toBeUndefined();
    expect(
      csrfTokenFromCookies([csrftoken('.example.com')], 'https://evil-example.com/'),
    ).toBeUndefined();
  });
});

test.describe('loginSession — CSRF cookie fallback', { tag: '@unit' }, () => {
  test("sends the LMS's csrftoken when an identity provider's comes first", async () => {
    const config = loadConfig({
      LMS_BASE_URL: 'https://lms.example.com',
      APPS_BASE_URL: 'https://apps.example.com',
    });
    const sent: (string | undefined)[] = [];
    // Minimal fake: the token endpoint redirects anonymous visitors (302), so the
    // token comes from the jar, where the provider's host-only cookie precedes
    // the LMS's own.
    const request = {
      get: (url: string) => {
        const redirected = url.includes('/csrf/');
        return Promise.resolve({
          ok: () => !redirected,
          status: () => (redirected ? 302 : 200),
          text: () => Promise.resolve(''),
        });
      },
      post: (_url: string, options: { headers: Record<string, string> }) => {
        sent.push(options.headers[CSRF_HEADER]);
        return Promise.resolve({ ok: () => true, status: () => 200 });
      },
      storageState: () =>
        Promise.resolve({
          cookies: [csrftoken('example.com', 'idp'), csrftoken('lms.example.com', 'lms')],
          origins: [],
        }),
    } as unknown as APIRequestContext;

    await loginSession(request, config, { emailOrUsername: 'learner', password: 'pw' });

    expect(sent).toEqual(['lms']);
  });

  test("names the token endpoint's status when neither source gives a token", async () => {
    const config = loadConfig({
      LMS_BASE_URL: 'https://lms.example.com',
      APPS_BASE_URL: 'https://apps.example.com',
    });
    // The token endpoint fails outright (503), and the login-session endpoint
    // sets no cookie, so there is nothing to fall back on either.
    const request = {
      get: (url: string) => Promise.resolve(answer(url.includes('/csrf/'), 503)),
      storageState: () => Promise.resolve({ cookies: [], origins: [] }),
    } as unknown as APIRequestContext;

    await expect(
      loginSession(request, config, { emailOrUsername: 'learner', password: 'pw' }),
    ).rejects.toThrow(/CSRF endpoint \(HTTP 503\)/);
  });

  test("signs in without following the token endpoint's redirect", async () => {
    const config = loadConfig({
      LMS_BASE_URL: 'https://lms.example.com',
      APPS_BASE_URL: 'https://apps.example.com',
    });
    // A signed-out context has no session for that redirect to restore, and on an
    // install whose sign-in chain is slow, following it outlasts the timeout.
    const follows: string[] = [];

    await loginSession(redirectingTokenEndpoint(follows), config, {
      emailOrUsername: 'learner',
      password: 'pw',
    });

    expect(follows).toEqual([]);
  });
});
