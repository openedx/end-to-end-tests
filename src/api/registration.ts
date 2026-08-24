import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import type { LearnerIdentity } from './user-identity';

/** LMS registration endpoint the authn MFE's `/register` route posts to. */
export const REGISTRATION_PATH = '/api/user/v1/account/registration/';

/**
 * Creates a learner account via the LMS registration API — the same endpoint the
 * authn MFE calls. This is the portable, provider-agnostic way to seed a user:
 * it needs no admin credentials, private fixtures, or Tutor-shell coupling.
 *
 * On success the platform also logs the user in (`set_logged_in_cookies`), so the
 * request context's cookie jar is left authenticated. The auth contract still
 * performs an explicit login afterwards to exercise the login path and obtain a
 * clean session; seeding and sign-in stay separable.
 *
 * `honor_code` is sent because the default install marks it required; the view
 * derives `terms_of_service` from it. Accounts may be created inactive (pending
 * email confirmation) but can still sign in, which is what the tests need.
 *
 * @throws {ApiError} when registration is rejected (e.g. duplicate email).
 */
export async function registerLearnerAccount(
  request: APIRequestContext,
  config: AppConfig,
  identity: LearnerIdentity,
): Promise<void> {
  const url = `${config.baseUrls.lms}${REGISTRATION_PATH}`;
  const response = await request.post(url, {
    form: {
      email: identity.email,
      name: identity.name,
      username: identity.username,
      password: identity.password,
      honor_code: 'true',
      terms_of_service: 'true',
    },
    headers: { Referer: config.baseUrls.lms },
  });

  if (!response.ok()) {
    const body = await response.text();

    // Open edX rate-limits registration per IP (REGISTRATION_RATELIMIT, default
    // "60/7d"). Frequent runs exhaust it and every POST then returns
    // 403 forbidden-request — call that out specifically so it isn't mistaken for
    // a code or credentials problem.
    if (response.status() === 403 && body.includes('forbidden-request')) {
      throw new ApiError(
        `Registration failed for "${identity.username}" (HTTP 403 ` +
          `forbidden-request). It may have been rate-limited. We cap registrations per IP via ` +
          `REGISTRATION_RATELIMIT (default "60/7d"), which repeated test runs exhaust. ` +
          `Raise it on the target for testing (e.g. "100/m", as the platform's own ` +
          `test settings do) and restart the LMS, or wait for the window to reset.`,
        { status: 403, url, body },
      );
    }

    throw new ApiError(
      `Registration failed for "${identity.username}" (HTTP ${response.status()}): ${body}`,
      { status: response.status(), url, body },
    );
  }
}
