import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
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

/** One block of the outline's tree; subsections carry their effort estimate. */
export interface CourseHomeBlock {
  readonly id: string;
  readonly type: string;
  readonly display_name: string;
  readonly children?: readonly string[];
  /** Estimated seconds of work, or `null` when the course cannot be estimated. */
  readonly effort_time?: number | null;
  readonly effort_activities?: number | null;
}

export interface CourseHomeOutline {
  readonly resume_course: { readonly has_visited_course: boolean; readonly url: string };
  readonly course_blocks: { readonly blocks: Readonly<Record<string, CourseHomeBlock>> } | null;
  readonly handouts_html: string | null;
  readonly course_tools: readonly CourseTool[];
}

/**
 * The outline as the caller sees it. Like the navigation model it is built
 * from the course's `learning_sequences` outline, which the CMS worker writes
 * after a publish; until that lands the view answers 500 (`PLAT-009`), so this
 * resolves to `undefined` then and callers poll it under
 * `TIMEOUTS.contentPublish`.
 */
export async function fetchCourseHomeOutline(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseHomeOutline | undefined> {
  try {
    return await lmsGet<CourseHomeOutline>(
      request,
      `${config.baseUrls.lms}/api/course_home/outline/${courseKey}`,
      'Reading the course home outline',
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 500) return undefined;
    throw error;
  }
}

/** The tool with this analytics id (`edx.bookmarks`, `edx.updates`), if offered. */
export function courseTool(
  outline: CourseHomeOutline | undefined,
  analyticsId: string,
): CourseTool | undefined {
  return outline?.course_tools.find((tool) => tool.analytics_id === analyticsId);
}

/** The learning MFE's per-course settings a unit page's tools follow. */
export interface CoursewareCourse {
  readonly show_calculator: boolean;
  readonly notes: { readonly enabled: boolean; readonly visible: boolean };
}

/** The courseware metadata the learning MFE reads (`/api/courseware/course/<key>`). */
export async function fetchCoursewareCourse(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CoursewareCourse> {
  return lmsGet(
    request,
    `${config.baseUrls.lms}/api/courseware/course/${courseKey}`,
    'Reading the courseware metadata',
  );
}
