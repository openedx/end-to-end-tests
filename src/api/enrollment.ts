import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';

/** Public enrollment API (`edx-platform/openedx/core/djangoapps/enrollments`). */
export const ENROLLMENT_PATH = '/api/enrollment/v1/enrollment';

interface RawEnrollment {
  readonly is_active?: boolean;
  readonly course_details?: { readonly course_id?: string };
}

/**
 * Whether the caller's session is actively enrolled in `courseKey`.
 *
 * Reads the list endpoint rather than `/enrollment/{username},{course_id}`, which
 * requires staff permission for anyone but the user themselves and is awkward to
 * build safely for keys containing a comma.
 */
export async function isEnrolled(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<boolean> {
  const url = `${config.baseUrls.lms}${ENROLLMENT_PATH}`;
  const response = await request.get(url);

  if (!response.ok()) {
    throw new ApiError(`Could not list enrollments (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }

  const body = (await response.json()) as readonly RawEnrollment[];
  return body.some(
    (entry) => entry.course_details?.course_id === courseKey && entry.is_active !== false,
  );
}

/**
 * Enrolls the caller's session in `courseKey` through the public API, so specs
 * that are not testing the enrollment UI do not have to drive it.
 *
 * The POST is credentialed, so it needs Django's CSRF header; a bare POST returns
 * 403. `fetchCsrfToken` also lands the matching cookie in this request context's
 * jar, which is why the token must be fetched with the *same* context.
 *
 * Idempotent: re-enrolling an already-enrolled user is accepted by the platform.
 *
 * @throws {ApiError} when enrollment is refused (e.g. enrollment is closed).
 */
export async function enrollInCourseViaApi(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<void> {
  const token = await fetchCsrfToken(request, config);
  const url = `${config.baseUrls.lms}${ENROLLMENT_PATH}`;
  const response = await request.post(url, {
    data: { course_details: { course_id: courseKey } },
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });

  if (!response.ok()) {
    throw new ApiError(`Could not enroll in "${courseKey}" (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
}
