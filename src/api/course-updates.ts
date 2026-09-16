import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson, studioOrigin, STUDIO_JSON_ACCEPT } from './studio-origin';

/**
 * Course updates and handouts — the Course Updates page's Studio endpoints
 * (`/course_info_update/<key>/` and the `handouts` xblock). Session authed
 * (author `page.request`). The learner-facing effect (a welcome message and the
 * handouts sidebar) is read from the course-home outline.
 */
const updatesUrl = (config: AppConfig, courseKey: string): string =>
  `${studioOrigin(config)}/course_info_update/${courseKey}/`;
const handoutsUrl = (config: AppConfig, courseKey: string): string =>
  `${studioOrigin(config)}/xblock/block-v1:${courseKey.replace('course-v1:', '')}+type@course_info+block@handouts`;

/** One course update (a dated announcement). */
export interface CourseUpdate {
  readonly id: number;
  readonly date: string;
  readonly content: string;
}

/** Lists a course's updates (newest first). */
export async function fetchCourseUpdates(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly CourseUpdate[]> {
  return studioJson<readonly CourseUpdate[]>(
    await request.get(updatesUrl(config, courseKey), { headers: STUDIO_JSON_ACCEPT }),
    `Listing updates of ${courseKey}`,
  );
}

/** Reads the course handouts xblock's HTML (`data`). */
export async function fetchHandouts(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<string> {
  const body = await studioJson<{ readonly data: string }>(
    await request.get(handoutsUrl(config, courseKey), { headers: STUDIO_JSON_ACCEPT }),
    `Reading handouts of ${courseKey}`,
  );
  return body.data;
}
