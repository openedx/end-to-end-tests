import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { firstUnitKey, only } from './outline-helpers';

/**
 * Renaming an outline item in Studio and seeing the new name on the learner side
 * — section (TC-00144), subsection (TC-00145) and unit (TC-00146).
 *
 * The name a test types is its own data, so matching it in the learner's Blocks
 * API is what the round trip asserts. The structure is arranged through the
 * browser's own session (`page.request`); a section/subsection publishes as it
 * is renamed (structure auto-publishes), while a unit rename reaches the learner
 * only after the unit is published, so the unit case publishes and re-checks.
 */
test.describe(
  'Course outline rename',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    // Round trips poll the learner under TIMEOUTS.contentPublish (longer than the
    // default per-test budget), so the block-structure task's delay under load
    // does not trip the test timeout.
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'renames a section and the learner sees the new name',
      { annotation: testId('TC-00144') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          label(test.info(), 'sec'),
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const unitKey = firstUnitKey(section);
        const newName = `${label(test.info(), 'sec')} renamed`;

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.rename(
          studioCourseOutlinePage.section(unitKey),
          'section',
          newName,
        );

        await expect
          .poll(
            async () => (await roundTripLearner.outline()).blocks[section.usageKey]?.display_name,
            {
              timeout: TIMEOUTS.contentPublish,
            },
          )
          .toBe(newName);
      },
    );

    test(
      'renames a subsection and the learner sees the new name',
      { annotation: testId('TC-00145') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          label(test.info(), 'sub'),
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const subsectionKey = only(section.subsections, 'subsection').usageKey;
        const unitKey = firstUnitKey(section);
        const newName = `${label(test.info(), 'sub')} renamed`;

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.rename(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
          newName,
        );

        await expect
          .poll(
            async () => (await roundTripLearner.outline()).blocks[subsectionKey]?.display_name,
            {
              timeout: TIMEOUTS.contentPublish,
            },
          )
          .toBe(newName);
      },
    );

    test(
      'renames a unit and the learner sees the new name after publish',
      { annotation: testId('TC-00146') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          label(test.info(), 'unit'),
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const unitKey = firstUnitKey(section);
        const newName = `${label(test.info(), 'unit')} renamed`;

        // The learner already sees the unit under its original name.
        await expect
          .poll(async () => (await roundTripLearner.outline()).units.map((u) => u.id), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toContain(unitKey);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        const unitCard = studioCourseOutlinePage.unit(unitKey);
        await studioCourseOutlinePage.rename(unitCard, 'unit', newName);
        // A unit's rename is a draft change; publish it so the learner sees it.
        await studioCourseOutlinePage.publish(unitCard, 'unit');

        await expect
          .poll(
            async () =>
              (await roundTripLearner.outline()).units.find((u) => u.id === unitKey)?.displayName,
            { timeout: TIMEOUTS.contentPublish },
          )
          .toBe(newName);
      },
    );
  },
);

/** A name unique to this test and run, safe to match as the test's own data. */
function label(info: { testId: string }, tag: string): string {
  return `E2E rename-${tag} ${info.testId.slice(-6)}`;
}
