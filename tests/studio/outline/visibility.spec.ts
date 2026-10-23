import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { fetchXBlockOutline } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { publishUnitIfDraft } from '../../../src/steps';
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
 *
 * Un-hiding a unit saves a draft where the authoring MFE has
 * frontend-app-authoring#3284 (`outline-unhide-draft`) and publishes elsewhere, so
 * the unit round trip publishes whatever draft remains; the gated case asserts
 * the draft itself.
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
        await publishUnitIfDraft(studioCourseOutlinePage, page.request, config, unitKey);
        await learnerSees(roundTripLearner, unitKey, true);
      },
    );

    test(
      'un-hiding a unit saves a draft that learners see once published',
      { tag: '@outline-unhide-draft', annotation: testId('TC-00161') },
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
          'vis-draft',
          { publish: true },
        );
        const unitKey = firstUnitKey(section);
        const unitCard = studioCourseOutlinePage.unit(unitKey);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await outlineConfigureDialog.open(unitCard, 'unit');
        await outlineConfigureDialog.setUnitHidden(true);
        await outlineConfigureDialog.save();

        // Hiding publishes at once: no draft is left behind.
        const hidden = await fetchXBlockOutline(page.request, config, unitKey);
        expect(hidden.visibility_state).toBe('staff_only');
        expect(hidden.has_changes).toBe(false);
        await learnerSees(roundTripLearner, unitKey, false);

        await outlineConfigureDialog.open(unitCard, 'unit');
        await outlineConfigureDialog.setUnitHidden(false);
        await outlineConfigureDialog.save();

        // Un-hiding only drafts: the published unit is still staff-only.
        const unhidden = await fetchXBlockOutline(page.request, config, unitKey);
        expect(unhidden.has_changes).toBe(true);
        expect(unhidden.visibility_state).toBe('needs_attention');
        await learnerSees(roundTripLearner, unitKey, false);

        await studioCourseOutlinePage.publish(unitCard, 'unit');
        expect((await fetchXBlockOutline(page.request, config, unitKey)).has_changes).toBe(false);
        await learnerSees(roundTripLearner, unitKey, true);
      },
    );
  },
);
