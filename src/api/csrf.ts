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

/** How {@link fetchCsrfToken} treats a redirect from the token endpoint. */
export interface FetchCsrfTokenOptions {
  /**
   * Follow the redirect once (the default), so a context that still holds the
   * identity provider's session is signed back in. A signed-out caller has no
   * session to restore and passes `false`.
   */
  readonly followRedirect?: boolean;
}

/** Whether `landed` is the same origin and path as `requested`, ignoring a trailing slash. */
function isSameEndpoint(landed: string, requested: string): boolean {
  const a = new URL(landed);
  const b = new URL(requested);
  return a.origin === b.origin && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '');
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
 * An installation that sends anonymous visitors to an external sign-in,
 * exempting only some paths (say `/api`, but not `/csrf`), redirects a request
 * with no live session here. Following that redirect once is how a context that
 * still holds the provider's session is signed straight back in, landing on this
 * endpoint again with a token. A redirect that ends anywhere else (the provider's
 * sign-in page), or a follow that fails (a sign-in chain that outlasts the
 * request timeout), is reported with the redirect's own status.
 *
 * @returns the token to send in the {@link CSRF_HEADER} header.
 * @throws {ApiError} when the endpoint does not return a token.
 */
export async function fetchCsrfToken(
  request: APIRequestContext,
  config: AppConfig,
  origin: string = config.baseUrls.lms,
  { followRedirect = true }: FetchCsrfTokenOptions = {},
): Promise<string> {
  const url = `${origin}${CSRF_TOKEN_PATH}`;
  let response = await request.get(url, { maxRedirects: 0 });

  if (followRedirect && response.status() >= 300 && response.status() < 400) {
    const followed = await request.get(url).catch(() => undefined);
    if (followed?.ok() && isSameEndpoint(followed.url(), url)) response = followed;
  }

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
