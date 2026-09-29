import { expect, test } from '../../../src/fixtures';
import { INSTRUCTOR_REPORTS_SELECTORS, INSTRUCTOR_TAB_IDS, TIMEOUTS } from '../../../src/config';
import { fetchInstructorCourse, supersetOrigin, type InstructorReports } from '../../../src/api';
import type { ReportsPage } from '../../../src/pages/lms/instructor/reports.page';
import { checkA11y } from '../../../src/a11y';
import { dashboardLocaleSuffix, openCourseComparison, signInToSuperset } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { SUPERSET_A11Y_BASELINE } from '../../aspects/helpers';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS } from './helpers';

/**
 * Aspects' Reports tab in the instructor dashboard (TC-00542, TC-00543): the
 * tab is offered, and each dashboard the platform configures for the course
 * embeds. The platform's own answer (`superset_instructor_dashboard`) is the
 * expected dashboard set, not the sheet's list of three: the Individual Learner
 * dashboard exists only where Aspects exposes PII.
 *
 * A dashboard "renders" when its tab embeds it and the embed, with a guest token
 * the LMS minted, gets its first chart data from Superset. What the charts show
 * is Superset's rendering, localized, and the pipeline specs read their numbers.
 *
 * The viewers read with their own LMS session: course staff (the cast's `staff`
 * member) and the superuser (the admin). Aspects' views accept nothing else.
 */

const REPORTS_TAGS = [...INSTRUCTOR_TAGS, '@analytics'];

/** Every configured dashboard has a tab, and each tab's embed loads with a guest token. */
async function expectEveryDashboardEmbeds(reportsPage: ReportsPage, reports: InstructorReports) {
  expect(reports.dashboards.length, 'Aspects configures at least one dashboard').toBeGreaterThan(0);
  expect(await reportsPage.dashboardTabUuids()).toEqual(reports.dashboards.map((d) => d.uuid));
  for (const dashboard of reports.dashboards) {
    const load = await reportsPage.openDashboard(dashboard.uuid);
    expect(load.guestTokenStatuses, `${dashboard.slug}: the guest token was minted`).toContain(200);
    expect(load.guestTokenStatuses.filter((status) => status !== 200)).toEqual([]);
    expect(load.firstChartData.status(), `${dashboard.slug}: Superset served its data`).toBe(200);
    expect(load.usedGuestToken, `${dashboard.slug}: the embed used the guest token`).toBe(true);
  }
}

test.describe('Aspects Reports tab', { tag: ['@regression', ...REPORTS_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'course staff open the Reports tab and every configured dashboard embeds',
    { tag: '@smoke', annotation: testId('TC-00542') },
    async ({ config, authoringCourse, reportsViewer }) => {
      const { courseKey } = authoringCourse;
      const { member, reportsPage } = await reportsViewer(courseKey);

      const reports = await reportsPage.openReports(courseKey);

      // Offered: the dashboard model lists the tab and the nav links it, read together.
      await expect
        .poll(async () => ({
          inModel: (await fetchInstructorCourse(member.request, config, courseKey)).tabs.some(
            (tab) => tab.tab_id === INSTRUCTOR_TAB_IDS.aspects,
          ),
          inNav: (await reportsPage.tabLink(courseKey, INSTRUCTOR_TAB_IDS.aspects).count()) > 0,
        }))
        .toEqual({ inModel: true, inNav: true });

      // The Superset the platform advertises is reachable with the one sign-in,
      // and the tab links to it where the deployment shows the link.
      expect(() => supersetOrigin(config, reports)).not.toThrow();
      await expect(reportsPage.supersetLink).toHaveCount(reports.showDashboardLink ? 1 : 0);
      expect(await reportsPage.supersetLinkHref()).toBe(
        reports.showDashboardLink ? reports.supersetUrl : undefined,
      );

      await expectEveryDashboardEmbeds(reportsPage, reports);

      // Superset's own markup is scanned on its own page; this is the tab around it.
      await checkA11y(member.page, {
        label: 'instructor-reports',
        exclude: INSTRUCTOR_REPORTS_SELECTORS.embedContainer,
        additionalBaseline: INSTRUCTOR_A11Y_BASELINE,
      });
    },
  );

  test(
    'the superuser opens the Reports tab of a course it holds no role in',
    { annotation: testId('TC-00543') },
    async ({ authoringCourse, adminReportsPage }) => {
      const { courseKey } = authoringCourse;

      const reports = await adminReportsPage.openReports(courseKey);

      await expect(adminReportsPage.tabLink(courseKey, INSTRUCTOR_TAB_IDS.aspects)).toBeVisible();
      await expectEveryDashboardEmbeds(adminReportsPage, reports);
    },
  );

  test(
    'course staff follow the Superset link and sign in through the LMS',
    { annotation: testId('TC-00549') },
    async ({ config, authoringCourse, reportsViewer }) => {
      const { courseKey } = authoringCourse;
      const { reportsPage } = await reportsViewer(courseKey);
      const reports = await reportsPage.openReports(courseKey);
      const origin = supersetOrigin(config, reports);

      const superset = await reportsPage.openSupersetLink();
      expect(new URL(superset.url()).origin, 'the link opens the advertised Superset').toBe(origin);

      // Single sign-on: the LMS session is all it takes, and course staff are
      // Superset instructors.
      const user = await signInToSuperset(superset, origin);
      expect(user.anonymous, 'Superset signed the user in').toBe(false);
      expect(user.roles).toContain('Instructor');

      // Superset's own pages have a scan of their own (the tab's excludes the embed).
      await openCourseComparison(superset, origin, dashboardLocaleSuffix(reports));
      await checkA11y(superset, {
        label: 'superset-course-comparison',
        additionalBaseline: SUPERSET_A11Y_BASELINE,
      });
    },
  );
});
