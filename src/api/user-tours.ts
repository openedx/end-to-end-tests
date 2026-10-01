import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
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
