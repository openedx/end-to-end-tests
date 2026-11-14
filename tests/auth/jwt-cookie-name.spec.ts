import { test, expect } from '@playwright/test';

import {
  assertAuthCookiesPresent,
  AuthError,
  hasAuthenticatedSession,
  storedJwtIsFresh,
} from '../../src/auth';
import { loadConfig } from '../../src/config';

/**
 * An install that renames the login JWT's header/payload cookie (Open edX's
 * `JWT_AUTH['JWT_AUTH_COOKIE_HEADER_PAYLOAD']`, e.g. one prefixed per
 * environment) is still recognised as signed in once `JWT_AUTH_COOKIE_HEADER_PAYLOAD`
 * names it. No browser or target.
 */
const RENAMED = 'stage-edx-jwt-cookie-header-payload';
const config = loadConfig({
  LMS_BASE_URL: 'https://lms.example.com',
  APPS_BASE_URL: 'https://apps.example.com',
  JWT_AUTH_COOKIE_HEADER_PAYLOAD: RENAMED,
});
const state = (...names: string[]) => ({
  cookies: names.map((name) => ({
    name,
    value: 'x',
    domain: 'lms.example.com',
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: true,
    sameSite: 'Lax' as const,
  })),
  origins: [],
});

test.describe('the login JWT cookie under its configured name', { tag: '@unit' }, () => {
  test('passes the post-login preflight', () => {
    expect(() => assertAuthCookiesPresent(state(RENAMED), config)).not.toThrow();
  });

  test('fails the preflight naming the configured cookie when it is missing', () => {
    expect(() => assertAuthCookiesPresent(state('edx-jwt-cookie-header-payload'), config)).toThrow(
      new RegExp(`${RENAMED}.*JWT_AUTH_COOKIE_HEADER_PAYLOAD`),
    );
    expect(() => assertAuthCookiesPresent(state(), config)).toThrow(AuthError);
  });

  test('counts as an authenticated session', () => {
    expect(hasAuthenticatedSession(state(RENAMED).cookies, config.jwtCookieHeaderPayload)).toBe(
      true,
    );
    expect(
      hasAuthenticatedSession(
        state('edx-jwt-cookie-header-payload').cookies,
        config.jwtCookieHeaderPayload,
      ),
    ).toBe(false);
  });

  test('is read for the stored JWT freshness check', () => {
    expect(storedJwtIsFresh([{ name: RENAMED, expires: -1 }], config.jwtCookieHeaderPayload)).toBe(
      true,
    );
  });
});
