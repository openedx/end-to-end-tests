import { expect, test } from '../../src/fixtures';
import {
  COURSE_COMPARISON_CHARTS as C,
  COURSE_COMPARISON_FILTERS,
  COURSE_COMPARISON_TABS,
  COURSE_DASHBOARD_SLUG,
  TIMEOUTS,
} from '../../src/config';
import {
  authorVideo,
  courseKeyFor,
  enrollInCourseViaApi,
  grantCourseTeamRole,
  makeGlobalStaff,
  rerunCourse,
  setObjectTags,
  waitForRerun,
  fetchCourseOutline,
  fetchCourseProgress,
  publishXBlock,
  updateGradingPolicy,
} from '../../src/api';
import { ProblemBlock } from '../../src/pages/lms/courseware/problem.block';
import { VideoBlock } from '../../src/pages/lms/courseware/video.block';
import { TAG, findChart, waitForAnalytics } from '../../src/steps';
import { knownGap, testId } from '../../src/reporting';
import { cellText, choiceIndex, comparisonFor, rowFor, sumFor, supersetFor } from './helpers';

/**
 * Aspects' Course Comparison dashboard (TC-00553–00559), in Superset, read the
 * way course staff reach it: signed in through the LMS, on their own Superset
 * session. Every reading replays the query a chart itself sent, with the cache
 * bypassed, and is taken for both the Course Metrics and the Run Metrics tab.
 *
 * The viewer is an account of the test's own, staff on the test's course and
 * given the role before it first signs in, so row-level security shows it that
 * course alone and the charts hold only what the test did.
 */

const TAGS = ['@regression', '@studio', '@author', '@analytics', '@instructor-dashboard'];

/** Every enrollee count equals `enrollees`, and every chart's active count agrees. */
function consistent(
  r: { readonly enrollees: readonly unknown[]; readonly active: readonly unknown[] },
  enrollees: number,
): boolean {
  return r.enrollees.every((n) => n === enrollees) && r.active.every((n) => n === r.active[0]);
}

/** Both video counts equal the course's published videos. */
function countsMatch(r: {
  readonly published: number;
  readonly course: unknown;
  readonly run: unknown;
}) {
  return r.course === r.published && r.run === r.published;
}

/** The link in a Course Info row's "More details" cell (HTML), with its rison filter state. */
function moreDetailsLink(row: Readonly<Record<string, unknown>> | undefined): URL | undefined {
  const href = /href="([^"]+)"/.exec(cellText(row?.['More details']))?.[1];
  return href === undefined ? undefined : new URL(href);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

