import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson, studioOrigin, studioWriteHeaders, STUDIO_JSON_ACCEPT } from './studio-origin';

/**
 * Course PDF textbooks — Studio's contentstore endpoints. The list is read from
 * the v1 API (`/api/contentstore/v1/textbooks/<key>`); create/delete use the
 * legacy `/textbooks/<key>[/id]` routes the Textbooks page posts to. Session
 * authed, so the author's `page.request`. The learner-facing effect (a textbook
 * tab appearing/disappearing) is read through {@link fetchCourseMetadata}.
 */
const v1Url = (config: AppConfig, courseKey: string): string =>
  `${studioOrigin(config)}/api/contentstore/v1/textbooks/${courseKey}`;
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

/** Creates a textbook with its chapters. */
export async function createTextbook(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  textbook: { readonly tab_title: string; readonly chapters: readonly TextbookChapter[] },
): Promise<Textbook> {
  const response = await request.post(legacyUrl(config, courseKey), {
    headers: { ...(await studioWriteHeaders(request, config)), 'Content-Type': 'application/json' },
    data: textbook,
  });
  return studioJson<Textbook>(response, `Creating textbook "${textbook.tab_title}"`);
}

/** Deletes a textbook by id. */
export async function deleteTextbook(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  textbookId: string,
): Promise<void> {
  const response = await request.delete(`${legacyUrl(config, courseKey)}/${textbookId}`, {
    headers: await studioWriteHeaders(request, config),
  });
  await studioJson<unknown>(response, `Deleting textbook ${textbookId}`, { allowEmpty: true });
}
