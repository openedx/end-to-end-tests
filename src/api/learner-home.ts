import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { lmsGet, lmsWrite } from './lms-json';

/**
 * The learner dashboard's backend (`lms/djangoapps/learner_home`): the course
 * cards, what each card's menu offers, and the staff "View as" masquerade.
 *
 * `init` is the only reading of a learner's course e-mail opt-out
 * (`enrollment.hasOptedOutOfEmail`) and of whether the card offers e-mail
 * settings at all (`enrollment.isEmailEnabled`, which follows the platform's
 * `BulkEmailFlag` and, by default, a per-course authorization).
 */
export const LEARNER_HOME_INIT_PATH = '/api/learner_home/init';
export const CHANGE_EMAIL_SETTINGS_PATH = '/api/change_email_settings';

export interface LearnerHomeEnrollment {
  readonly isEnrolled: boolean;
  readonly mode: string;
  readonly isEmailEnabled: boolean;
  readonly hasOptedOutOfEmail: boolean;
}

export interface LearnerHomeCourse {
  readonly courseRun: { readonly courseId: string };
  readonly enrollment: LearnerHomeEnrollment;
}

export interface LearnerHome {
  readonly courses: readonly LearnerHomeCourse[];
  readonly platformSettings: { readonly courseSearchUrl: string };
}

/**
 * Reads the dashboard as the caller, or — for global staff — as `options.user`
 * (a username or e-mail). Anyone else asking for another user is refused with
 * 403, which resolves to `{ forbidden: true }` so a spec can assert the refusal.
 */
export async function fetchLearnerHome(
  request: APIRequestContext,
  config: AppConfig,
  options: { readonly user?: string } = {},
): Promise<LearnerHome | { readonly forbidden: true }> {
  const query = options.user ? `?${new URLSearchParams({ user: options.user })}` : '';
  try {
    return await lmsGet<LearnerHome>(
      request,
      `${config.baseUrls.lms}${LEARNER_HOME_INIT_PATH}${query}`,
      'Reading the learner dashboard',
    );
  } catch (error) {
    if (options.user && error instanceof ApiError && error.status === 403) {
      return { forbidden: true };
    }
    throw error;
  }
}

/** The dashboard's card for one course, if the learner has one. */
export function learnerHomeCourse(
  home: LearnerHome,
  courseKey: string,
): LearnerHomeCourse | undefined {
  return home.courses.find((course) => course.courseRun.courseId === courseKey);
}

/**
 * Opts the caller in to (or out of) a course's e-mail, as the dashboard's
 * "Email settings" modal does: the platform opts out when `receive_emails` is
 * absent and back in when it is `on`.
 */
export async function setCourseEmailOptIn(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  receive: boolean,
): Promise<void> {
  await lmsWrite(
    request,
    config,
    'POST',
    `${config.baseUrls.lms}${CHANGE_EMAIL_SETTINGS_PATH}`,
    'Changing course e-mail settings',
    { data: { course_id: courseKey, ...(receive ? { receive_emails: 'on' } : {}) } },
  );
}
