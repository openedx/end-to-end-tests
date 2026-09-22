import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson, studioOrigin, studioWriteHeaders, STUDIO_JSON_ACCEPT } from './studio-origin';

/**
 * Course PDF textbooks — Studio's contentstore endpoints. The list is read from
 * the v1 API (`/api/contentstore/v1/textbooks/<key>`), session authed (the
 * author's `page.request`). Adding and deleting textbooks is driven through the
 * Textbooks page; the learner-facing effect (a textbook tab appearing or
 * disappearing) is read through {@link fetchCourseMetadata}.
 */
const v1Url = (config: AppConfig, courseKey: string): string =>
  `${studioOrigin(config)}/api/contentstore/v1/textbooks/${courseKey}`;
/**
 * Adding a textbook goes to the legacy handler: the v1 API is read-only and
 * answers `405` to a `POST` (measured on `main`, 2026-09-22).
 */
const legacyUrl = (config: AppConfig, courseKey: string): string =>
  `${studioOrigin(config)}/textbooks/${courseKey}`;

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

/**
 * Adds a PDF textbook (the Textbooks page's "Add a Textbook"). The chapters'
 * URLs are course asset paths; a textbook with one chapter is enough to show
 * the tab appear.
 */
export async function createTextbook(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  textbook: { readonly tabTitle: string; readonly chapters: readonly TextbookChapter[] },
): Promise<Textbook> {
  const response = await request.post(legacyUrl(config, courseKey), {
    headers: { ...(await studioWriteHeaders(request, config)), ...STUDIO_JSON_ACCEPT },
    data: { tab_title: textbook.tabTitle, chapters: [...textbook.chapters] },
  });
  return studioJson<Textbook>(response, `Adding the textbook ${textbook.tabTitle} to ${courseKey}`);
}