test.describe('Aspects Course Comparison', { tag: [...TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.analyticsTest });

  test(
    'a new enrollment raises the enrollee counts alike in every chart',
    { annotation: testId('TC-00553') },
    async ({ config, analyticsCourse, supersetColleague, authoringCourseLearnerLater }) => {
      const { courseKey, displayName, run } = analyticsCourse;
      const staff = await supersetColleague({ courseKey, role: 'staff' });
      const cc = await comparisonFor(staff.request, staff.page, config, courseKey, [displayName]);
      const courseCharts = await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics);
      const runCharts = await cc.chartsOn(COURSE_COMPARISON_TABS.runMetrics);
      const info = findChart(courseCharts, C.courseInfo);
      const counts = findChart(courseCharts, C.courseEnrollmentCounts);
      const breakdown = findChart(courseCharts, C.coursePerformanceBreakdown);
      const runInfo = findChart(runCharts, C.runInfo);
      const runCounts = findChart(runCharts, C.runEnrollmentCounts);
      const runBreakdown = findChart(runCharts, C.runPerformanceBreakdown);

      // Every chart, both tabs, in one reading: consistency is one equality.
      const read = async () => {
        const [i, c, b, ri, rc, rb] = await Promise.all(
          [info, counts, breakdown, runInfo, runCounts, runBreakdown].map((chart) =>
            cc.read(chart),
          ),
        );
        return {
          enrollees: [
            rowFor(i!, displayName)?.enrollees,
            sumFor(c!, displayName, 'enrollees'),
            rowFor(b!, displayName)?.count,
            rowFor(ri!, run)?.enrollees,
            sumFor(rc!, run, 'enrollees'),
            rowFor(rb!, run)?.count,
          ],
          active: [
            rowFor(i!, displayName)?.active_count,
            rowFor(b!, displayName)?.active,
            rowFor(ri!, run)?.active_count,
            rowFor(rb!, run)?.active,
          ],
        };
      };
      // Before: the author (re-enrolled from the LMS when the course is built)
      // and the staff viewer, whom the course-team grant enrolled.
      const before = await waitForAnalytics(read, (r) => consistent(r, 2));
      expect(consistent(before.last, 2), `readings: ${JSON.stringify(before.readings)}`).toBe(true);

      // The learner enrolls and goes into the course, as a learner enrolling
      // from the LMS does: Aspects counts a learner active from a course visit,
      // not from the enrollment itself.
      const learner = await authoringCourseLearnerLater();
      await learner.prime(analyticsCourse.gradedSubsectionKey);
      await learner.unitPage.goto(
        courseKey,
        analyticsCourse.gradedSubsectionKey,
        analyticsCourse.problemUnitKey,
      );
      await learner.unitPage.nextUnit();

      const activeBefore = Number(before.last.active[0] ?? 0);
      const after = await waitForAnalytics(
        read,
        (r) => consistent(r, 3) && Number(r.active[0] ?? 0) === activeBefore + 1,
      );
      expect(after.last, `readings: ${JSON.stringify(after.readings)}`).toEqual({
        enrollees: [3, 3, 3, 3, 3, 3],
        active: Array(4).fill(activeBefore + 1),
      });
    },
  );

  test(
    "the course's video count follows its published videos",
    // ASPECTS-011: on Superset 6.0.0 the video-count charts fail under row-level security.
    { tag: '@analytics-staff-video-counts', annotation: testId('TC-00554') },
    async ({ page, config, analyticsCourse, supersetColleague }) => {
      const { courseKey, displayName, run } = analyticsCourse;
      const staff = await supersetColleague({ courseKey, role: 'staff' });
      const cc = await comparisonFor(staff.request, staff.page, config, courseKey, [displayName]);
      const video = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics),
        C.courseVideoEngagement,
      );
      const runVideo = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.runMetrics),
        C.runVideoEngagement,
      );

      // The chart's counts and the course's published videos, read together.
      const read = async () => {
        const outline = await fetchCourseOutline(page.request, config, courseKey, '', {
          allBlocks: true,
        });
        const published = Object.values(outline.blocks).filter((b) => b.type === 'video').length;
        return {
          published,
          course: rowFor(await cc.read(video), displayName)?.video_count,
          run: rowFor(await cc.read(runVideo), run)?.['Number of Videos'],
        };
      };
      const before = await waitForAnalytics(read, (r) => countsMatch(r) && r.published === 1);
      expect(before.last, `readings: ${JSON.stringify(before.readings)}`).toEqual({
        published: 1,
        course: 1,
        run: 1,
      });

      await authorVideo(
        page.request,
        config,
        analyticsCourse.videoUnitKey,
        `${displayName} second video`,
      );
      await publishXBlock(page.request, config, analyticsCourse.videoUnitKey);

      const after = await waitForAnalytics(read, (r) => countsMatch(r) && r.published === 2);
      expect(after.last, `readings: ${JSON.stringify(after.readings)}`).toEqual({
        published: 2,
        course: 2,
        run: 2,
      });
    },
  );

  // ASPECTS-006: watched and rewatched percentages come from the video segment
  // mart, which counts a watch only when its start and end land in one insert.
  test.fixme(
    "a learner's watching raises the watched and rewatched percentages",
    {
      annotation: [
        testId('TC-00554'),
        knownGap(
          'ASPECTS-006: video segments form only when a watch starts and ends in one Vector insert',
        ),
      ],
    },
    async ({
      config,
      analyticsCourse,
      supersetColleague,
      authoringCourseLearner,
      stubVideoSources,
    }) => {
      const { courseKey, displayName } = analyticsCourse;
      const staff = await supersetColleague({ courseKey, role: 'staff' });
      const cc = await comparisonFor(staff.request, staff.page, config, courseKey, [displayName]);
      const video = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics),
        C.courseVideoEngagement,
      );

      // The learner watches the course's video twice (the sheet's "watch one video twice").
      const learner = authoringCourseLearner;
      const outline = await fetchCourseOutline(
        learner.request,
        config,
        courseKey,
        learner.identity.username,
      );
      const unit = outline.units.find((u) => u.id === analyticsCourse.videoUnitKey);
      await stubVideoSources([unit!], learner.page);
      await learner.prime(analyticsCourse.gradedSubsectionKey);
      for (let watch = 0; watch < 2; watch++) {
        await learner.unitPage.goto(
          courseKey,
          analyticsCourse.gradedSubsectionKey,
          analyticsCourse.videoUnitKey,
        );
        const player = new VideoBlock(
          learner.page,
          learner.unitPage.contentFrame,
          analyticsCourse.videoKey,
        );
        expect(await player.watchToEnd(), `watch ${watch + 1} played to its end`).toBe(true);
      }

      const watched = await waitForAnalytics(
        async () => {
          const row = rowFor(await cc.read(video), displayName);
          return {
            watched: Number(row?.watched_percent ?? 0),
            rewatched: Number(row?.rewatched_percent ?? 0),
          };
        },
        (r) => r.watched > 0 && r.rewatched > 0,
      );
      expect(watched.last.watched, `readings: ${JSON.stringify(watched.readings)}`).toBeGreaterThan(
        0,
      );
      expect(watched.last.rewatched).toBeGreaterThan(0);
    },
  );

  test(
    'a graded attempt updates the learner performance figures',
    { annotation: testId('TC-00555') },
    async ({ page, config, analyticsCourse, supersetColleague, authoringCourseLearner }) => {
      const { courseKey, displayName, run } = analyticsCourse;
      // One assignment type worth the whole grade, so answering one of the
      // subsection's two problems is a passing 50 %.
      await updateGradingPolicy(page.request, config, courseKey, {
        graders: [
          { type: 'Homework', min_count: 1, drop_count: 0, short_label: 'HW', weight: 100 },
        ],
        grade_cutoffs: { Pass: 0.5 },
        grace_period: null,
        minimum_grade_credit: 0.8,
      });
      const staff = await supersetColleague({ courseKey, role: 'staff' });
      const cc = await comparisonFor(staff.request, staff.page, config, courseKey, [displayName]);
      const perf = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics),
        C.coursePerformance,
      );
      const runPerf = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.runMetrics),
        C.runPerformance,
      );

      const figures = (row: Readonly<Record<string, unknown>> | undefined) => ({
        firstTryCorrect: row?.first_try_correct ?? null,
        passing: row?.count_passing ?? 0,
        average: row?.avg_course_grade ?? 0,
        median: row?.med_course_grade ?? 0,
      });
      const read = async () => ({
        course: figures(rowFor(await cc.read(perf), displayName)),
        run: figures(rowFor(await cc.read(runPerf), run)),
      });
      const before = await read();

      const learner = authoringCourseLearner;
      await learner.prime(analyticsCourse.gradedSubsectionKey);
      await learner.unitPage.goto(
        courseKey,
        analyticsCourse.gradedSubsectionKey,
        analyticsCourse.problemUnitKey,
      );
      const problem = new ProblemBlock(
        learner.page,
        learner.unitPage.contentFrame,
        analyticsCourse.problem.usageKey,
      );
      await problem.selectChoice(choiceIndex(analyticsCourse.problem.correct));
      await problem.submit();

      const after = await waitForAnalytics(
        async () => ({
          ...(await read()),
          grade: (await fetchCourseProgress(learner.request, config, courseKey)).courseGrade,
        }),
        (r) => Number(r.course.passing) === 1 && same(r.course, r.run),
      );
      expect(
        after.last,
        `before: ${JSON.stringify(before)}; readings: ${JSON.stringify(after.readings)}`,
      ).toMatchObject({
        course: { passing: 1 },
        grade: { isPassing: true },
      });
      expect(after.last.run, 'the run shows what the course shows').toEqual(after.last.course);
      expect(after.last.course).not.toEqual(before.course);
    },
  );

  test(
    'the course filter narrows both tabs to the chosen course',
    { annotation: testId('TC-00558') },
    async ({
      config,
      analyticsCourse,
      contentCourse,
      supersetColleague,
      adminLms,
      authoringCourseLearner,
    }) => {
      // Course Comparison lists a course once it has enrollees.
      void authoringCourseLearner;
      // Global staff see every course, so the filter has more than one to narrow;
      // a throwaway, because Superset fixes what a user sees at its first sign-in.
      const viewer = await supersetColleague();
      await adminLms((session) => makeGlobalStaff(session, config, viewer.identity.username));
      const cc = await comparisonFor(
        viewer.request,
        viewer.page,
        config,
        analyticsCourse.courseKey,
        [analyticsCourse.displayName, contentCourse.displayName],
      );
      // Before the filter the viewer sees more than one course (Course Info is
      // row-limited on a large install, so its first page is not a full list).
      const infoBefore = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics),
        C.courseInfo,
      );
      expect(
        new Set((await cc.read(infoBefore)).map((row) => row.course_name)).size,
      ).toBeGreaterThan(1);

      const marker = await cc.filter(COURSE_COMPARISON_FILTERS.courseName, [
        analyticsCourse.displayName,
      ]);
      const courseInfo = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics, marker),
        C.courseInfo,
      );
      const runInfo = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.runMetrics, marker),
        C.runInfo,
      );
      expect(new Set((await cc.read(courseInfo)).map((row) => row.course_name))).toEqual(
        new Set([analyticsCourse.displayName]),
      );
      expect(new Set((await cc.read(runInfo)).map((row) => row.course_name))).toEqual(
        new Set([analyticsCourse.displayName]),
      );
    },
  );

  test(
    'a course-level tag shows for the course and filters to it',
    { tag: '@taxonomies', annotation: testId('TC-00556') },
    async ({
      page,
      config,
      analyticsCourse,
      contentCourse,
      supersetColleague,
      workerTaxonomy,
      resyncStudioAuthor,
    }) => {
      const { courseKey, displayName } = analyticsCourse;
      const tag = TAG.parentOne;
      // The author's Studio writes come first, before another account is provisioned.
      await setObjectTags(page.request, config, courseKey, workerTaxonomy.taxonomy.id, [tag]);
      // ASPECTS-007 workaround: the tag reaches Aspects' course names reliably
      // only on the course's next publish (the tagging dump ties with the last
      // one). The case without it is the fixme below. The tagging write can leave
      // the author's Studio session rotated, so re-sync it through the browser
      // before the course write, as the library round trips do.
      await resyncStudioAuthor();
      await publishXBlock(page.request, config, analyticsCourse.section.usageKey);
      const staff = await supersetColleague({ courseKey, role: 'staff' });
      // A second course of the viewer's, untagged, for the filter to leave out.
      await grantCourseTeamRole(
        page.request,
        config,
        contentCourse.courseKey,
        [staff.identity.username],
        'staff',
      );

      const cc = await comparisonFor(staff.request, staff.page, config, courseKey, [
        displayName,
        contentCourse.displayName,
      ]);
      const info = findChart(await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics), C.courseInfo);
      const runInfo = findChart(await cc.chartsOn(COURSE_COMPARISON_TABS.runMetrics), C.runInfo);
      const tagsOf = async () => ({
        course: cellText(rowFor(await cc.read(info), displayName)?.tag_list),
        run: cellText(rowFor(await cc.read(runInfo), displayName)?.tag_list),
      });
      const shown = await waitForAnalytics(
        tagsOf,
        (t) => t.course.includes(tag) && t.run.includes(tag),
      );
      expect(shown.last, `readings: ${JSON.stringify(shown.readings)}`).toEqual({
        course: expect.stringContaining(tag),
        run: expect.stringContaining(tag),
      });

      const marker = await cc.filter(COURSE_COMPARISON_FILTERS.tag, [tag]);
      const filtered = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics, marker),
        C.courseInfo,
      );
      const filteredRuns = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.runMetrics, marker),
        C.runInfo,
      );
      expect(new Set((await cc.read(filtered)).map((row) => row.course_name))).toEqual(
        new Set([displayName]),
      );
      expect(new Set((await cc.read(filteredRuns)).map((row) => row.course_name))).toEqual(
        new Set([displayName]),
      );
    },
  );

  // ASPECTS-007: tagging dumps the course overview again with the tag but the
  // same `modified` as the previous dump, and Aspects' course names keep either
  // of the two tied rows; so the tag shows without a republish only sometimes.
  test.fixme(
    'a course-level tag shows without republishing the course',
    {
      tag: '@taxonomies',
      annotation: [
        testId('TC-00556'),
        knownGap('ASPECTS-007: a course tag reaches Course Comparison only on the next publish'),
      ],
    },
    async ({ page, config, analyticsCourse, supersetColleague, workerTaxonomy }) => {
      const { courseKey, displayName } = analyticsCourse;
      const tag = TAG.parentOne;
      const staff = await supersetColleague({ courseKey, role: 'staff' });
      await setObjectTags(page.request, config, courseKey, workerTaxonomy.taxonomy.id, [tag]);

      const cc = await comparisonFor(staff.request, staff.page, config, courseKey, [displayName]);
      const info = findChart(await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics), C.courseInfo);
      const shown = await waitForAnalytics(
        async () => cellText(rowFor(await cc.read(info), displayName)?.tag_list),
        (tags) => tags.includes(tag),
      );
      expect(shown.last, `readings: ${JSON.stringify(shown.readings)}`).toContain(tag);
    },
  );

  test(
    'a rerun is one course with two runs, and the run filter picks one',
    { annotation: testId('TC-00557') },
    async ({ page, config, analyticsCourse, supersetColleague, newLearner }) => {
      const { courseKey, displayName, org, number, run } = analyticsCourse;
      // The sheet makes the run by export and import; a rerun gives the same
      // grouping: same org and number, same name, a new run.
      const rerunRun = `${run}r`;
      const rerunKey = await rerunCourse(page.request, config, courseKey, {
        org,
        number,
        run: rerunRun,
        displayName,
        courseKey: courseKeyFor(org, number, rerunRun),
      });
      await waitForRerun(page.request, config, rerunKey);
      const staff = await supersetColleague({ courseKey, role: 'staff' });
      await grantCourseTeamRole(page.request, config, rerunKey, [staff.identity.username], 'staff');
      const learner = await newLearner();
      await enrollInCourseViaApi(learner.request, config, rerunKey);

      const cc = await comparisonFor(staff.request, staff.page, config, courseKey, [displayName]);
      const info = findChart(await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics), C.courseInfo);
      const runInfo = findChart(await cc.chartsOn(COURSE_COMPARISON_TABS.runMetrics), C.runInfo);
      const read = async () => ({
        courseRows: (await cc.read(info)).filter((row) => row.course_name === displayName).length,
        runs: [...new Set((await cc.read(runInfo)).map((row) => row.course_run))].sort(),
      });
      const both = [run, rerunRun].sort();
      const shown = await waitForAnalytics(
        read,
        (r) => JSON.stringify(r.runs) === JSON.stringify(both),
      );
      expect(shown.last, `readings: ${JSON.stringify(shown.readings)}`).toEqual({
        courseRows: 1,
        runs: both,
      });

      const marker = await cc.filter(COURSE_COMPARISON_FILTERS.courseRun, [rerunRun]);
      const filtered = findChart(
        await cc.chartsOn(COURSE_COMPARISON_TABS.runMetrics, marker),
        C.runInfo,
      );
      expect([...new Set((await cc.read(filtered)).map((row) => row.course_run))]).toEqual([
        rerunRun,
      ]);
    },
  );

  test(
    "More details leads to the course's Course Dashboard, filtered to it",
    { annotation: testId('TC-00559') },
    async ({ config, analyticsCourse, supersetColleague }) => {
      const { courseKey, displayName, run } = analyticsCourse;
      const staff = await supersetColleague({ courseKey, role: 'staff' });
      const { localeSuffix } = await supersetFor(staff.request, config, courseKey);
      const courseDashboard = `/superset/dashboard/${COURSE_DASHBOARD_SLUG}${localeSuffix}/`;
      const cc = await comparisonFor(staff.request, staff.page, config, courseKey, [displayName]);
      const info = findChart(await cc.chartsOn(COURSE_COMPARISON_TABS.courseMetrics), C.courseInfo);
      const runInfo = findChart(await cc.chartsOn(COURSE_COMPARISON_TABS.runMetrics), C.runInfo);

      // The course filter can list the course before the info tables have its
      // row, so read them until both rows carry their link.
      const links = await waitForAnalytics(
        async () => ({
          course: moreDetailsLink(rowFor(await cc.read(info), displayName)),
          run: moreDetailsLink(rowFor(await cc.read(runInfo), displayName)),
        }),
        (r) => r.course !== undefined && r.run !== undefined,
      );
      const { course: courseLink, run: runLink } = links.last;
      expect(courseLink?.pathname, `readings: ${JSON.stringify(links.readings)}`).toBe(
        courseDashboard,
      );
      expect(courseLink?.searchParams.get('native_filters')).toContain(`'${displayName}'`);
      expect(runLink?.pathname).toBe(courseDashboard);
      const runFilters = runLink?.searchParams.get('native_filters') ?? '';
      expect(runFilters).toContain(`'${displayName}'`);
      expect(runFilters).toContain(`col:course_run,op:IN,val:!('${run}')`);

      // Following it lands on the Course Dashboard.
      await staff.page.goto(courseLink!.toString());
      await expect.poll(() => new URL(staff.page.url()).pathname).toBe(courseDashboard);
    },
  );
});
