import { expect, test } from '../../src/fixtures';
import { stubVideoSources } from '../../src/fixtures/video-sources';
import { COURSE_DASHBOARD_CHARTS as C, COURSE_DASHBOARD_TABS, TIMEOUTS } from '../../src/config';
import { enrollInCourseViaApi, fetchCourseOutline } from '../../src/api';
import { ProblemBlock } from '../../src/pages/lms/courseware/problem.block';
import { VideoBlock } from '../../src/pages/lms/courseware/video.block';
import { findChart, openCourseDashboard, waitForAnalytics } from '../../src/steps';
import { knownGap, testId } from '../../src/reporting';

/**
 * Aspects' Course Dashboard reflects what a learner does (TC-00545–00548).
 *
 * Each case takes a course of its own, has course staff open its Course
 * Dashboard in the Reports tab, lets one learner act (enroll, move through a
 * subsection, answer a problem, watch a video) and reads the charts the sheet
 * names until they show it. Every reading replays the query the chart itself
 * sent, with Superset's cache bypassed (the sheet's "Force Refresh"): numbers
 * from the platform's analytics store, never chart text or pixels.
 *
 * The course starts with no activity, so the only people Aspects has seen in
 * it are the test's own: the staff viewer (a course-team grant enrolls it) and
 * the learner.
 */

const TAGS = [
  '@regression',
  '@studio',
  '@author',
  '@analytics',
  '@instructor-dashboard',
  '@mfe-instructor-dashboard',
  '@mfe-learning',
];

/** A chart cell as text (the charts' name columns are strings). */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A row of a table whose `column` names the test's own section or subsection. */
function rowNamed(
  rows: readonly Readonly<Record<string, unknown>>[],
  column: string,
  name: string,
) {
  return rows.find((row) => text(row[column]).endsWith(name));
}

