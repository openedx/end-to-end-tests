import { test, expect } from '@playwright/test';
import type { APIRequestContext, Browser } from '@playwright/test';

import { ApiAuthProvider } from '../../src/auth';
import { STUDIO_HOME_PATH, STUDIO_LOGIN_PATH } from '../../src/api';
import { loadConfig, type Env } from '../../src/config';
import { calls } from '../accounts/fixtures/external-identity-backend.plugin';

/**
 * The authoring roles reach Studio through the account backend, so an install
 * whose identity lives outside the LMS replaces the Studio sign-in — and the
 * course-creator grant — through `ACCOUNT_BACKEND` alone. Pure unit tests: the
 * fixture backend records what ran, and a stub request context answers the one
 * read the author path still makes against Studio (its course-creator status).
 */

const PLUGIN = 'tests/accounts/fixtures/external-identity-backend.plugin.ts';
const STUDIO = 'http://studio.local.openedx.io';

const configWith = (overrides: Env = {}) =>
  loadConfig({
    LMS_BASE_URL: 'http://local.openedx.io',
    APPS_BASE_URL: 'http://apps.local.openedx.io',
    CMS_BASE_URL: STUDIO,
    CAPABILITIES: 'studio',
    ...overrides,
  });

/** Neither role launches a browser, so a stand-in satisfies the type. */
const noopBrowser = {} as Browser;

/**
 * Stub request context: the jar stays anonymous (the external backend creates the
 * account elsewhere), Studio Home reports the given course-creator status, and
 * every call is recorded so the test can assert what did and did not run.
 */
function stubRequest({ creatorStatus }: { creatorStatus: string }) {
  const requested: string[] = [];
  const home = JSON.stringify({ course_creator_status: creatorStatus, courses: [] });
  const request = {
    get: (url: string) => {
      requested.push(`GET ${url}`);
      return Promise.resolve({
        ok: () => true,
        status: () => 200,
        url: () => url,
        json: () => Promise.resolve(JSON.parse(home)),
        text: () => Promise.resolve(home),
      });
    },
    post: (url: string) => {
      requested.push(`POST ${url}`);
      return Promise.resolve({
        ok: () => true,
        status: () => 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });
    },
    storageState: () => Promise.resolve({ cookies: [], origins: [] }),
  } as unknown as APIRequestContext;
  return { request, requested };
}

test.describe(
  'ApiAuthProvider — author capture on an external-identity install',
  { tag: '@unit' },
  () => {
    test.beforeEach(() => {
      calls.length = 0;
    });

    test('author signs in to Studio and is granted through the backend, not the stock flows', async () => {
      const config = configWith({
        CUSTOM_ACCOUNT_BACKEND_PLUGINS: PLUGIN,
        ACCOUNT_BACKEND: 'external-identity-fixture',
      });
      const { request, requested } = stubRequest({ creatorStatus: 'unrequested' });

      await new ApiAuthProvider().authenticate('author', { config, request, browser: noopBrowser });

      // Order matters: the account exists, then the LMS session, then Studio's, then the grant.
      expect(calls.map((call) => call.split(':')[0])).toEqual([
        'register',
        'signIn',
        'signInStudio',
        'grantCourseCreator',
      ]);
      // The only Studio call the provider makes itself is the status read.
      expect(requested).toEqual([`GET ${STUDIO}${STUDIO_HOME_PATH}`]);
      expect(requested.some((call) => call.includes(STUDIO_LOGIN_PATH))).toBe(false);
    });

    test('author skips the grant when Studio already reports it granted', async () => {
      const config = configWith({
        CUSTOM_ACCOUNT_BACKEND_PLUGINS: PLUGIN,
        ACCOUNT_BACKEND: 'external-identity-fixture',
      });
      const { request } = stubRequest({ creatorStatus: 'granted' });

      await new ApiAuthProvider().authenticate('author', { config, request, browser: noopBrowser });

      expect(calls.map((call) => call.split(':')[0])).toEqual([
        'register',
        'signIn',
        'signInStudio',
      ]);
    });

    test('staff signs in to Studio through the backend with the admin credentials', async () => {
      const config = configWith({
        CUSTOM_ACCOUNT_BACKEND_PLUGINS: PLUGIN,
        ACCOUNT_BACKEND: 'external-identity-fixture',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'secret',
      });
      const { request, requested } = stubRequest({ creatorStatus: 'granted' });

      await new ApiAuthProvider().authenticate('staff', { config, request, browser: noopBrowser });

      expect(calls).toEqual(['signIn:admin', 'signInStudio:admin']);
      expect(requested).toEqual([]);
    });
  },
);
