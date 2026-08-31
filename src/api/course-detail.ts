import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';

/** Public Course Detail API. Readable without enrollment or staff rights. */
export const COURSE_DETAIL_PATH = '/api/courses/v1/courses';

/**
 * The course's own identifiers and title, straight from the platform.
 *
 * Specs need these to *drive* the UI — a catalog search has to be given
 * something to search for. Taking them from the API rather than from a constant
 * keeps the suite installation-agnostic (the demo course is titled differently on
 * different installs) and keeps the search term test-owned data rather than
 * displayed copy, which the no-displayed-text rule forbids reading back.
 */
export interface CourseDetail {
  readonly id: string;
  /** Display name, e.g. `Open edX Demo Course`. Localized in principle. */
  readonly name: string;
  /** Course number, e.g. `DemoX`. An identifier, so never translated. */
  readonly number: string;
  /** Organization short code, e.g. `OpenedX`. */
  readonly org: string;
}

/**
 * Reads course metadata for `courseKey`.
 *
 * @throws {ApiError} when the course is not served by the target.
 */
export async function fetchCourseDetail(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseDetail> {
  const url = `${config.baseUrls.lms}${COURSE_DETAIL_PATH}/${encodeURIComponent(courseKey)}`;
  const response = await request.get(url);

  if (!response.ok()) {
    throw new ApiError(
      `Could not read course detail for "${courseKey}" (HTTP ${response.status()}).`,
      {
        status: response.status(),
        url,
        body: await response.text(),
      },
    );
  }

  const body = (await response.json()) as Partial<CourseDetail>;
  if (typeof body.id !== 'string' || typeof body.number !== 'string') {
    throw new ApiError(`Course Detail API returned an unexpected shape for "${courseKey}".`, {
      status: response.status(),
      url,
      body: JSON.stringify(body).slice(0, 500),
    });
  }

  return { id: body.id, name: body.name ?? '', number: body.number, org: body.org ?? '' };
}
