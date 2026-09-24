import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { lmsGet } from './lms-json';

/**
 * The caller's notes in one course, as the LMS lists them from the notes
 * service (`/courses/<key>/edxnotes/notes/`, session-authed) — the oracle of the
 * Notes tool (TC-00038).
 */
export interface CourseNote {
  readonly id: string;
  readonly usage_id: string;
  readonly text: string;
  readonly quote: string;
}

export async function listCourseNotes(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly CourseNote[]> {
  const page = await lmsGet<{ readonly results: readonly CourseNote[] }>(
    request,
    `${config.baseUrls.lms}/courses/${courseKey}/edxnotes/notes/`,
    'Listing course notes',
  );
  return page.results;
}
