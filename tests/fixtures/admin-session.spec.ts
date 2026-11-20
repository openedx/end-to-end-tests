import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { ApiError, LOGIN_SESSION_PATH, STUDIO_ME_PATH } from '../../src/api';
import { loadConfig, type Env } from '../../src/config';
import { isDeadAdminSessionError, signInAdminSession } from '../../src/fixtures/admin-session';

const apiError = (message: string, status: number): ApiError =>
  new ApiError(message, { status, url: 'https://lms.example/x', body: '' });

/**
 * Which failures make the admin-session helper sign in again and retry once.
 */
test.describe('dead admin session detection', { tag: '@unit' }, () => {
  for (const [message, status] of [
    ['Failed to fetch a CSRF token (HTTP 302).', 302],
    [
      'Failed to fetch a CSRF token (HTTP 302; following it failed: apiRequestContext.get: Timeout 15000ms exceeded.).',
      302,
    ],
    ['Could not enroll "u" in "course-v1:A+B+C" (HTTP 403).', 403],
    ['Could not list enrollments (HTTP 401).', 401],
    ['The admin page did not render.', 200],
    ['Studio redirected to sign-in.', 302],
  ] as const) {
    test(`retries on: ${message}`, () => {
      expect(isDeadAdminSessionError(apiError(message, status))).toBe(true);
    });
  }

  for (const [message, status] of [
    ['Failed to fetch a CSRF token (HTTP 500).', 500],
    ['Could not enroll "u" in "course-v1:A+B+C" (HTTP 400).', 400],
    ['Could not read course (HTTP 302).', 302],
  ] as const) {
    test(`does not retry on: ${message}`, () => {
      expect(isDeadAdminSessionError(apiError(message, status))).toBe(false);
    });
  }

  test('does not retry on an error that is not an ApiError', () => {
    expect(isDeadAdminSessionError(new Error('Failed to fetch a CSRF token (HTTP 302).'))).toBe(
      false,
    );
  });
});

/**
 * A request context that answers every call with a 200 carrying a CSRF token and
 * a username, and records the URLs it was asked for.
 */
function recordingRequest(): { request: APIRequestContext; urls: string[] } {
  const urls: string[] = [];
  const respond = (url: string) => {
    urls.push(url);
    return Promise.resolve({
      ok: () => true,
      status: () => 200,
      url: () => url,
      json: () => Promise.resolve({ csrfToken: 'token', username: 'admin' }),
      text: () => Promise.resolve(''),
    });
  };
  const request = { get: respond, post: respond } as unknown as APIRequestContext;
  return { request, urls };
}

const signInConfig = (overrides: Env) =>
  loadConfig({
    LMS_BASE_URL: 'http://local.openedx.io',
    APPS_BASE_URL: 'http://apps.local.openedx.io',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'pw',
    ...overrides,
  });

const adminCredentials = { emailOrUsername: 'admin', password: 'pw' };

/**
 * The admin session the helper signs in again when the reused one has died:
 * Studio is only part of it where the target declares Studio.
 */
test.describe('admin session sign-in', { tag: '@unit' }, () => {
  test('signs in to the LMS only on a target without Studio', async () => {
    const { request, urls } = recordingRequest();
    const config = signInConfig({ CAPABILITIES: '-self-enrollment' });

    await signInAdminSession(request, config, adminCredentials);

    expect(urls).toContain(`http://local.openedx.io${LOGIN_SESSION_PATH}`);
    expect(urls.every((url) => url.startsWith('http://local.openedx.io/'))).toBe(true);
  });

  test('also establishes the Studio session where Studio is declared', async () => {
    const { request, urls } = recordingRequest();
    const config = signInConfig({
      CAPABILITIES: 'studio',
      CMS_BASE_URL: 'http://studio.local.openedx.io',
    });

    await signInAdminSession(request, config, adminCredentials);

    expect(urls).toContain(`http://studio.local.openedx.io${STUDIO_ME_PATH}`);
  });
});
