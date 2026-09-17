import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../../../src/config';
import {
  createLibraryBlock,
  libraryOlx,
  setLibraryBlockOlx,
  type LibraryBlock,
} from '../../../src/api';

/**
 * Every content-library spec runs as the worker author (the library's admin) in
 * the `studio-author` project and is gated on the `content-libraries`
 * capability: `main` and `verawood` declare it, older releases skip the tree.
 */
export const LIBRARY_TAGS: string[] = [
  '@studio',
  '@author',
  '@mfe-authoring',
  '@content-libraries',
];

/**
 * Accessibility debt the library-authoring MFE carries, reported on every run
 * but not failed until the MFE fixes it. Filled in as the a11y gates find it;
 * each entry names its `LIB-00x` finding.
 */
export const LIBRARY_A11Y_BASELINE: readonly string[] = [
  // `LIB-004`: the library header's "Library Info" button nests interactive
  // content (library home, info sidebar).
  'nested-interactive',
  // `LIB-004`: the component sidebar keeps focusable content inside an
  // `aria-hidden` tab pane (component info).
  'aria-hidden-focus',
  // `LIB-004`: the collection page's description textarea has no label, and its
  // breadcrumb `<ul>` holds a non-`<li>` child.
  'label',
  'list',
  // `LIB-004`: the legacy-library migration stepper's library list scrolls
  // without keyboard access.
  'scrollable-region-focusable',
];

/** A short, unique label for content a test authors — safe to match in the UI as our own data. */
export function label(tag: string, testId: string): string {
  return `E2E ${tag} ${testId.slice(-6)}`;
}

/** Creates a text block carrying `title` (and `text` as its body) in a library, unpublished. */
export async function authorTextBlock(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  title: string,
  text = title,
): Promise<LibraryBlock> {
  const block = await createLibraryBlock(request, config, libraryKey, { blockType: 'html' });
  await setLibraryBlockOlx(request, config, block.id, libraryOlx.html(title, text));
  return { ...block, display_name: title };
}
