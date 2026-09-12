import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';

/** Public enrollment API (`edx-platform/openedx/core/djangoapps/enrollments`). */
export const ENROLLMENT_PATH = '/api/enrollment/v1/enrollment';

/** Per-course enrollment facts: window, modes, invitation-only, pacing. */
export const COURSE_ENROLLMENT_DETAILS_PATH = '/api/enrollment/v1/course';

export interface CourseEnrollmentDetails {
  readonly courseId: string;
  readonly enrollmentStart: string | null;
  readonly enrollmentEnd: string | null;
  readonly courseStart: string | null;
  readonly courseEnd: string | null;
  readonly inviteOnly: boolean;
  /** Mode slugs, e.g. `['audit']`. */
  readonly courseModes: readonly string[];
  /** `Instructor Paced` or `Self Paced`, as the platform words it. */
  readonly pacingType: string;
}

interface RawCourseEnrollmentDetails {
  readonly course_id?: string;
  readonly enrollment_start?: string | null;
  readonly enrollment_end?: string | null;
  readonly course_start?: string | null;
  readonly course_end?: string | null;
  readonly invite_only?: boolean;
  readonly course_modes?: readonly { readonly slug?: string }[];
  readonly pacing_type?: string;
}

/**
 * Reads the enrollment-relevant facts of a course — the LMS-side outcome of
 * Studio's enrollment window, invitation-only and pacing settings.
 */
export async function fetchCourseEnrollmentDetails(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseEnrollmentDetails> {
  const url = `${config.baseUrls.lms}${COURSE_ENROLLMENT_DETAILS_PATH}/${courseKey}`;
  const response = await request.get(url);
  if (!response.ok()) {
    throw new ApiError(
      `Could not read enrollment details for "${courseKey}" (HTTP ${response.status()}).`,
      { status: response.status(), url, body: await response.text() },
    );
  }
  const raw = (await response.json()) as RawCourseEnrollmentDetails;
  return {
    courseId: raw.course_id ?? courseKey,
    enrollmentStart: raw.enrollment_start ?? null,
    enrollmentEnd: raw.enrollment_end ?? null,
    courseStart: raw.course_start ?? null,
    courseEnd: raw.course_end ?? null,
    inviteOnly: raw.invite_only ?? false,
    courseModes: (raw.course_modes ?? []).map((mode) => mode.slug ?? ''),
    pacingType: raw.pacing_type ?? '',
  };
}

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
