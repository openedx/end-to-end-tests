import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson, studioOrigin, STUDIO_JSON_ACCEPT } from './studio-origin';

/**
 * Course PDF textbooks — Studio's contentstore endpoints. The list is read from
 * the v1 API (`/api/contentstore/v1/textbooks/<key>`), session authed (the
 * author's `page.request`). Adding and deleting textbooks is driven through the
 * Textbooks page; the learner-facing effect (a textbook tab appearing or
 * disappearing) is read through {@link fetchCourseMetadata}.
 */
const v1Url = (config: AppConfig, courseKey: string): string =>
  `${studioOrigin(config)}/api/contentstore/v1/textbooks/${courseKey}`;

/** One chapter of a textbook (a PDF by URL). */
export interface TextbookChapter {
  readonly title: string;
  readonly url: string;
}

/** A course textbook as the API returns it. */
export interface Textbook {
  readonly id: string;
  readonly tab_title: string;
  readonly chapters: readonly TextbookChapter[];
}

/** Lists a course's textbooks. */
export async function fetchTextbooks(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly Textbook[]> {
  const body = await studioJson<{ readonly textbooks: readonly Textbook[] }>(
    await request.get(v1Url(config, courseKey), { headers: STUDIO_JSON_ACCEPT }),
    `Listing textbooks of ${courseKey}`,
  );
  return body.textbooks;
}
