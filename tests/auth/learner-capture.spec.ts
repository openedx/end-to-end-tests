import { test, expect } from '@playwright/test';
import type { APIRequestContext, Browser } from '@playwright/test';

import { AUTH_JWT_COOKIE, ApiAuthProvider } from '../../src/auth';
import { LOGIN_SESSION_PATH } from '../../src/api';
import { loadConfig, type Env } from '../../src/config';

/**
 * The learner role captures a session that is genuinely authenticated.
 *
 * On a stock install registration authenticates the request context itself, so no
 * separate sign-in is made. A backend whose accounts originate elsewhere leaves
 * the jar anonymous, and the provider must sign in rather than store an anonymous
 * state. Pure unit tests: a stub request context reports whichever cookies the
 * case is about.
 */

const PLUGIN = 'tests/accounts/fixtures/register-backend.plugin.ts';

const configWith = (overrides: Env = {}) =>
  loadConfig({
    LMS_BASE_URL: 'http://local.openedx.io',
    APPS_BASE_URL: 'http://apps.local.openedx.io',
    ...overrides,
  });

/**
 * Stub request context whose cookie jar either does or does not look
 * authenticated, recording every call so the test can assert what ran.
 */
/** The learner role never launches a browser, so a stand-in satisfies the type. */
const noopBrowser = {} as Browser;

function stubRequest({ authenticated }: { authenticated: boolean }) {
  const calls: string[] = [];
  const cookies = authenticated ? [{ name: AUTH_JWT_COOKIE }] : [];
  const request = {
    get: (url: string) => {
      calls.push(`GET ${url}`);
      return Promise.resolve({
        ok: () => true,
        status: () => 200,
        json: () => Promise.resolve({ csrfToken: 'token' }),
        text: () => Promise.resolve(''),
      });
    },
    post: (url: string) => {
      calls.push(`POST ${url}`);
      return Promise.resolve({
        ok: () => true,
        status: () => 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({}),
      });
    },
    storageState: () => Promise.resolve({ cookies, origins: [] }),
  } as unknown as APIRequestContext;
  return { request, calls };
}

test.describe('ApiAuthProvider — learner capture', { tag: '@unit' }, () => {
  test('does not sign in again when registration authenticated the context', async () => {
    const config = configWith();
    const { request, calls } = stubRequest({ authenticated: true });

    const state = await new ApiAuthProvider().authenticate('learner', {
      config,
      request,
      browser: noopBrowser,
    });

    expect(state.cookies.map((cookie) => cookie.name)).toContain(AUTH_JWT_COOKIE);
    expect(calls.filter((call) => call.includes(LOGIN_SESSION_PATH))).toEqual([]);
  });

  test('signs in through the backend when the captured jar is still anonymous', async () => {
    // This backend creates the account elsewhere, so registration leaves the
    // request context unauthenticated.
    const config = configWith({
      CUSTOM_ACCOUNT_BACKEND_PLUGINS: PLUGIN,
      ACCOUNT_BACKEND: 'register-fixture',
    });
    const { request, calls } = stubRequest({ authenticated: false });

    await new ApiAuthProvider().authenticate('learner', { config, request, browser: noopBrowser });

    expect(calls).toContain(`POST http://local.openedx.io${LOGIN_SESSION_PATH}`);
  });
});
