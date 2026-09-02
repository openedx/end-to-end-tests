import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { accountSignIn, accountSignInThroughUi, accountSignOutThroughUi } from '../../src/accounts';
import { loadConfig, type Env } from '../../src/config';
import { calls } from './fixtures/auth-flows-backend.plugin';

/**
 * The auth flows dispatch to the configured backend, falling back to the stock
 * Open edX flow. Pure unit tests: the overriding fixture plugin records its calls
 * rather than driving a browser, and the fallback path is asserted by the request
 * the default flow makes, so nothing here needs a live target.
 */

const PLUGIN = 'tests/accounts/fixtures/auth-flows-backend.plugin.ts';

const configWith = (overrides: Env = {}) =>
  loadConfig({
    LMS_BASE_URL: 'http://local.openedx.io',
    APPS_BASE_URL: 'http://apps.local.openedx.io',
    ...overrides,
  });

/** Config selecting the fixture plugin that overrides every flow. */
const pluginConfig = () =>
  configWith({ CUSTOM_ACCOUNT_BACKEND_PLUGINS: PLUGIN, ACCOUNT_BACKEND: 'auth-flows-fixture' });

const credentials = { emailOrUsername: 'learner@example.com', password: 'pw' };

/** Stand-ins: the overriding backend never touches either. */
const noopPage = {} as Page;
const noopRequest = {} as APIRequestContext;

test.describe('account auth flows — backend overrides', { tag: '@unit' }, () => {
  test.beforeEach(() => {
    calls.length = 0;
  });

  test('signIn dispatches to the backend', async () => {
    await accountSignIn({ config: pluginConfig(), request: noopRequest, credentials });

    expect(calls).toEqual(['signIn:learner@example.com']);
  });

  test('signInThroughUi dispatches to the backend', async () => {
    await accountSignInThroughUi({ config: pluginConfig(), page: noopPage, credentials });

    expect(calls).toEqual(['signInThroughUi:learner@example.com']);
  });

  test('signOutThroughUi dispatches to the backend', async () => {
    await accountSignOutThroughUi({
      config: pluginConfig(),
      page: noopPage,
      username: 'learner-1',
    });

    expect(calls).toEqual(['signOutThroughUi:learner-1']);
  });
});

test.describe('account auth flows — defaults', { tag: '@unit' }, () => {
  test('a backend without overrides falls back to the login-session API', async () => {
    const requested: string[] = [];
    // Minimal fake: the default flow fetches a CSRF token, then posts the form.
    const request = {
      get: (url: string) => {
        requested.push(`GET ${url}`);
        return Promise.resolve({
          ok: () => true,
          status: () => 200,
          json: () => Promise.resolve({ csrfToken: 'token' }),
          text: () => Promise.resolve(''),
        });
      },
      post: (url: string) => {
        requested.push(`POST ${url}`);
        return Promise.resolve({
          ok: () => true,
          status: () => 200,
          text: () => Promise.resolve(''),
        });
      },
    } as unknown as APIRequestContext;

    // The default `automatic` backend implements no auth flows.
    await accountSignIn({ config: configWith(), request, credentials });

    expect(requested).toEqual([
      'GET http://local.openedx.io/csrf/api/v1/token',
      'POST http://local.openedx.io/api/user/v2/account/login_session/',
    ]);
  });
});
