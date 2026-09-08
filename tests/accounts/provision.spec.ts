import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { provisionLearnerAccount } from '../../src/accounts';
import { REGISTRATION_PATH } from '../../src/api';
import { loadConfig, type Env } from '../../src/config';
import { registered } from './fixtures/register-backend.plugin';

/**
 * Provisioning routes account creation through the backend when it implements
 * `register`, and through the LMS registration API otherwise. Pure unit tests: a
 * stub request context records the calls, so nothing here needs a live target.
 */

const PLUGIN = 'tests/accounts/fixtures/register-backend.plugin.ts';

const configWith = (overrides: Env = {}) =>
  loadConfig({
    LMS_BASE_URL: 'http://local.openedx.io',
    APPS_BASE_URL: 'http://apps.local.openedx.io',
    ...overrides,
  });

/** Minimal request context: records every URL and always answers 200. */
function stubRequest() {
  const posted: string[] = [];
  const request = {
    post: (url: string) => {
      posted.push(url);
      return Promise.resolve({
        ok: () => true,
        status: () => 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({}),
      });
    },
  } as unknown as APIRequestContext;
  return { request, posted };
}

test.describe('provisionLearnerAccount', { tag: '@unit' }, () => {
  test('registers through the LMS API when the backend has no register step', async () => {
    const { request, posted } = stubRequest();

    await provisionLearnerAccount(request, configWith());

    expect(posted).toEqual([`http://local.openedx.io${REGISTRATION_PATH}`]);
  });

  test('lets a backend own account creation instead of the LMS API', async () => {
    registered.length = 0;
    const config = configWith({
      CUSTOM_ACCOUNT_BACKEND_PLUGINS: PLUGIN,
      ACCOUNT_BACKEND: 'register-fixture',
    });
    const { request, posted } = stubRequest();

    const identity = await provisionLearnerAccount(request, config);

    expect(registered).toEqual([identity.username]);
    // The LMS registration endpoint is not reachable on such an install, so it
    // must not be called at all — not merely be harmless.
    expect(posted).toEqual([]);
  });
});
