import type { APIRequestContext, APIResponse } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';

/**
 * Plumbing for the LMS's JSON APIs (`/api/notifications/`, `/api/discussion/`):
 * one place that turns a non-2xx or non-JSON answer into an {@link ApiError}
 * naming the action, and one that sends a credentialed write with Django's CSRF
 * header — the LMS counterpart of `studioJson` / `studioWrite`.
 */

/** Reads a JSON body, or throws an {@link ApiError} saying what failed. */
export async function lmsJson<T>(response: APIResponse, what: string): Promise<T> {
  const url = response.url();
  const body = await response.text();
  if (!response.ok()) {
    throw new ApiError(`${what} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body,
    });
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiError(`${what} returned a non-JSON body.`, {
      status: response.status(),
      url,
      body: body.slice(0, 500),
      retryable: true,
    });
  }
}

/** `GET` a JSON resource on the caller's session. */
export async function lmsGet<T>(request: APIRequestContext, url: string, what: string): Promise<T> {
  return lmsJson<T>(await request.get(url), what);
}

/**
 * A credentialed write. `mergePatch` sends the body as
 * `application/merge-patch+json`, which the discussion API's `PATCH` requires.
 * A `DELETE` answering 204 resolves to `undefined`.
 */
export async function lmsWrite<T>(
  request: APIRequestContext,
  config: AppConfig,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  what: string,
  options: { readonly data?: unknown; readonly mergePatch?: boolean } = {},
): Promise<T> {
  const token = await fetchCsrfToken(request, config);
  const headers: Record<string, string> = { [CSRF_HEADER]: token, Referer: config.baseUrls.lms };
  let data = options.data;
  if (options.mergePatch) {
    headers['Content-Type'] = 'application/merge-patch+json';
    data = JSON.stringify(options.data ?? {});
  }
  const response = await request.fetch(url, { method, headers, data });
  if (response.status() === 204) {
    return undefined as T;
  }
  return lmsJson<T>(response, what);
}
