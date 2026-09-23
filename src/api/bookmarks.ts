import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { lmsGet, lmsWrite } from './lms-json';

/**
 * Courseware bookmarks (`openedx/core/djangoapps/bookmarks`) — the oracle of the
 * learning MFE's "Bookmark this page" button and the course's Bookmarks tool.
 *
 * The API authenticates by **session or Bearer token only**: a JWT-only context
 * is answered 401 (measured), so these calls need the learner's own signed-in
 * context, whose session registration already created. Writes carry Django's
 * CSRF header. Adding a bookmark that exists is accepted again (201), so a
 * retried test never trips on its own earlier attempt.
 */
export const BOOKMARKS_PATH = '/api/bookmarks/v1/bookmarks';

export interface Bookmark {
  /** `"<username>,<usage_id>"` — the detail route's key. */
  readonly id: string;
  readonly course_id: string;
  readonly usage_id: string;
  readonly block_type: string;
  readonly created: string;
}

interface BookmarkPage {
  readonly count: number;
  readonly results: readonly Bookmark[];
}

async function withSessionHint<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new ApiError(
        `${error.message} The bookmarks API accepts a session or Bearer token, not a JWT alone — call it on the learner's signed-in context.`,
        { status: error.status, url: error.url, body: error.body },
      );
    }
    throw error;
  }
}

/** The caller's bookmarks in one course (first page of up to 100). */
export async function listBookmarks(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly Bookmark[]> {
  const query = new URLSearchParams({ course_id: courseKey, page_size: '100' });
  const page = await withSessionHint(() =>
    lmsGet<BookmarkPage>(
      request,
      `${config.baseUrls.lms}${BOOKMARKS_PATH}/?${query}`,
      'Listing bookmarks',
    ),
  );
  return page.results;
}

/** Bookmarks a block (a unit's usage key) for the caller. */
export async function addBookmark(
  request: APIRequestContext,
  config: AppConfig,
  usageId: string,
): Promise<Bookmark> {
  return withSessionHint(() =>
    lmsWrite<Bookmark>(
      request,
      config,
      'POST',
      `${config.baseUrls.lms}${BOOKMARKS_PATH}/`,
      'Adding a bookmark',
      { data: { usage_id: usageId } },
    ),
  );
}

/** Removes the caller's bookmark on a block. */
export async function removeBookmark(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
  usageId: string,
): Promise<void> {
  await withSessionHint(() =>
    lmsWrite<void>(
      request,
      config,
      'DELETE',
      `${config.baseUrls.lms}${BOOKMARKS_PATH}/${username},${usageId}/`,
      'Removing a bookmark',
    ),
  );
}
