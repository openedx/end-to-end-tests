import { test, expect } from '@playwright/test';

import { AUTH_JWT_COOKIE, JWT_REFRESH_MARGIN_MS, storedJwtIsFresh } from '../../src/auth';

/**
 * Pure unit tests for {@link storedJwtIsFresh}, the gate that refreshes a worker
 * author's captured state file before a per-test context loads it. The point is
 * that a context built from a stale file cannot be healed in place (an
 * `APIRequestContext` has no cookie mutation), so a lapsed JWT must be caught
 * from the file, not at first use. No browser or target.
 */
const NOW = 1_700_000_000_000;

function jwt(expiresSeconds: number | undefined) {
  return { name: AUTH_JWT_COOKIE, expires: expiresSeconds };
}

test.describe('storedJwtIsFresh', { tag: '@unit' }, () => {
  test('is false when the login JWT cookie is absent (anonymous or logged-out state)', () => {
    expect(storedJwtIsFresh([{ name: 'sessionid', expires: -1 }], NOW)).toBe(false);
    expect(storedJwtIsFresh([], NOW)).toBe(false);
  });

  test('is true when the JWT expires comfortably beyond the refresh margin', () => {
    const wellAhead = (NOW + JWT_REFRESH_MARGIN_MS + 60_000) / 1000;
    expect(storedJwtIsFresh([jwt(wellAhead)], NOW)).toBe(true);
  });

  test('is false when the JWT has already expired', () => {
    const past = (NOW - 60_000) / 1000;
    expect(storedJwtIsFresh([jwt(past)], NOW)).toBe(false);
  });

  test('is false within the refresh margin, so a context is not picked up about to lapse', () => {
    const insideMargin = (NOW + JWT_REFRESH_MARGIN_MS - 60_000) / 1000;
    expect(storedJwtIsFresh([jwt(insideMargin)], NOW)).toBe(false);
  });

  test('treats a JWT stored as a session cookie (no expiry) as fresh — nothing to pre-empt', () => {
    expect(storedJwtIsFresh([jwt(-1)], NOW)).toBe(true);
    expect(storedJwtIsFresh([jwt(undefined)], NOW)).toBe(true);
  });
});
