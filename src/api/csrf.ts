import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';

/** The CSRF token cookie/header name Open edX (edx-drf-extensions) uses. */
export const CSRF_HEADER = 'X-CSRFToken';

/** Endpoint the authn MFE calls to obtain a CSRF token before a credentialed POST. */
export const CSRF_TOKEN_PATH = '/csrf/api/v1/token';

interface CsrfTokenResponse {
  readonly csrfToken: string;
}

/**
 * Fetches a CSRF token from an Open edX origin — the LMS by default, the same
 * call the authn MFE makes before posting to the login-session API. Studio
 * exposes the identical endpoint, so Studio writes pass `config.baseUrls.studio`
 * as `origin`.
 *
 * The `GET` also lands a `csrftoken` cookie in the request context's cookie jar;
 * Django's CSRF protection then checks the returned header value against that
 * cookie, so the caller must reuse the *same* {@link APIRequestContext} for the
 * subsequent credentialed POST. The cookie is scoped to the host that set it, so
 * an LMS token does not authorize a Studio write or vice versa — fetch from the
 * origin you are about to post to, and send that origin as the `Referer`.
 *
 * @returns the token to send in the {@link CSRF_HEADER} header.
 * @throws {ApiError} when the endpoint does not return a token.
 */
export async function fetchCsrfToken(
  request: APIRequestContext,
  config: AppConfig,
  origin: string = config.baseUrls.lms,
): Promise<string> {
  const url = `${origin}${CSRF_TOKEN_PATH}`;
  const response = await request.get(url);

  if (!response.ok()) {
    throw new ApiError(`Failed to fetch a CSRF token (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }

  const body = (await response.json()) as Partial<CsrfTokenResponse>;
  if (typeof body.csrfToken !== 'string' || body.csrfToken === '') {
    throw new ApiError('CSRF endpoint responded without a csrfToken.', {
      status: response.status(),
      url,
      body: JSON.stringify(body),
    });
  }

  return body.csrfToken;
}
