import { checkA11y } from '../../../src/a11y';
import { hasHtml5Source } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { completeUnit } from '../../../src/steps';

/**
 * Unit completion, one unit per completion mechanism.
 *
 * The test case names three: a unit with no problem or video (completes on
 * viewing), a unit with a problem (completes on submission), and a unit with a
 * video (completes on watching). The video is driven through the platform's own
 * HTML5 player, so it needs a video with an HTML5 source — a YouTube-only video
 * plays in a cross-origin iframe the suite cannot script, and the `videoUnit`
 * fixture skips that test on a course without one.
 *
 * Assertions come from the progress and blocks APIs — numeric, non-localized, and
 * the platform's own record of completion. How the outline tray *renders* a
 * completed unit is the sidebar's concern and lives in
 * `tests/lms/courseware/sidebar.spec.ts`, gated on
 * `@courseware-navigation-sidebar`, so this default coverage runs unchanged on an
 * installation with the legacy in-course navigation.
 *
 * Runtime is dominated by the platform's per-block dwell delay (5s on a default
 * install) rather than by anything the suite does, so the whole-test budget is
 * `TIMEOUTS.contentTest`. The full 58-unit crawl lives in its own `@regression`
 * spec for the same reason.
 */

test.describe('Unit completion', () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'completes a unit by viewing its content',
    {
      tag: ['@smoke', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00022'),
    },
    async ({ page, unitPage, completionUnits, courseProgress, enrolledCourse }) => {
      const unit = completionUnits.viewOnly;

      const before = await courseProgress();
      expect(before.completionSummary.completeCount).toBe(0);

      const unfinished = await completeUnit(page, unitPage, enrolledCourse.courseKey, unit);

      expect(unfinished, 'every block in the unit registered completion').toEqual([]);

      // The platform's own record: one more unit complete than before.
      const after = await courseProgress();
      expect(after.completionSummary.completeCount).toBe(
        before.completionSummary.completeCount + 1,
      );
      expect(after.completionSummary.incompleteCount).toBe(
        before.completionSummary.incompleteCount - 1,
      );

      await unitPage.goto(enrolledCourse.courseKey, unit.sequentialId, unit.id);
      await checkA11y(page, { label: 'courseware' });
    },
  );

  test(
    'completes a unit containing a problem by answering it',
    {
      tag: ['@smoke', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00022'),
    },
    async ({
      page,
      unitPage,
      completionUnits,
      refreshCourseOutline,
      courseProgress,
      enrolledCourse,
    }) => {
      const unit = completionUnits.withProblem;

      const problemId = unit.childIds[unit.childTypes.indexOf('problem')];
      expect(problemId, 'the unit exposes a problem block ID').toBeDefined();

      const before = await courseProgress();
      const unfinished = await completeUnit(page, unitPage, enrolledCourse.courseKey, unit);

      expect(unfinished, 'every block in the unit registered completion').toEqual([]);

      const after = await courseProgress();
      expect(after.completionSummary.completeCount).toBe(
        before.completionSummary.completeCount + 1,
      );

      // A problem completes on submission, not on being right: the answer given
      // was the first choice, and the unit still completes.
      const { blocks } = await refreshCourseOutline();
      expect(blocks[problemId ?? '']?.completion).toBe(1);
    },
  );

  test(
    'completes a video in a unit by watching it',
    {
      tag: ['@smoke', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00022'),
    },
    async ({
      page,
      unitPage,
      videoUnit,
      stubVideoSources,
      refreshCourseOutline,
      enrolledCourse,
    }) => {
      const unit = videoUnit;
      const videoIds = unit.childIds.filter((id) => hasHtml5Source(unit, id));
      expect(videoIds.length, 'the unit exposes a drivable video block').toBeGreaterThan(0);

      const before = await refreshCourseOutline();
      for (const videoId of videoIds) {
        expect(before.blocks[videoId]?.completion).toBe(0);
      }

      // The clip is served locally: what is under test is the platform recording a
      // watched video, not a third-party bucket being reachable.
      await stubVideoSources([unit]);
      const unfinished = await completeUnit(page, unitPage, enrolledCourse.courseKey, unit);

      // The video must have completed, and so must every other block whose
      // completion the suite can drive. Unit-level completion itself is out of
      // reach wherever the course puts its HTML5 video beside a custom-JS problem
      // — as the demo course does — so problems with no controls to drive are the
      // one tolerated outcome. Asserting on everything else, rather than only on
      // `videoIds`, is what makes the unit the video sits in worth driving: this
      // unit's other blocks are exercised alongside a video, and a video-only
      // assertion would discard that for free.
      expect(
        unfinished.filter((block) => block.reason !== 'unsupported-problem'),
        'the video block, and every other drivable block in the unit, registered completion',
      ).toEqual([]);

      // The platform's own record for each video: `publish_completion` is answered
      // before the completion row is necessarily readable, so poll the reading.
      for (const videoId of videoIds) {
        await expect
          .poll(async () => (await refreshCourseOutline()).blocks[videoId]?.completion, {
            timeout: TIMEOUTS.expect,
          })
          .toBe(1);
      }
    },
  );
});
