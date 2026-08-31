import { checkA11y } from '../../../src/a11y';
import type { CourseProgress } from '../../../src/api';
import type { ProgressPage } from '../../../src/pages/lms/course-home/progress.page';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { completeUnit } from '../../../src/steps';

/**
 * The course Progress tab.
 *
 * The grade state is asserted from `/api/course_home/progress/{key}` — numeric,
 * non-localized, and the platform's own record — while the page is asserted only
 * to have *rendered* that state. This replaces the source suite's union of
 * theme-coupled grade selectors, which was both brittle and a weak claim.
 *
 * The passing threshold is read from the course's grading policy, never hard-coded
 * to 0.5: a course sets its own.
 */
/**
 * Asserts the grade the Progress page shows is the grade the API reports.
 *
 * Both readings are taken together and retried, because grade recomputation is
 * asynchronous: pinning the API value first and comparing a page rendered later
 * straddles any update in between and fails on a disagreement the platform never
 * actually had. (Observed once under a full parallel run.) Retrying converges on
 * the settled value, and a genuine mismatch still fails once the budget is spent.
 */
async function expectDisplayedTotalToMatchApi(
  progressPage: ProgressPage,
  courseProgress: () => Promise<CourseProgress>,
): Promise<void> {
  let displayed: number | undefined;
  let reported: number | undefined;

  await expect
    .poll(
      async () => {
        displayed = await progressPage.displayedTotalPercent();
        reported = Math.round((await courseProgress()).courseGrade.percent * 100);
        return displayed === reported;
      },
      {
        message: 'the grade shown on the Progress page settles on the grade the API reports',
        timeout: TIMEOUTS.expect,
      },
    )
    .toBe(true);

  // Restated as an equality so a failure names both numbers rather than "false".
  expect(displayed, 'grade shown on the Progress page').toBe(reported);
}

test.describe('Course progress', () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'renders the grade summary and the platform’s completion state',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00031'),
    },
    async ({ page, progressPage, courseProgress, enrolledCourse }) => {
      await progressPage.goto(enrolledCourse.courseKey);

      const progress = await courseProgress();

      // The page rendered the grade summary and both grade tables.
      await expect(progressPage.totalGrade).toBeVisible();
      await expect(progressPage.tableFooter).toBeVisible();
      expect(await progressPage.tables.count()).toBeGreaterThan(0);
      // Per-assignment-type rows exist, one per policy the course declares.
      expect(await progressPage.rows(0).count()).toBeGreaterThan(0);

      // The displayed total agrees with the API, as a number rather than as copy.
      await expectDisplayedTotalToMatchApi(progressPage, courseProgress);

      // The course, not the suite, decides what passing means.
      expect(progress.passingThreshold, 'the grading policy declares a pass mark').toBeDefined();
      expect(progress.passingThreshold).toBeGreaterThan(0);
      expect(progress.courseGrade.isPassing).toBe(
        progress.courseGrade.percent >= (progress.passingThreshold ?? 1),
      );

      await checkA11y(page, { label: 'progress' });
    },
  );

  test(
    'records a grade once a graded problem is answered',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00031'),
    },
    async ({ page, unitPage, progressPage, completionUnits, courseProgress, enrolledCourse }) => {
      const before = await courseProgress();

      await completeUnit(page, unitPage, enrolledCourse.courseKey, completionUnits.withProblem);

      // Submitting a problem moves the platform's own record of what was attempted,
      // whether or not the answer was right.
      const after = await courseProgress();
      expect(after.completionSummary.completeCount).toBeGreaterThan(
        before.completionSummary.completeCount,
      );

      // …and the Progress tab renders that same state.
      await progressPage.goto(enrolledCourse.courseKey);
      await expect(progressPage.totalGrade).toBeVisible();
      await expectDisplayedTotalToMatchApi(progressPage, courseProgress);
    },
  );

  test(
    'reaches a passing grade',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00031'),
    },
    async ({ courseProgress }) => {
      // A passing grade needs *correct* answers, and this course puts them out of
      // reach. Three of its 29 problems set `showanswer: always`, so their answers
      // can be revealed (`ProblemBlock.revealAnswer()`) — but all three sit in the
      // Basic Assessment Tools subsection, weighted 0.30. Scoring it in full still
      // falls short of the 0.5 pass mark, and the subsections that would close the
      // gap have no discoverable answers: Intermediate inherits the course default
      // (`finished`, unreachable with unlimited attempts) and Advanced is ORA and
      // LTI content that cannot be driven at all. Hard-coding an answer key would
      // tie the suite to one course.
      test.fixme(
        true,
        'Discoverable answers cover only the 0.30-weighted subsection; the pass mark is 0.50.',
      );

      const progress = await courseProgress();
      expect(progress.courseGrade.isPassing).toBe(true);
      expect(progress.courseGrade.percent).toBeGreaterThanOrEqual(progress.passingThreshold ?? 1);
    },
  );

  test(
    'reports certificate status',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning', '@certificates'],
      annotation: testId('TC-00032'),
    },
    async ({ courseProgress }) => {
      const progress = await courseProgress();

      // An enum the platform defines (`audit_passing`, `downloadable`, …), not
      // rendered copy — so this reads the same in any language.
      expect(progress.certificateStatus, 'the progress API reports a certificate status').toEqual(
        expect.any(String),
      );
      // Before the course is passed there is nothing to download; the URL appears
      // with the certificate itself.
      expect(progress.certificateDownloadUrl ?? null).toBeNull();
    },
  );
});
