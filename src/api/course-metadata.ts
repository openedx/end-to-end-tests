import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson } from './studio-origin';

/**
 * Course-home metadata the learning MFE loads first: the course's tabs (in the
 * order the learner sees them) and whether the caller may enter the course.
 * This is the LMS-side reading for Pages & Resources toggles, custom-page
 * order, the Teams tab, and prerequisite-course gating.
 */
export const COURSE_METADATA_PATH = '/api/course_home/course_metadata';

export interface CourseTab {
  /** Tab slug: `outline`, `progress`, `discussion`, `wiki`, `teams`, `static_tab_…`. */
  readonly tab_id: string;
  readonly title: string;
  readonly url: string;
}

export interface CourseAccess {
  readonly has_access: boolean;
  /** Platform reason when access is denied, e.g. `course_not_started`. */
  readonly error_code: string | null;
}

export interface CourseMetadata {
  readonly tabs: readonly CourseTab[];
  readonly course_access: CourseAccess;
  readonly is_self_paced: boolean;
  readonly is_enrolled: boolean;
  readonly is_staff: boolean;
  readonly [field: string]: unknown;
}

export async function fetchCourseMetadata(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseMetadata> {
  const url = `${config.baseUrls.lms}${COURSE_METADATA_PATH}/${courseKey}`;
  const response = await request.get(url);
  return studioJson<CourseMetadata>(response, `Reading course metadata for "${courseKey}"`);
}
