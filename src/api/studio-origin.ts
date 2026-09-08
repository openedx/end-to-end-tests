import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';

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
  return { [CSRF_HEADER]: token, Referer: origin, Accept: 'application/json' };
}

/** Headers for a Studio read that must take the JSON branch of a legacy view. */
export const STUDIO_JSON_ACCEPT = { Accept: 'application/json' } as const;

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
    throw new ApiError(`${what} did not return JSON.`, {
      status: response.status(),
      url,
      body: text.slice(0, 500),
    });
  }
}
