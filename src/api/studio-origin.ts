import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError, StudioSessionExpiredError } from './errors';

/**
 * The Studio origin from config, or a clear error when none is set. Every Studio
 * client goes through here so a missing `CMS_BASE_URL` reads as configuration,
 * not as a broken URL. Config already refuses `studio` without the URL, so this
 * only fires for a caller that reached Studio code without the capability.
 */
export function studioOrigin(config: AppConfig): string {
  const origin = config.baseUrls.studio;
  if (origin === undefined) {
    throw new ApiError(
      'This call needs the Studio origin, but CMS_BASE_URL is not set. Set it (and declare ' +
        'the "studio" capability) to run Studio coverage.',
      { status: 0, url: '', body: '' },
    );
  }
  return origin;
}

/**
 * Headers for a credentialed Studio write: the CSRF token from Studio's own
 * token endpoint (fetched on this request context so the matching cookie lands
 * in its jar) and a Studio `Referer`, which Django's CSRF check also requires.
 * `Accept: application/json` selects the JSON branch on the legacy Studio views
 * that also render HTML.
 */
export async function studioWriteHeaders(
  request: APIRequestContext,
  config: AppConfig,
): Promise<Record<string, string>> {
  const origin = studioOrigin(config);
  const token = await fetchCsrfToken(request, config, origin);
  return {
    [CSRF_HEADER]: token,
    Referer: origin,
    Accept: 'application/json',
    // The MFE's XHR client sends this, and the legacy Studio write handlers on
    // older releases (e.g. verawood) serve JSON only to an XHR — without it they
    // answer with the HTML page, which a JSON caller cannot parse.
    'X-Requested-With': 'XMLHttpRequest',
  };
}

/** Headers for a Studio read that must take the JSON branch of a legacy view. */
export const STUDIO_JSON_ACCEPT = { Accept: 'application/json' } as const;

/**
 * A one-line preview of a non-JSON response body for an error message. The report
 * does not surface `ApiError.body`, so the prefix (an HTML `<title>`, a login
 * page, a gateway error) has to travel in the message to be diagnosable in CI.
 */
export function nonJsonPreview(text: string): string {
  return text.slice(0, 200).replace(/\s+/g, ' ').trim();
}

/**
 * Reads a JSON body from a Studio response or throws an {@link ApiError} naming
 * the request. Shared by the Studio clients so their success paths stay short.
 */
export async function studioJson<T>(
  response: Awaited<ReturnType<APIRequestContext['fetch']>>,
  what: string,
): Promise<T> {
  const url = response.url();
  if (!response.ok()) {
    throw new ApiError(`${what} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      `${what} returned HTTP ${response.status()} with a non-JSON body: ${nonJsonPreview(text)}`,
      { status: response.status(), url, body: text.slice(0, 500) },
    );
  }
}

/**
 * One credentialed write against a legacy Studio view (`/xblock/`, `/course/`,
 * …), with the failure modes those views share turned into typed errors:
 *
 * - a `3xx` is the sign-in bounce of a gone Studio Django session (these views
 *   authenticate by that session, not the JWT) → {@link StudioSessionExpiredError},
 *   so a caller holding credentials can re-authenticate and retry. Redirects are
 *   not followed: a followed one becomes a `GET` of the collection URL and a
 *   misleading 404;
 * - a `403` names the course the session may not edit;
 * - a `2xx` with a non-JSON body (an overloaded CMS letting an HTML error page
 *   through) is an {@link ApiError} marked `retryable`.
 *
 * Returns the parsed JSON, or `undefined` for an empty `204`.
 */
export async function studioWrite<T>(
  request: APIRequestContext,
  config: AppConfig,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  what: string,
  data?: unknown,
): Promise<T> {
  const url = `${studioOrigin(config)}${path}`;
  const response = await request.fetch(url, {
    method,
    data,
    headers: await studioWriteHeaders(request, config),
    maxRedirects: 0,
  });
  const status = response.status();
  const text = await response.text();
  if (status >= 300 && status < 400) {
    throw new StudioSessionExpiredError(what, { url, status });
  }
  if (status === 403) {
    throw new ApiError(
      `${what} was refused (HTTP 403): the session may not edit this course, or the ` +
        'operation is limited to global staff.',
      { status, url, body: text },
    );
  }
  if (!response.ok()) {
    throw new ApiError(`${what} failed (HTTP ${status}): ${nonJsonPreview(text)}`, {
      status,
      url,
      body: text,
    });
  }
  if (status === 204 || text.trim() === '') {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      `${what} returned HTTP ${status} with a non-JSON body: ${nonJsonPreview(text)}`,
      { status, url, body: text.slice(0, 500), retryable: true },
    );
  }
}
