import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';
import { studioJson } from './studio-origin';

/**
 * LMS Course Modes API (`common/djangoapps/course_modes/rest_api`). Reading is
 * open; creating a mode needs a staff/superuser session, which the suite's
 * `staff` role holds — the `author` role does not (a create returns 403 for it).
 */
export const COURSE_MODES_PATH = '/api/course_modes/v1/courses';

interface RawCourseMode {
  readonly mode_slug?: string;
}

/** The enrollment-mode slugs the course offers, e.g. `['audit']`. */
export async function fetchCourseModes(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly string[]> {
  const url = `${config.baseUrls.lms}${COURSE_MODES_PATH}/${courseKey}/`;
  const response = await request.get(url);
  const body = await studioJson<readonly RawCourseMode[]>(
    response,
    `Reading course modes for "${courseKey}"`,
  );
  return body.map((mode) => mode.mode_slug ?? '').filter((slug) => slug !== '');
}

/**
 * Ensures the course offers the `honor` enrollment mode — a certificate-bearing
 * mode, without which the authoring MFE hides the Certificates form (STUDIO-006).
 * Idempotent: a mode already present is left as is. `request` must hold a staff
 * (superuser) session; the mode cannot be added with the `author` session.
 *
 * @returns whether a mode was added (false when one was already there).
 */
export async function ensureCertificateBearingMode(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  modeSlug = 'honor',
): Promise<boolean> {
  const existing = await fetchCourseModes(request, config, courseKey);
  if (existing.includes(modeSlug)) return false;

  const token = await fetchCsrfToken(request, config);
  const url = `${config.baseUrls.lms}${COURSE_MODES_PATH}/${courseKey}/`;
  const response = await request.post(url, {
    data: {
      course_id: courseKey,
      mode_slug: modeSlug,
      mode_display_name: modeSlug.charAt(0).toUpperCase() + modeSlug.slice(1),
      currency: 'usd',
      min_price: 0,
    },
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });
  if (response.status() !== 201) {
    throw new ApiError(
      `Could not add the "${modeSlug}" mode to "${courseKey}" (HTTP ${response.status()}). ` +
        'This needs a staff/superuser session.',
      { status: response.status(), url, body: await response.text() },
    );
  }
  return true;
}
