import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { lmsGet } from './lms-json';

/**
 * The course home outline API (`/api/course_home/outline/<key>`) — what the
 * learning MFE's course home renders from: the Resume target, the handouts,
 * the course tools and each subsection's effort estimate. The learner's own
 * reading of what an author set up, and the oracle of the course-home cases.
 */
export interface CourseTool {
  /** `edx.bookmarks`, `edx.updates`, … — not localized. */
  readonly analytics_id: string;
  readonly title: string;
  readonly url: string;
}

export interface CourseHomeOutline {
  readonly resume_course: { readonly has_visited_course: boolean; readonly url: string };
  readonly handouts_html: string | null;
  readonly course_tools: readonly CourseTool[];
}

export async function fetchCourseHomeOutline(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseHomeOutline> {
  return lmsGet(
    request,
    `${config.baseUrls.lms}/api/course_home/outline/${courseKey}`,
    'Reading the course home outline',
  );
}

/** The tool with this analytics id (`edx.bookmarks`, `edx.updates`), if offered. */
export function courseTool(
  outline: CourseHomeOutline,
  analyticsId: string,
): CourseTool | undefined {
  return outline.course_tools.find((tool) => tool.analytics_id === analyticsId);
}
