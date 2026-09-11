import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { fetchXBlockOutline } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { buildHtmlSection, firstUnitKey, learnerSees, only } from './outline-helpers';

/**
 * "Hide from learners" at section (TC-00154), subsection (TC-00158) and unit
 * (TC-00161) level, asserted **both** states — hidden and shown — as a learner.
 *
 * The author configures visibility in the outline's Configure dialog; the
 * author-side outcome is `xblock/outline` (`visibility_state: "staff_only"`), and
 * the round trip is the learner's Blocks API omitting then including the block.
 * A course author's `all_blocks=true` does not reveal staff-only content, so the
 * Studio outline is the author-side "it is hidden, not deleted" proof (§1.4).
 */
test.describe(
  'Course outline visibility',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    // Round trips poll the learner under TIMEOUTS.contentPublish (longer than the
    // default per-test budget), so the block-structure task's delay under load
    // does not trip the test timeout.
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'hides and shows a section from learners',
      { annotation: testId('TC-00154') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        outlineConfigureDialog,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await buildHtmlSection(
          page.request,
          config,
          contentCourse.courseKey,
          'vis-sec',
          { publish: true },
        );
        const unitKey = firstUnitKey(section);
        await learnerSees(roundTripLearner, unitKey, true);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await outlineConfigureDialog.open(studioCourseOutlinePage.section(unitKey), 'section');
        await outlineConfigureDialog.setSectionHidden(true);
        await outlineConfigureDialog.save();

        expect(
          (await fetchXBlockOutline(page.request, config, section.usageKey)).visibility_state,
        ).toBe('staff_only');
        await learnerSees(roundTripLearner, unitKey, false);

        await outlineConfigureDialog.open(studioCourseOutlinePage.section(unitKey), 'section');
        await outlineConfigureDialog.setSectionHidden(false);
        await outlineConfigureDialog.save();
        await learnerSees(roundTripLearner, unitKey, true);
      },
    );

    test(
      'hides and shows a subsection from learners',
      { annotation: testId('TC-00158') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        outlineConfigureDialog,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await buildHtmlSection(
          page.request,
          config,
          contentCourse.courseKey,
          'vis-sub',
          { publish: true },
        );
        const subsectionKey = only(section.subsections, 'subsection').usageKey;
        const unitKey = firstUnitKey(section);
        await learnerSees(roundTripLearner, unitKey, true);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await outlineConfigureDialog.open(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
        );
        await outlineConfigureDialog.setSubsectionHidden(true);
        await outlineConfigureDialog.save();

        expect(
          (await fetchXBlockOutline(page.request, config, subsectionKey)).visibility_state,
        ).toBe('staff_only');
        await learnerSees(roundTripLearner, unitKey, false);

        await outlineConfigureDialog.open(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
        );
        await outlineConfigureDialog.setSubsectionHidden(false);
        await outlineConfigureDialog.save();
        await learnerSees(roundTripLearner, unitKey, true);
      },
    );

    test(
      'hides and shows a unit from learners',
      { annotation: testId('TC-00161') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        outlineConfigureDialog,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await buildHtmlSection(
          page.request,
          config,
          contentCourse.courseKey,
          'vis-unit',
          { publish: true },
        );
        const unitKey = firstUnitKey(section);
        await learnerSees(roundTripLearner, unitKey, true);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await outlineConfigureDialog.open(studioCourseOutlinePage.unit(unitKey), 'unit');
        await outlineConfigureDialog.setUnitHidden(true);
        await outlineConfigureDialog.save();

        expect((await fetchXBlockOutline(page.request, config, unitKey)).visibility_state).toBe(
          'staff_only',
        );
        await learnerSees(roundTripLearner, unitKey, false);

        await outlineConfigureDialog.open(studioCourseOutlinePage.unit(unitKey), 'unit');
        await outlineConfigureDialog.setUnitHidden(false);
        await outlineConfigureDialog.save();
        await learnerSees(roundTripLearner, unitKey, true);
      },
    );
  },
);
