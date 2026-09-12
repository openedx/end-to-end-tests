import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { studioJson, studioOrigin, studioWriteHeaders } from './studio-origin';

/**
 * Pages & Resources: the course apps a course can switch on. The set is
 * install-dependent (`calculator`, `custom_pages`, `discussion`, `live`,
 * `progress`, `textbooks`, `wiki` on a default Tutor install; ORA, notes and
 * proctoring appear only where those apps are installed), so callers must not
 * assume an id exists — check {@link fetchCourseApps} first.
 */
export const COURSE_APPS_PATH = '/api/course_apps/v1/apps';

export interface CourseApp {
  readonly id: string;
  readonly enabled: boolean;
  /** Whether the app has an on/off switch (`enable`) and a settings page (`configure`). */
  readonly allowedOperations: { readonly enable: boolean; readonly configure: boolean };
}

interface RawCourseApp {
  readonly id?: string;
  readonly enabled?: boolean;
  readonly allowed_operations?: { readonly enable?: boolean; readonly configure?: boolean };
}

function toCourseApp(raw: RawCourseApp): CourseApp {
  return {
    id: raw.id ?? '',
    enabled: raw.enabled ?? false,
    allowedOperations: {
      enable: raw.allowed_operations?.enable ?? false,
      configure: raw.allowed_operations?.configure ?? false,
    },
  };
}

export async function fetchCourseApps(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly CourseApp[]> {
  const response = await request.get(`${studioOrigin(config)}${COURSE_APPS_PATH}/${courseKey}`);
  const raw = await studioJson<readonly RawCourseApp[]>(
    response,
    `Reading the course apps of ${courseKey}`,
  );
  return raw.map(toCourseApp);
}

/**
 * Switches a course app on or off. An unknown id is `400 Invalid app ID` on the
 * platform, reported here with the ids the course actually offers.
 */
export async function setCourseAppEnabled(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  appId: string,
  enabled: boolean,
): Promise<CourseApp> {
  const url = `${studioOrigin(config)}${COURSE_APPS_PATH}/${courseKey}`;
  const headers = await studioWriteHeaders(request, config);
  const response = await request.patch(url, { data: { id: appId, enabled }, headers });
  if (response.status() === 400) {
    const available = (await fetchCourseApps(request, config, courseKey)).map((app) => app.id);
    throw new ApiError(
      `Studio has no course app "${appId}" for ${courseKey}. Available: ${available.join(', ')}.`,
      { status: 400, url, body: await response.text() },
    );
  }
  return toCourseApp(await studioJson<RawCourseApp>(response, `Setting course app ${appId}`));
}
