import { checkA11y } from '../../../src/a11y';
import { STUDIO_OUTLINE_PAGE_SELECTORS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { buildSection, fetchCourseIndex, fetchXBlockOutline } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { firstUnitKey } from './outline-helpers';

/**
 * Course highlight e-mails (TC-00172): the author enables them from the course
 * outline's status bar and gives a section its highlights through the section
 * card's highlights dialog; Studio stores both.
 *
 * This is the authoring half only. Highlights drive the weekly "what's coming up"
 * e-mail, which needs the schedules beat and an inbox to observe, so the e-mail
 * itself is not asserted. The outcome is what Studio stores:
 * `course_index.course_structure.highlights_enabled_for_messaging` for the course
 * flag, and the section's `xblock/outline` `highlights` for its list. Both are
 * the test's own data, so the spec may match the exact strings it wrote.
 */
test.describe(
  'Course outline highlights',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test(
      'enables course highlight e-mails and saves a section’s highlights',
      { annotation: testId('TC-00172') },
      async ({
        page,
        config,
        authoringCourse,
        studioAuthorSession,
        studioCourseOutlinePage,
        outlineHighlightsDialog,
      }) => {
        void studioAuthorSession;
        // Author Studio API off the browser's own session — see course-lifecycle.spec.ts.
        const api = page.request;
        const courseKey = authoringCourse.courseKey;
        const label = `E2E highlights ${test.info().testId.slice(-6)}`;
        const section = await buildSection(api, config, courseKey, label);
        expect(
          (await fetchCourseIndex(api, config, courseKey)).course_structure
            .highlights_enabled_for_messaging,
        ).toBe(false);

        // Enable highlight e-mails from the status bar; the status bar then says so.
        await studioCourseOutlinePage.goto(courseKey);
        await outlineHighlightsDialog.enableForCourse();
        await expect(outlineHighlightsDialog.enabledStatus).toBeVisible();
        expect(
          (await fetchCourseIndex(api, config, courseKey)).course_structure
            .highlights_enabled_for_messaging,
        ).toBe(true);

        // Give the section its highlights from the card's highlights dialog.
        const highlights = [`${label} highlight one`, `${label} highlight two`];
        await outlineHighlightsDialog.open(studioCourseOutlinePage.section(firstUnitKey(section)));
        await checkA11y(page, {
          label: 'outline-highlights',
          include: STUDIO_OUTLINE_PAGE_SELECTORS.highlightsModal,
        });
        await outlineHighlightsDialog.save(highlights);
        await expect
          .poll(async () => (await fetchXBlockOutline(api, config, section.usageKey)).highlights)
          .toEqual(highlights);
      },
    );
  },
);
