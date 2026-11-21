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
 * `mode` picks the enrollment track (`honor`, `verified`, …) for a **new**
 * enrollment only — the mode must already exist on the course, and an existing
 * enrollment is not moved to another track by a second call. Omitted, the
 * platform's default track (`audit`) applies.
 *
 * This is the learner enrolling **themselves**, which an install where courses
 * are invitation-only site-wide (`COURSES_INVITE_ONLY`) refuses for every
 * learner. Specs that need an enrolled learner rather than a self-enrollment
 * use the `enrollLearner` fixture, which enrolls through the administrator
 * where the `self-enrollment` capability is not declared.
 *
 * @throws {ApiError} when enrollment is refused (e.g. enrollment is closed).
 */
export async function enrollInCourseViaApi(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  options: { readonly mode?: string } = {},
): Promise<void> {
  const token = await fetchCsrfToken(request, config);
  const url = `${config.baseUrls.lms}${ENROLLMENT_PATH}`;
  const response = await request.post(url, {
    data: {
      course_details: { course_id: courseKey },
      ...(options.mode ? { mode: options.mode } : {}),
    },
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });

  if (!response.ok()) {
    // The platform answers every refusal of a self-enrollment with the same
    // generic 400, whatever the reason, so name the site-wide one an operator
    // can do something about.
    const hint =
      response.status() === 400
        ? ' If learners cannot enroll themselves on this install (courses are ' +
          'invitation-only site-wide), opt out with "-self-enrollment" in CAPABILITIES.'
        : '';
    throw new ApiError(`Could not enroll in "${courseKey}" (HTTP ${response.status()}).${hint}`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
}

/**
 * Enrolls **another** user, `username`, in `courseKey` as global staff, with
 * `force_enrollment`: the enrollment an install that does not let learners
 * enroll themselves creates for them (staff, or an external service, enrolls
 * them).
 *
 * `staffRequest` must hold a **global staff** session: the platform honours
 * `user` for staff only and `force_enrollment` for global staff only, and
 * without it refuses an invitation-only course for the target user exactly as
 * it refuses that user's own request. Forcing also bypasses a closed enrollment
 * window, so this is never a fallback for a refused self-enrollment; callers
 * choose it up front (the `self-enrollment` capability). `mode` is as for
 * {@link enrollInCourseViaApi}.
 *
 * @throws {ApiError} when the enrollment is refused.
 */
export async function forceEnrollUserViaApi(
  staffRequest: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  username: string,
  options: { readonly mode?: string } = {},
): Promise<void> {
  const token = await fetchCsrfToken(staffRequest, config);
  const url = `${config.baseUrls.lms}${ENROLLMENT_PATH}`;
  const response = await staffRequest.post(url, {
    data: {
      user: username,
      course_details: { course_id: courseKey },
      ...(options.mode ? { mode: options.mode } : {}),
      force_enrollment: true,
    },
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });

  if (!response.ok()) {
    throw new ApiError(
      `Could not enroll "${username}" in "${courseKey}" as staff (HTTP ${response.status()}).`,
      { status: response.status(), url, body: await response.text() },
    );
  }
}
