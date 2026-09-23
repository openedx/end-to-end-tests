import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../../../src/config';
import {
  type LibraryBlock,
  createLibraryBlock,
  libraryOlx,
  setLibraryBlockOlx,
} from '../../../src/api';

/**
 * The library half of the RBAC coverage. It runs on a library the worker author
 * created — which makes it that library's `library_admin` — and assigns every
 * other role through the authz API, so no waffle flag is involved: library roles
 * are enforced whatever `authz.enable_course_authoring` says.
 */
export const RBAC_LIBRARY_TAGS: string[] = [
  '@studio',
  '@author',
  '@mfe-authoring',
  '@rbac',
  '@content-libraries',
];

/** A short, unique label for content a test authors — our own data, safe to match. */
export function libraryLabel(tag: string, testId: string): string {
  return `E2E rbac ${tag} ${testId.slice(-6)}`;
}

/** Creates an unpublished text block carrying `title` as its display name. */
export async function authorBlock(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  title: string,
): Promise<LibraryBlock> {
  const block = await createLibraryBlock(request, config, libraryKey, { blockType: 'html' });
  await setLibraryBlockOlx(request, config, block.id, libraryOlx.html(title, title));
  return { ...block, display_name: title };
}

/** The status an API refusal carried, or `200` when the call succeeded. */
export async function statusOf(work: Promise<unknown>): Promise<number> {
  try {
    await work;
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? -1;
  }
}
