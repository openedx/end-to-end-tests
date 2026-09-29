import { expect, test } from '../../src/fixtures';
import {
  INDIVIDUAL_LEARNER_CHARTS as C,
  INDIVIDUAL_LEARNER_FILTERS,
  INDIVIDUAL_LEARNER_SLUG,
  INDIVIDUAL_LEARNER_TABS,
  TIMEOUTS,
} from '../../src/config';
import { findChart, openReportsDashboard, waitForAnalytics } from '../../src/steps';
import { testId } from '../../src/reporting';

/**
 * The Individual Learner dashboard filters to one learner and back (TC-00544).
 *
 * Offered only where Aspects exposes learner PII (`analytics-pii`). Course
 * staff open it in the Reports tab, choose one of the course's two learners in
 * its Username filter (the test's own data), and the Learner Summary, one row
 * per learner, shows only that learner; clearing the filter brings the other
 * back. Every reading replays the chart's own query, with the cache bypassed.
 */

const TAGS = [
  '@regression',
  '@studio',
  '@author',
  '@analytics',
  '@analytics-pii',
  '@instructor-dashboard',
  '@mfe-instructor-dashboard',
];

/** The usernames the Learner Summary lists, sorted. */
function usernames(rows: readonly Readonly<Record<string, unknown>>[]): readonly string[] {
  return rows
    .map((row) => row.username)
    .filter((u): u is string => typeof u === 'string')
    .sort();
}

test.describe('Aspects Individual Learner dashboard', { tag: [...TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.analyticsTest });

  test(
    'staff filter the dashboard to one learner and clear it again',
    { annotation: testId('TC-00544') },
    async ({ config, analyticsCourse, reportsViewer, authoringCourseLearners }) => {
      const [first, second] = authoringCourseLearners;
      const { member, reportsPage } = await reportsViewer(analyticsCourse.courseKey);
      const dashboard = await openReportsDashboard(
        reportsPage,
        member.request,
        config,
        analyticsCourse,
        INDIVIDUAL_LEARNER_SLUG,
      );
      const summaryOf = async (since?: number) =>
        findChart(await dashboard.chartsOn(INDIVIDUAL_LEARNER_TABS.pages, since), C.learnerSummary);

      // Both learners are there before any filter (their enrollments reach Aspects first).
      const both = [first.identity.username, second.identity.username];
      const summary = await summaryOf();
      const unfiltered = await waitForAnalytics(
        async () => usernames(await dashboard.read(summary)),
        (listed) => both.every((u) => listed.includes(u)),
      );
      expect(unfiltered.last, `readings: ${JSON.stringify(unfiltered.readings)}`).toEqual(
        expect.arrayContaining(both),
      );

      const filtered = await summaryOf(
        await dashboard.filter(INDIVIDUAL_LEARNER_FILTERS.username, [first.identity.username]),
      );
      expect(usernames(await dashboard.read(filtered))).toEqual([first.identity.username]);

      const cleared = await summaryOf(
        await dashboard.clearFilter(INDIVIDUAL_LEARNER_FILTERS.username),
      );
      expect(usernames(await dashboard.read(cleared))).toEqual(expect.arrayContaining(both));
    },
  );
});