test.describe('Aspects Course Dashboard', { tag: [...TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.analyticsTest });

  test(
    'a new enrollment raises the enrollment charts by one',
    { annotation: testId('TC-00545') },
    async ({ config, analyticsCourse, reportsViewer, newLearner }) => {
      const { member, reportsPage } = await reportsViewer(analyticsCourse.courseKey);
      const dashboard = await openCourseDashboard(
        reportsPage,
        member.request,
        config,
        analyticsCourse,
      );
      const charts = await dashboard.chartsOn(COURSE_DASHBOARD_TABS.enrollment);
      const current = findChart(charts, C.currentEnrollees);
      const perTrack = findChart(charts, C.enrolleesPerTrack);
      const cumulative = findChart(charts, C.cumulativeEnrollments);

      const read = async () => ({
        currentEnrollees: (await dashboard.read(current))[0]?.number_of_learners,
        auditTrack: (await dashboard.read(perTrack)).find((r) => r.enrollment_mode === 'audit')
          ?.number_of_learners,
        cumulativeAudit: (await dashboard.read(cumulative)).at(-1)?.audit,
      });
      const enrolled = (n: number) => ({ currentEnrollees: n, auditTrack: n, cumulativeAudit: n });

      // Before: only the staff viewer, whom the course-team grant enrolled (audit).
      const before = await waitForAnalytics(
        read,
        (r) => JSON.stringify(r) === JSON.stringify(enrolled(1)),
      );
      expect(before.last, `readings: ${JSON.stringify(before.readings)}`).toEqual(enrolled(1));

      const learner = await newLearner();
      await enrollInCourseViaApi(learner.request, config, analyticsCourse.courseKey);

      const after = await waitForAnalytics(
        read,
        (r) => JSON.stringify(r) === JSON.stringify(enrolled(2)),
      );
      expect(after.last, `readings: ${JSON.stringify(after.readings)}`).toEqual(enrolled(2));
    },
  );

  test(
    'moving through a subsection shows in its page engagement',
    { annotation: testId('TC-00546') },
    async ({ config, analyticsCourse, reportsViewer, authoringCourseLearner }) => {
      const subsection = analyticsCourse.section.subsections[0]!.displayName;
      const { member, reportsPage } = await reportsViewer(analyticsCourse.courseKey);
      const dashboard = await openCourseDashboard(
        reportsPage,
        member.request,
        config,
        analyticsCourse,
      );
      const charts = await dashboard.chartsOn(COURSE_DASHBOARD_TABS.pages);
      const summary = findChart(charts, C.subsectionSummary);
      const engagement = findChart(charts, C.pageEngagement);

      const read = async () => {
        const row = rowNamed(await dashboard.read(summary), 'subsection_with_name', subsection);
        const bar = rowNamed(
          await dashboard.read(engagement),
          'section_subsection_name',
          subsection,
        );
        return {
          learners: row?.number_of_learners ?? 0,
          viewed: Number(row?.views ?? 0) > 0,
          atLeastOnePage: bar?.at_leat_one_page_viewed ?? 0,
        };
      };
      expect(await read()).toEqual({ learners: 0, viewed: false, atLeastOnePage: 0 });

      // The learner opens the subsection's first unit and moves on with "Next":
      // navigation is what Aspects counts as page engagement.
      const learner = authoringCourseLearner;
      await learner.prime(analyticsCourse.gradedSubsectionKey);
      await learner.unitPage.goto(
        analyticsCourse.courseKey,
        analyticsCourse.gradedSubsectionKey,
        analyticsCourse.problemUnitKey,
      );
      await learner.unitPage.nextUnit();

      const expected = { learners: 1, viewed: true, atLeastOnePage: 1 };
      const after = await waitForAnalytics(
        read,
        (r) => JSON.stringify(r) === JSON.stringify(expected),
      );
      expect(after.last, `readings: ${JSON.stringify(after.readings)}`).toEqual(expected);
    },
  );

  test(
    'answering a problem shows in its problem engagement',
    { annotation: testId('TC-00547') },
    async ({ config, analyticsCourse, reportsViewer, authoringCourseLearner }) => {
      const subsection = analyticsCourse.section.subsections[0]!.displayName;
      const { member, reportsPage } = await reportsViewer(analyticsCourse.courseKey);
      const dashboard = await openCourseDashboard(
        reportsPage,
        member.request,
        config,
        analyticsCourse,
      );
      const charts = await dashboard.chartsOn(COURSE_DASHBOARD_TABS.problems);
      const attempts = findChart(charts, C.problemAttempts);
      const engagement = findChart(charts, C.problemEngagement);

      const read = async () => {
        const row = (await dashboard.read(attempts)).find((r) =>
          text(r.display_name_with_location).includes(analyticsCourse.problemDisplayName),
        );
        const bar = rowNamed(
          await dashboard.read(engagement),
          'section_subsection_name',
          subsection,
        );
        return {
          learners: row?.number_of_learners ?? 0,
          correct: row?.correct_attempts ?? 0,
          incorrect: row?.incorrect_attempts ?? 0,
          attemptedAtLeastOne: bar?.attempted_at_least_one_problem ?? 0,
        };
      };
      expect(await read()).toEqual({
        learners: 0,
        correct: 0,
        incorrect: 0,
        attemptedAtLeastOne: 0,
      });

      const learner = authoringCourseLearner;
      await learner.prime(analyticsCourse.gradedSubsectionKey);
      await learner.unitPage.goto(
        analyticsCourse.courseKey,
        analyticsCourse.gradedSubsectionKey,
        analyticsCourse.problemUnitKey,
      );
      const problem = new ProblemBlock(
        learner.page,
        learner.unitPage.contentFrame,
        analyticsCourse.problem.usageKey,
      );
      await problem.selectChoice(1); // the template's correct choice
      await problem.submit();

      const expected = { learners: 1, correct: 1, incorrect: 0, attemptedAtLeastOne: 1 };
      const after = await waitForAnalytics(
        read,
        (r) => JSON.stringify(r) === JSON.stringify(expected),
      );
      expect(after.last, `readings: ${JSON.stringify(after.readings)}`).toEqual(expected);
    },
  );

  // ASPECTS-006: the video marts pair a "played" statement with the one that ends
  // it only when both arrive in the same ClickHouse insert, and Vector inserts
  // about once a second. Whether a watch shows is timing, not behaviour: a
  // `test.fail` would pass or fail at random, so the case is held back until the
  // marts pair across inserts.
  test.fixme(
    'watching a video shows in its video engagement',
    {
      annotation: [
        testId('TC-00548'),
        knownGap(
          'ASPECTS-006: video segments form only when a watch starts and ends in one Vector insert',
        ),
      ],
    },
    async ({ config, analyticsCourse, reportsViewer, authoringCourseLearner }) => {
      const subsection = analyticsCourse.section.subsections[0]!.displayName;
      const { member, reportsPage } = await reportsViewer(analyticsCourse.courseKey);
      const dashboard = await openCourseDashboard(
        reportsPage,
        member.request,
        config,
        analyticsCourse,
      );
      const charts = await dashboard.chartsOn(COURSE_DASHBOARD_TABS.videos);
      const perSection = findChart(charts, C.videoEngagementPerSection);
      const views = findChart(charts, C.partialAndFullViews);
      const segments = findChart(charts, C.viewsAcrossDuration);

      const read = async () => {
        const bar = rowNamed(
          await dashboard.read(perSection),
          'section_subsection_name',
          subsection,
        );
        const fullViews = (await dashboard.read(views)).reduce(
          (n, r) => n + Number(r.full_views ?? 0),
          0,
        );
        const watchedSegments = (await dashboard.read(segments)).filter(
          (r) => Number(r.total_views ?? 0) > 0,
        ).length;
        return {
          atLeastOneViewed: bar?.at_least_one_viewed ?? 0,
          fullViews,
          segmentsWatched: watchedSegments > 0,
        };
      };
      expect(await read()).toEqual({ atLeastOneViewed: 0, fullViews: 0, segmentsWatched: false });

      const learner = authoringCourseLearner;
      const outline = await fetchCourseOutline(
        learner.request,
        config,
        analyticsCourse.courseKey,
        learner.identity.username,
      );
      const unit = outline.units.find((u) => u.id === analyticsCourse.videoUnitKey);
      expect(
        unit?.videoSources[analyticsCourse.videoKey],
        'the video has its HTML5 source',
      ).toEqual([analyticsCourse.videoSource]);
      // The clip is the suite's own: a runner reaching a video host says nothing about Aspects.
      await stubVideoSources(learner.page, [unit!]);
      await learner.prime(analyticsCourse.gradedSubsectionKey);
      await learner.unitPage.goto(
        analyticsCourse.courseKey,
        analyticsCourse.gradedSubsectionKey,
        analyticsCourse.videoUnitKey,
      );
      const video = new VideoBlock(
        learner.page,
        learner.unitPage.contentFrame,
        analyticsCourse.videoKey,
      );
      expect(await video.watchToEnd(), 'the video played to its end').toBe(true);

      const expected = { atLeastOneViewed: 1, fullViews: 1, segmentsWatched: true };
      const after = await waitForAnalytics(
        read,
        (r) => JSON.stringify(r) === JSON.stringify(expected),
      );
      expect(after.last, `readings: ${JSON.stringify(after.readings)}`).toEqual(expected);
    },
  );
});
