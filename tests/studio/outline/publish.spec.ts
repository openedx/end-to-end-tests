import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { fetchCourseNavigation, fetchXBlockOutline } from '../../../src/api';
import { UnitPage } from '../../../src/pages/lms/courseware/unit.page';
import { testId } from '../../../src/reporting';
import { buildHtmlSection, firstUnitKey } from './outline-helpers';

/**
 * Publishing outline items in Studio and confirming the learner can reach them —
 * unit (TC-00147), subsection (TC-00148) and section (TC-00149) — plus "View
 * live" opening the published unit in the LMS (TC-00171).
 *
 * Each spec starts from an **unpublished** unit (structure is arranged through
 * `page.request`, units left as drafts), so publishing is the act under test.
 * The author-side outcome is `xblock/outline` (`published`, `visibility_state`);
 * the round trip is the learner's Blocks API listing the unit.
 */
test.describe(
  'Course outline publish',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    // Round trips poll the learner under TIMEOUTS.contentPublish (longer than the
    // default per-test budget), so the block-structure task's delay under load
    // does not trip the test timeout.
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'publishes a unit from its card menu and the learner can reach it',
      { tag: '@smoke', annotation: testId('TC-00147') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await buildHtmlSection(
          page.request,
          config,
          contentCourse.courseKey,
          'publish-unit',
        );
        const unitKey = firstUnitKey(section);
        expect((await fetchXBlockOutline(page.request, config, unitKey)).published).toBe(false);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.publish(studioCourseOutlinePage.unit(unitKey), 'unit');

        expect(await fetchXBlockOutline(page.request, config, unitKey)).toMatchObject({
          published: true,
          has_changes: false,
          visibility_state: 'live',
        });
        await expect
          .poll(async () => (await roundTripLearner.outline()).units.map((u) => u.id), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toContain(unitKey);
      },
    );

    test(
      'publishes a subsection from its card menu and the learner can reach its unit',
      { tag: '@smoke', annotation: testId('TC-00148') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await buildHtmlSection(
          page.request,
          config,
          contentCourse.courseKey,
          'publish-sub',
        );
        const unitKey = firstUnitKey(section);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.publish(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
        );

        expect((await fetchXBlockOutline(page.request, config, unitKey)).published).toBe(true);
        await expect
          .poll(async () => (await roundTripLearner.outline()).units.map((u) => u.id), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toContain(unitKey);
      },
    );

    test(
      'publishes a section from its card menu and the learner can reach its unit',
      { tag: '@smoke', annotation: testId('TC-00149') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await buildHtmlSection(
          page.request,
          config,
          contentCourse.courseKey,
          'publish-sec',
        );
        const unitKey = firstUnitKey(section);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.publish(studioCourseOutlinePage.section(unitKey), 'section');

        expect((await fetchXBlockOutline(page.request, config, unitKey)).published).toBe(true);
        await expect
          .poll(async () => (await roundTripLearner.outline()).units.map((u) => u.id), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toContain(unitKey);
      },
    );

    test(
      'View live opens the published unit in the LMS',
      { annotation: testId('TC-00171') },
      async ({ page, config, studioCourseOutlinePage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        // A course of this test's own, so its one unit is where View live lands.
        const { courseKey } = authoringCourse;
        const section = await buildHtmlSection(page.request, config, courseKey, 'publish-live');
        const unit = section.units[0]!;

        await studioCourseOutlinePage.goto(courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.publish(studioCourseOutlinePage.unit(unit.usageKey), 'unit');

        // The learner's courseware can be built only once the CMS worker has
        // written the course outline (`PLAT-009`: until then it errors).
        await expect
          .poll(
            async () =>
              (await fetchCourseNavigation(page.request, config, courseKey)) !== undefined,
            {
              timeout: TIMEOUTS.contentPublish,
            },
          )
          .toBe(true);

        // The outline header's "View live" opens the learner's courseware on the
        // course's first unit — the one just published — and renders it.
        const liveTab = await studioCourseOutlinePage.viewLive();
        const live = new UnitPage(liveTab, config);
        await expect(liveTab).toHaveURL(
          live.url(courseKey, unit.sequentialUsageKey, unit.usageKey),
        );
        await expect(live.block(unit.blocks[0]!.usageKey)).toBeVisible();
        await liveTab.close();
      },
    );
  },
);
