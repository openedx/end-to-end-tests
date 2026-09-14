import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';

/**
 * LMS login-session endpoint the authn MFE posts to. The v2 endpoint accepts
 * `email_or_username`, so a single call works whether the caller signs in with an
 * email or a username.
 */
export const LOGIN_SESSION_PATH = '/api/user/v2/account/login_session/';

export interface LoginCredentials {
  /** An email address or a username. */
  readonly emailOrUsername: string;
  readonly password: string;
}

/**
 * Signs in against the LMS login-session API (the authn MFE's path), leaving the
 * request context's cookie jar holding the parent-domain session and JWT cookies.
 *
 * Fetches a CSRF token first (landing the `csrftoken` cookie) and sends it in the
 * {@link CSRF_HEADER} header, because the endpoint is CSRF-protected. A single
 * sign-in yields cookies scoped to the shared parent domain, so the resulting
 * state authenticates the LMS, Studio, and every MFE origin.
 *
 * @throws {ApiError} when credentials are rejected or the endpoint errors.
 */
export async function loginSession(
  request: APIRequestContext,
  config: AppConfig,
  credentials: LoginCredentials,
): Promise<void> {
  const url = `${config.baseUrls.lms}${LOGIN_SESSION_PATH}`;

  // On a brand-new context the CSRF cookie and the token can be momentarily out of
  // step: the very first POST then fails Django's CSRF check with a plain-HTML
  // "Bad Request (400)" (not the JSON credential error). Fetching the token again
  // — after the first GET/POST has landed the `csrftoken` cookie — makes the two
  // agree, so a single bounded retry clears the race. A retry is safe: sign-in is
  // idempotent, and genuinely bad credentials still fail on the last attempt.
  const maxAttempts = 2;
  let lastResponse: Awaited<ReturnType<APIRequestContext['post']>> | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const csrfToken = await fetchCsrfToken(request, config);
    lastResponse = await request.post(url, {
      form: {
        email_or_username: credentials.emailOrUsername,
        password: credentials.password,
      },
      headers: {
        [CSRF_HEADER]: csrfToken,
        Referer: config.baseUrls.lms,
      },
    });
    if (lastResponse.ok()) return;
    // Only the CSRF/transient failures (400/403) are worth another attempt; a
    // rejected credential (also 400, but as a JSON body) will not change.
    const status = lastResponse.status();
    if (status !== 400 && status !== 403) break;
  }

  const response = lastResponse as NonNullable<typeof lastResponse>;
  throw new ApiError(
    `Login failed for "${credentials.emailOrUsername}" (HTTP ${response.status()}).`,
    { status: response.status(), url, body: await response.text() },
  );
}
