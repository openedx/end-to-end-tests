import { test, expect } from '@playwright/test';

import { ApiError } from '../../src/api';
import { isDeadAdminSessionError } from '../../src/fixtures/admin-session';

const apiError = (message: string, status: number): ApiError =>
  new ApiError(message, { status, url: 'https://lms.example/x', body: '' });

/**
 * Which failures make the admin-session helper sign in again and retry once.
 */
test.describe('dead admin session detection', { tag: '@unit' }, () => {
  for (const [message, status] of [
    ['Failed to fetch a CSRF token (HTTP 302).', 302],
    ['Failed to fetch a CSRF token (HTTP 302; the redirect could not be followed).', 302],
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
