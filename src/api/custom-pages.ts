import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { studioJson, studioOrigin, studioWriteHeaders } from './studio-origin';

/**
 * Custom pages (static tabs) as the authoring MFE's Custom Pages screen reads and
 * writes them. A custom page is a `static_tab` XBlock; the list and its order live
 * under the contentstore v0 tabs endpoint, while create/rename/delete go through
 * the generic XBlock endpoint (the same calls the MFE makes).
 *
 * The suite seeds and cleans up pages through this API — creating one is setup,
 * not the thing under test; the drag-reorder in the UI is (see the spec).
 */
export const TABS_PATH = '/api/contentstore/v0/tabs';
const XBLOCK_PATH = '/xblock';

export interface CustomPage {
  /** The static-tab block id, e.g. `block-v1:…+type@static_tab+block@<hash>`. */
  readonly id: string;
  /** The page's display name (its tab title). */
  readonly name: string;
}

interface RawCustomPage {
  readonly id?: string;
  readonly name?: string;
  readonly type?: string;
}

/** The custom pages of a course, in their current order. */
export async function fetchCustomPages(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly CustomPage[]> {
  const response = await request.get(`${studioOrigin(config)}${TABS_PATH}/${courseKey}`);
  const raw = await studioJson<readonly RawCustomPage[]>(
    response,
    `Reading the custom pages of ${courseKey}`,
  );
  return raw
    .filter((tab) => tab.type === 'static_tab')
    .map((tab) => ({ id: tab.id ?? '', name: tab.name ?? '' }));
}

/** The course's root block locator, the parent a new static tab is created under. */
function courseBlockLocator(courseKey: string): string {
  // `course-v1:ORG+NUM+RUN` → `block-v1:ORG+NUM+RUN+type@course+block@course`.
  return `block-${courseKey.substring('course-'.length)}+type@course+block@course`;
}

/** Creates a custom page and returns its new block id. */
export async function createCustomPage(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<string> {
  const url = `${studioOrigin(config)}${XBLOCK_PATH}/`;
  const headers = await studioWriteHeaders(request, config);
  const response = await request.put(url, {
    headers,
    data: { category: 'static_tab', parent_locator: courseBlockLocator(courseKey) },
  });
  const body = await studioJson<{ locator?: string }>(
    response,
    `Creating a custom page in ${courseKey}`,
  );
  if (typeof body.locator !== 'string') {
    throw new ApiError('Studio created the custom page but returned no locator.', {
      status: response.status(),
      url,
      body: JSON.stringify(body),
    });
  }
  return body.locator;
}

/** Renames a custom page (so seeded pages are distinguishable across APIs). */
export async function setCustomPageName(
  request: APIRequestContext,
  config: AppConfig,
  blockId: string,
  name: string,
): Promise<void> {
  const url = `${studioOrigin(config)}${XBLOCK_PATH}/${blockId}`;
  const headers = await studioWriteHeaders(request, config);
  const response = await request.put(url, {
    headers,
    data: { id: blockId, metadata: { display_name: name } },
  });
  if (!response.ok()) {
    throw new ApiError(`Renaming custom page ${blockId} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: (await response.text()).slice(0, 500),
    });
  }
}

/** Deletes a custom page. */
export async function deleteCustomPage(
  request: APIRequestContext,
  config: AppConfig,
  blockId: string,
): Promise<void> {
  const url = `${studioOrigin(config)}${XBLOCK_PATH}/${blockId}`;
  const headers = await studioWriteHeaders(request, config);
  const response = await request.delete(url, { headers });
  if (!response.ok()) {
    throw new ApiError(`Deleting custom page ${blockId} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: (await response.text()).slice(0, 500),
    });
  }
}
