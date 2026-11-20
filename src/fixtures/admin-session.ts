import type { APIRequestContext } from '@playwright/test';

import { ApiError, establishStudioSession, loginSession, type LoginCredentials } from '../api';
import type { AppConfig } from '../config';

/**
 * Whether `error` means the reused admin session has died, so signing in again
 * and repeating the work is worth one try.
 *
 * - "did not render" is an admin page that came back as the login redirect.
 * - "redirected/bounced to sign-in" is the Studio half of the same session having
 *   decayed, which a `StudioSessionExpiredError` reports.
 * - `HTTP 401`/`403` is an API refusing the stale session.
 * - A redirected CSRF token fetch is the same dead session on an install that
 *   sends anonymous requests to `/csrf/api/v1/token` off to sign in rather than
 *   answering them: the JWT cookie can outlive the Django session, so read-only
 *   API calls still succeed and the first write is the one that notices.
 */
export function isDeadAdminSessionError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    /did not render|(?:redirected|bounced) to sign-in|HTTP 40[13]|CSRF token \(HTTP 30[1278]\b/.test(
      error.message,
    )
  );
}

/**
 * Signs `session` in as the admin afresh, the way the `setup` project signs in
 * the `staff` role: the LMS session, then — where the target declares `studio` —
 * the Studio session off it, which the account-creator grant needs to drive
 * Studio's admin form. An LMS-only target has no Studio to sign in to.
 */
export async function signInAdminSession(
  session: APIRequestContext,
  config: AppConfig,
  credentials: LoginCredentials,
): Promise<void> {
  await loginSession(session, config, credentials);
  if (config.capabilities.has('studio')) {
    await establishStudioSession(session, config);
  }
}
