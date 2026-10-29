import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';
import { lmsGet } from './lms-json';

/**
 * Product-tour state (`lms/djangoapps/user_tours`): whether the learning MFE
 * offers a learner the course-home tour and the courseware tour. A new account
 * starts at `show-new-user-tour` / `true`; finishing or skipping the course-home
 * tour moves it to `no-tour` — the oracle of TC-00040.
 */
export type CourseHomeTourStatus = 'show-new-user-tour' | 'show-existing-user-tour' | 'no-tour';

export interface UserTours {
  readonly course_home_tour_status: CourseHomeTourStatus;
  readonly show_courseware_tour: boolean;
}

export async function fetchUserTours(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
): Promise<UserTours> {
  return lmsGet(
    request,
    `${config.baseUrls.lms}/api/user_tours/v1/${username}`,
    `Reading the tours of "${username}"`,
  );
}

/**
 * Marks the course-home tour done for `username`, as finishing or skipping it
 * does, so the learning MFE's course home opens without its first-visit dialog.
 * The view answers an accepted change with an empty 200, so this reads no body.
 */
export async function skipCourseHomeTour(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
): Promise<void> {
  const url = `${config.baseUrls.lms}/api/user_tours/v1/${username}`;
  const response = await request.patch(url, {
    headers: {
      [CSRF_HEADER]: await fetchCsrfToken(request, config),
      Referer: config.baseUrls.lms,
    },
    data: { course_home_tour_status: 'no-tour' satisfies CourseHomeTourStatus },
  });
  if (!response.ok()) {
    throw new ApiError(
      `Skipping the course-home tour of "${username}" failed (HTTP ${response.status()}).`,
      { status: response.status(), url, body: await response.text() },
    );
  }
}

/** As {@link skipCourseHomeTour}, for whoever `request` is signed in as. */
export async function skipOwnCourseHomeTour(
  request: APIRequestContext,
  config: AppConfig,
): Promise<void> {
  const me = await lmsGet<{ readonly username: string }>(
    request,
    `${config.baseUrls.lms}/api/user/v1/me`,
    'Reading the signed-in user',
  );
  await skipCourseHomeTour(request, config, me.username);
}
