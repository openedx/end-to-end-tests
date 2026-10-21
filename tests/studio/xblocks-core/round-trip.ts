import type { Page, TestInfo } from '@playwright/test';

import { expect } from '../../../src/fixtures';
import type { RoundTripLearner } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  createLibrary,
  createLibraryBlock,
  fetchContainer,
  fetchLibraryBlockOlx,
  fetchXBlock,
  newLibrarySlug,
  publishLibraryBlock,
  publishXBlock,
  setLibraryBlockOlx,
} from '../../../src/api';
import type { StudioUnitPage } from '../../../src/pages/studio/unit.page';
import type { LibraryPickerDialog } from '../../../src/pages/studio/library';
import { waitForLearnerBlock } from '../../../src/steps';
import { label } from '../library/helpers';

/**
 * The library → Studio → LMS round trip every extracted-XBlock tracer bullet
 * shares (regression plan B1 items 1–4). Steps:
 *
 *  1. As the Studio author, create an empty V2 content library and a block of
 *     `blockType` in it (libraries API).
 *  2. Write the block's OLX (`olx(displayName)`), read it back, and assert it
 *     contains each of `olxContains` and no literal `"null"` attribute.
 *  3. Publish the library block.
 *  4. Create a new section > subsection > empty unit in the worker's course.
 *  5. In the Studio authoring MFE, open the unit's "Add component" > Library,
 *     pick the library, wait for the block's card, and add it (real UI).
 *  6. Read the course copy via the Studio xblock API and assert its metadata
 *     matches `courseMetadata`.
 *  7. Publish the unit. (The library is left in place on the target.)
 *  8. Provision a fresh enrolled learner; wait until their Blocks API lists the
 *     block with type `blockType`.
 *  9. Run `beforeLearnerVisit` (e.g. network stubs), then open the unit in the
 *     Learning MFE as the learner.
 *
 * Returns the learner and keys so the spec can do the block-specific learner checks.
 */
export interface RoundTripFixtures {
  readonly page: Page;
  readonly config: AppConfig;
  readonly resyncStudioAuthor: () => Promise<void>;
  readonly contentCourse: { readonly courseKey: string };
  readonly roundTripLearnerLater: () => Promise<RoundTripLearner>;
  readonly studioUnitPage: StudioUnitPage;
  readonly libraryPicker: LibraryPickerDialog;
}

export interface RoundTripSpec {
  readonly blockType: string;
  /** The block's OLX, given the display name the picker will find it by. */
  readonly olx: (displayName: string) => string;
  /** Substrings the OLX must still contain after the library stores it. */
  readonly olxContains?: readonly string[];
  /** Fields the course copy's metadata must carry. */
  readonly courseMetadata?: Readonly<Record<string, unknown>>;
  readonly beforeLearnerVisit?: (learner: RoundTripLearner) => Promise<void>;
}

export interface RoundTripResult {
  readonly learner: RoundTripLearner;
  readonly blockKey: string;
  readonly courseKey: string;
  readonly unitKey: string;
  readonly subsectionKey: string;
  readonly displayName: string;
}

export async function libraryToLearner(
  fx: RoundTripFixtures,
  testInfo: TestInfo,
  spec: RoundTripSpec,
): Promise<RoundTripResult> {
  const { page, config, contentCourse, studioUnitPage, libraryPicker } = fx;
  const displayName = label(spec.blockType, testInfo.testId);

  // 1–3. Library.
  const library = await createLibrary(page.request, config, {
    org: config.org ?? 'OpenedX',
    slug: newLibrarySlug(spec.blockType.replace(/_/g, '')),
    title: displayName,
  });
  const block = await createLibraryBlock(page.request, config, library.id, {
    blockType: spec.blockType,
  });
  await setLibraryBlockOlx(page.request, config, block.id, spec.olx(displayName));
  const olx = await fetchLibraryBlockOlx(page.request, config, block.id);
  for (const expected of spec.olxContains ?? []) expect(olx).toContain(expected);
  expect(olx).not.toContain('"null"');
  await publishLibraryBlock(page.request, config, block.id);

  // 4–5. Course unit, added from the library picker.
  await fx.resyncStudioAuthor();
  const section = await buildSection(page.request, config, contentCourse.courseKey, displayName, {
    subsections: [{ units: [{ blocks: [] }] }],
  });
  const unitKey = section.units[0]?.usageKey ?? '';
  const subsectionKey = section.subsections[0]?.usageKey ?? '';

  await studioUnitPage.goto(unitKey);
  const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
  await studioUnitPage.openAddComponent(types.indexOf('library_v2'));
  await libraryPicker.selectLibrary(library.id, library.title);
  await libraryPicker.cardFor(displayName).first().waitFor({ timeout: TIMEOUTS.librarySearch });
  const added = (await (await libraryPicker.addToCourse(displayName)).json()) as {
    locator: string;
  };
  const blockKey = added.locator;

  // 6–7. Course copy carries the library's fields; publish.
  const copy = await fetchXBlock(page.request, config, blockKey);
  expect(copy.metadata).toMatchObject({ display_name: displayName, ...spec.courseMetadata });
  await publishXBlock(page.request, config, unitKey);

  // 8–9. Learner.
  const learner = await fx.roundTripLearnerLater();
  const seen = await waitForLearnerBlock(learner.outline, blockKey);
  expect(seen.satisfied, `learner outline blocks: ${seen.last.join(', ')}`).toBe(true);
  expect((await learner.outline()).blocks[blockKey]?.type).toBe(spec.blockType);
  await spec.beforeLearnerVisit?.(learner);
  await learner.prime(subsectionKey);
  await learner.unitPage.goto(contentCourse.courseKey, subsectionKey, unitKey);
  await expect(learner.unitPage.block(blockKey)).toBeAttached();

  return {
    learner,
    blockKey,
    courseKey: contentCourse.courseKey,
    unitKey,
    subsectionKey,
    displayName,
  };
}

/** Every extracted-XBlock tracer bullet's tags. */
export const ROUND_TRIP_TAGS = [
  '@regression',
  '@mfe-learning',
  '@studio',
  '@author',
  '@mfe-authoring',
  '@content-libraries',
];

/** Escapes text for an OLX attribute or element body. */
export const xml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
