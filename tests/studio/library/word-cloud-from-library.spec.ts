/*
 * What this test does, step by step:
 *
 *  1. As the Studio author, creates an empty V2 content library and a
 *     `word_cloud` block in it (via the libraries API).
 *  2. Writes the block's OLX with non-default fields: a display name, instructions,
 *     num_inputs=3, num_top_words=7, display_student_percents=false.
 *  3. Reads the OLX back and asserts those fields persisted, that
 *     display_student_percents is the boolean "false", and that no attribute was
 *     written as a literal "null".
 *  4. Publishes the library block.
 *  5. Creates a new section > subsection > empty unit in the worker's course.
 *  6. Opens that unit in the Studio authoring MFE, opens "Add component" >
 *     Library, picks the library, waits for the block's card to be indexed, and
 *     adds it to the unit (real UI, not API).
 *  7. Reads the course copy of the block via the Studio xblock API and asserts it
 *     carries the same fields as the library original.
 *  8. Publishes the unit.
 *  9. Provisions a fresh learner enrolled in the course and waits until the
 *     learner's Blocks API lists the new block, with type `word_cloud`.
 * 10. As the learner, opens the unit in the Learning MFE and asserts the word
 *     cloud renders with exactly 3 inputs (these are built by the block's own
 *     JS, so this proves its static assets loaded).
 * 11. Types three words (one unicode) and clicks Save, asserting the
 *     `handle_submit_state` handler returns 2xx.
 * 12. Calls the block's `handle_get_state` handler as the learner and asserts the
 *     submission was recorded with exactly those three words.
 */
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  createLibrary,
  createLibraryBlock,
  deleteLibrary,
  newLibrarySlug,
  fetchContainer,
  fetchLibraryBlockOlx,
  fetchWordCloudState,
  fetchXBlock,
  publishLibraryBlock,
  publishXBlock,
  setLibraryBlockOlx,
} from '../../../src/api';
import { waitForLearnerBlock } from '../../../src/steps';
import { LIBRARY_TAGS, label } from './helpers';

/**
 * Extracted-XBlock regression plan, Word Cloud (B1 rollout gate + C2): a
 * `word_cloud` authored in a V2 library with non-default fields, reused in a
 * course unit, and submitted by a learner in the LMS.
 *
 * Tracer bullet for the xblocks-core restructure (xblocks-core#244): the block's
 * fields must survive the library → course copy, and its student JS (served from
 * the package's static assets) must render exactly `num_inputs` inputs and post
 * to its handler.
 */
test.describe(
  'Word Cloud block from a library',
  { tag: ['@regression', '@mfe-learning', ...LIBRARY_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test('a learner submits words to a Word Cloud reused from a library', async ({
      page,
      config,
      studioAuthorSession,
      resyncStudioAuthor,
      contentCourse,
      roundTripLearnerLater,
      studioUnitPage,
      libraryPicker,
    }, testInfo) => {
      void studioAuthorSession;
      const displayName = label('word-cloud', testInfo.testId);
      const instructions = `Name three things ${testInfo.testId}`;

      // --- Library: author creates it and a block with non-default fields. ---
      const library = await createLibrary(page.request, config, {
        org: config.org ?? 'OpenedX',
        slug: newLibrarySlug('wc'),
        title: displayName,
      });
      try {
        const block = await createLibraryBlock(page.request, config, library.id, {
          blockType: 'word_cloud',
        });
        await setLibraryBlockOlx(
          page.request,
          config,
          block.id,
          `<word_cloud display_name="${displayName}" instructions="${instructions}"` +
            ` num_inputs="3" num_top_words="7" display_student_percents="false" />`,
        );
        // C2.3: display_student_percents persists as a real boolean; no literal "null"s.
        const olx = await fetchLibraryBlockOlx(page.request, config, block.id);
        expect(olx).toContain('num_inputs="3"');
        expect(olx).toContain('num_top_words="7"');
        expect(olx).toContain('display_student_percents="false"');
        expect(olx).not.toContain('"null"');
        await publishLibraryBlock(page.request, config, block.id);

        // --- Course: add from the library picker, publish. ---
        await resyncStudioAuthor();
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          label('word-cloud', testInfo.testId),
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const subsectionKey = section.subsections[0]?.usageKey ?? '';

        await studioUnitPage.goto(unitKey);
        const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
        await studioUnitPage.openAddComponent(types.indexOf('library_v2'));
        await libraryPicker.selectLibrary(library.id, library.title);
        await libraryPicker
          .cardFor(displayName)
          .first()
          .waitFor({ timeout: TIMEOUTS.librarySearch });
        const added = (await (await libraryPicker.addToCourse(displayName)).json()) as {
          locator: string;
        };

        // The course copy carries the library's fields.
        const copy = await fetchXBlock(page.request, config, added.locator);
        expect(copy.metadata).toMatchObject({
          display_name: displayName,
          instructions,
          num_inputs: 3,
          num_top_words: 7,
          display_student_percents: false,
        });

        await publishXBlock(page.request, config, unitKey);

        // --- LMS: learner sees 3 inputs, submits, state is recorded. ---
        const learner = await roundTripLearnerLater();
        const seen = await waitForLearnerBlock(learner.outline, added.locator);
        expect(seen.satisfied, `learner outline blocks: ${seen.last.join(', ')}`).toBe(true);
        expect((await learner.outline()).blocks[added.locator]?.type).toBe('word_cloud');

        await learner.prime(subsectionKey);
        await learner.unitPage.goto(contentCourse.courseKey, subsectionKey, unitKey);
        const cloud = learner.unitPage.wordCloudBlock(added.locator);
        await expect(cloud.rendered).toBeVisible();
        await expect(cloud.inputs).toHaveCount(3);

        const words = ['alpha', 'bravo', `ünïcødé${Date.now()}`];
        const response = await cloud.submit(words);
        expect(response.ok()).toBe(true);

        const state = await fetchWordCloudState(
          learner.request,
          config,
          contentCourse.courseKey,
          added.locator,
        );
        expect(state.submitted).toBe(true);
        expect(Object.keys(state.studentWords).sort()).toEqual([...words].sort());
      } finally {
        await deleteLibrary(page.request, config, library.id).catch(() => undefined);
      }
    });
  },
);
