import { randomUUID } from 'node:crypto';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  fetchCourseMetadata,
  fetchCoursewareCourse,
  listCourseNotes,
  publishXBlock,
  updateAdvancedSettings,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { waitForLearnerBlock } from '../../../src/steps';

/**
 * The Notes tool (TC-00038), gated on `@notes`: once the author turns notes on
 * for the course, a learner is offered the Notes tab and the unit page's "Show
 * Notes" switch, and can take a note on a unit's text that the Notes page then
 * lists. The courseware and course metadata APIs, and the LMS's own list of the
 * learner's notes, decide.
 */
test.describe(
  'Course notes',
  { tag: ['@regression', '@studio', '@author', '@notes', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'offers the Notes tab and the show/hide switch once the author turns notes on',
      { annotation: testId('TC-00038') },
      async ({ request, config, contentCourse, ownSection, roundTripLearner }) => {
        const unit = ownSection.units[0]!;
        await publishXBlock(request, config, unit.usageKey);
        await updateAdvancedSettings(request, config, contentCourse.courseKey, { edxnotes: true });

        const learner = roundTripLearner;
        const notes = async () =>
          (await fetchCoursewareCourse(learner.request, config, learner.courseKey)).notes;
        await expect.poll(notes, { timeout: TIMEOUTS.contentPublish }).toEqual({
          enabled: true,
          visible: true,
        });
        const tab = (
          await fetchCourseMetadata(learner.request, config, learner.courseKey)
        ).tabs.find((t) => t.tab_id === 'edxnotes');
        expect(tab, 'the course offers the Notes tab').toBeDefined();

        expect((await waitForLearnerBlock(learner.outline, unit.usageKey)).satisfied).toBe(true);
        await learner.prime(unit.sequentialUsageKey);
        await learner.unitPage.goto(learner.courseKey, unit.sequentialUsageKey, unit.usageKey);
        await expect(learner.unitPage.notesToggle).toHaveAttribute('aria-checked', 'true');
        expect((await learner.unitPage.toggleNotes()).status()).toBe(200);
        await expect(learner.unitPage.notesToggle).toHaveAttribute('aria-checked', 'false');
        expect((await notes()).visible).toBe(false);
        expect((await learner.unitPage.toggleNotes()).status()).toBe(200);
        expect((await notes()).visible).toBe(true);

        await learner.courseToolsPage.gotoNotes(tab!.url);
        await expect(learner.courseToolsPage.notesEmpty).toBeVisible();
      },
    );

    // NOTES-001: HTML components are the extracted `xblocks_contrib` HtmlBlock by
    // default, which the platform's notes decorator does not wrap, so there is no
    // annotatable text in a unit to take a note on.
    test.fail(
      'takes a note on a unit’s text and lists it on the Notes page',
      { annotation: testId('TC-00038') },
      async ({ request, config, contentCourse, ownSection, roundTripLearner }) => {
        const unit = ownSection.units[0]!;
        await publishXBlock(request, config, unit.usageKey);
        await updateAdvancedSettings(request, config, contentCourse.courseKey, { edxnotes: true });

        const learner = roundTripLearner;
        expect((await waitForLearnerBlock(learner.outline, unit.usageKey)).satisfied).toBe(true);
        await learner.prime(unit.sequentialUsageKey);
        await learner.unitPage.goto(learner.courseKey, unit.sequentialUsageKey, unit.usageKey);

        const text = `E2E note ${randomUUID().slice(0, 8)}`;
        expect((await learner.unitPage.takeNote(text)).status()).toBe(201);
        expect(
          (await listCourseNotes(learner.request, config, learner.courseKey)).map(
            (note) => note.text,
          ),
        ).toContain(text);

        const tab = (
          await fetchCourseMetadata(learner.request, config, learner.courseKey)
        ).tabs.find((t) => t.tab_id === 'edxnotes');
        await learner.courseToolsPage.gotoNotes(tab!.url);
        await expect(learner.courseToolsPage.notes.filter({ hasText: text })).toHaveCount(1);
      },
    );
  },
);
