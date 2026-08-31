import { checkA11y } from '../../../src/a11y';
import { unitsContaining } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { completeUnit } from '../../../src/steps';

/**
 * Unit completion, one unit per completion mechanism.
 *
 * The test case names three: a unit with no problem or video (completes on
 * viewing), a unit with a problem (completes on submission), and a unit with a
 * video (completes on watching). The first two are covered here; the video
 * mechanism has no automatable path on this platform version and is covered by a
 * `fixme` below.
 *
 * Assertions come from the progress and blocks APIs — numeric, non-localized, and
 * the platform's own record of completion. The UI gets structural assertions only
 * where the rendering is the thing under test.
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
      tag: '@smoke @authenticated @mfe-learning',
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

      // The UI half of the case: the outline tray renders a completion marker for
      // the unit. Colour and icon shape are not testable semantics, so this
      // asserts the marker exists — the API above decides whether it is *right*.
      await unitPage.goto(enrolledCourse.courseKey, unit.sequentialId, unit.id);
      await expect(unitPage.sidebarUnitLink(unit.id)).toBeVisible();
      await expect(unitPage.completionIcons.first()).toBeVisible();

      await checkA11y(page, { label: 'courseware' });
    },
  );

  test(
    'completes a unit containing a problem by answering it',
    {
      tag: '@smoke @authenticated @mfe-learning',
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
    'completes a unit containing a video by watching it',
    {
      tag: '@smoke @authenticated @mfe-learning',
      annotation: testId('TC-00022'),
    },
    ({ courseOutline }) => {
      // The third mechanism the test case names has no automatable path here: the
      // demo course's videos are YouTube-hosted, so the player lives in a
      // cross-origin iframe, and the page exposes no player handle to seek with
      // (`window.VideoState[blockId]` is an empty object on this version). Watching
      // in real time is not a test, and depending on youtube.com would break any
      // installation without external network access.
      test.fixme(true, 'Video completion cannot be driven: no player handle, third-party host.');

      expect(unitsContaining(courseOutline, 'video').length).toBeGreaterThan(0);
    },
  );
});
