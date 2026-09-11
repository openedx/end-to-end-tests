import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchXBlockOutline, type AuthoredSection } from '../../../src/api';
import { testId } from '../../../src/reporting';

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
    test(
      'publishes a unit from its card menu and the learner can reach it',
      { annotation: testId('TC-00147') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await draftSection(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'unit',
        );
        const unitKey = onlyUnit(section).usageKey;
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
      { annotation: testId('TC-00148') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await draftSection(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'sub',
        );
        const unitKey = onlyUnit(section).usageKey;

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
      { annotation: testId('TC-00149') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await draftSection(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'sec',
        );
        const unitKey = onlyUnit(section).usageKey;

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
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const section = await draftSection(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'live',
        );
        const unitKey = onlyUnit(section).usageKey;

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.publish(studioCourseOutlinePage.unit(unitKey), 'unit');

        // The outline header's "View live" opens the learning MFE; the landing
        // URL's path is the learner courseware for this course (the host is
        // deployment-specific and not asserted).
        const liveTab = await studioCourseOutlinePage.viewLive();
        expect(new URL(liveTab.url()).pathname).toContain(`/course/${contentCourse.courseKey}`);
        await liveTab.close();
      },
    );
  },
);

function draftSection(
  request: Parameters<typeof buildSection>[0],
  config: Parameters<typeof buildSection>[1],
  courseKey: string,
  info: { testId: string },
  tag: string,
) {
  return buildSection(request, config, courseKey, `E2E publish-${tag} ${info.testId.slice(-6)}`, {
    subsections: [{ units: [{ blocks: ['html'] }] }],
  });
}

/** The single unit the draft section shape holds. */
function onlyUnit(section: AuthoredSection): AuthoredSection['units'][number] {
  const [unit] = section.units;
  if (unit === undefined) throw new Error('The draft section has no unit.');
  return unit;
}
