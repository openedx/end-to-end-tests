import { expect, test } from '../../src/fixtures';
import { TIMEOUTS } from '../../src/config';
import {
  ApiError,
  enrollInCourseViaApi,
  fetchGuestToken,
  fetchInContextDashboard,
  fetchInstructorCourse,
  fetchInstructorReports,
  supersetOrigin,
} from '../../src/api';
import type { Page } from '@playwright/test';
import { dashboardLocaleSuffix, openCourseComparison, signInToSuperset } from '../../src/steps';
import { issue, testId } from '../../src/reporting';
import { supersetFor } from './helpers';

/**
 * Who may use Superset, and which courses it shows them (TC-00550–00552).
 *
 * Superset signs users in through the LMS and decides from their Open edX roles:
 * the superuser and global staff see every course, course staff only the
 * courses they are staff on, and anyone else is refused. Each subject is an
 * account of the test's own, given its role before it first signs in, because
 * Superset caches what a user may see at sign-in. The reading is Course
 * Comparison's own Course Name filter, replayed on the subject's Superset
 * session: the courses row-level security lets it see.
 *
 * A learner is also refused Aspects' LMS views themselves (the dashboards, a
 * guest token, the in-context dashboard), which GHSA-hm6j-7x8q-5hqw fixed.
 *
 * The courses are the test's: its `authoringCourse` and the worker's shared
 * `contentCourse`, neither of which the subject holds a role on unless the test
 * grants it. Course staff, a new account staff on one course, must see exactly
 * that course.
 */

const TAGS = ['@regression', '@studio', '@author', '@analytics', '@instructor-dashboard'];

/**
 * The courses Course Comparison shows `page`'s signed-in user, once it lists
 * every name in `mustList`: a course reaches Superset's course names on a
 * dictionary refresh after it is created, so a new course may not be there yet.
 */
async function visibleCourses(
  page: Page,
  origin: string,
  localeSuffix: string,
  mustList: readonly string[],
) {
  const comparison = await openCourseComparison(page, origin, localeSuffix, mustList);
  return comparison.courseNames();
}

test.describe('Superset access', { tag: [...TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.analyticsTest });

  test(
    'the superuser sees every course in Course Comparison',
    { annotation: testId('TC-00550') },
    async ({ config, authoringCourse, contentCourse, adminPage, adminReportsPage }) => {
      const reports = await adminReportsPage.openReports(authoringCourse.courseKey);
      const origin = supersetOrigin(config, reports);

      const user = await signInToSuperset(adminPage, origin);
      expect(user.anonymous).toBe(false);
      expect(user.roles).toContain('Admin');

      await visibleCourses(adminPage, origin, dashboardLocaleSuffix(reports), [
        authoringCourse.displayName,
        contentCourse.displayName,
      ]);
    },
  );

  test(
    'global staff see every course in Course Comparison',
    { annotation: testId('TC-00550') },
    async ({ config, authoringCourse, contentCourse, globalStaffColleague }) => {
      const staff = await globalStaffColleague();
      const { origin, localeSuffix } = await supersetFor(
        staff.request,
        config,
        authoringCourse.courseKey,
      );

      const user = await signInToSuperset(staff.page, origin);
      expect(user.anonymous).toBe(false);

      await visibleCourses(staff.page, origin, localeSuffix, [
        authoringCourse.displayName,
        contentCourse.displayName,
      ]);
    },
  );

  test(
    'course staff see only their own courses in Course Comparison',
    { annotation: testId('TC-00551') },
    async ({ config, authoringCourse, supersetColleague }) => {
      const staff = await supersetColleague({
        courseKey: authoringCourse.courseKey,
        role: 'staff',
      });
      const { origin, localeSuffix } = await supersetFor(
        staff.request,
        config,
        authoringCourse.courseKey,
      );

      const user = await signInToSuperset(staff.page, origin);
      expect(user.anonymous).toBe(false);
      expect(user.roles).toContain('Instructor');

      // A new account staff on one course sees exactly that course, whatever else
      // the install holds.
      const courses = await visibleCourses(staff.page, origin, localeSuffix, [
        authoringCourse.displayName,
      ]);
      expect(courses).toEqual([authoringCourse.displayName]);
    },
  );

  test(
    'a course data researcher cannot sign in to Superset',
    { annotation: testId('TC-00551') },
    async ({ config, authoringCourse, supersetColleague, reportsViewer }) => {
      const { member } = await reportsViewer(authoringCourse.courseKey);
      const { origin } = await supersetFor(member.request, config, authoringCourse.courseKey);
      const researcher = await supersetColleague({
        courseKey: authoringCourse.courseKey,
        role: 'data_researcher',
      });

      const user = await signInToSuperset(researcher.page, origin);
      // A refused sign-in leaves a visitor: `Public` on Superset 6.1, no role on 6.0.
      expect(user.anonymous, 'Superset refused the sign-in').toBe(true);
      expect(user.roles.filter((role) => role !== 'Public')).toEqual([]);
    },
  );

  test(
    'a learner cannot sign in to Superset and has no instructor dashboard',
    { annotation: testId('TC-00552') },
    async ({ config, authoringCourse, supersetColleague, reportsViewer }) => {
      const { member } = await reportsViewer(authoringCourse.courseKey);
      const { origin } = await supersetFor(member.request, config, authoringCourse.courseKey);
      const learner = await supersetColleague();
      await enrollInCourseViaApi(learner.request, config, authoringCourse.courseKey);

      const user = await signInToSuperset(learner.page, origin);
      // A refused sign-in leaves a visitor: `Public` on Superset 6.1, no role on 6.0.
      expect(user.anonymous, 'Superset refused the sign-in').toBe(true);
      expect(user.roles.filter((role) => role !== 'Public')).toEqual([]);

      // No instructor dashboard, so no Reports tab: the dashboard model refuses the learner.
      const dashboard = await fetchInstructorCourse(
        learner.request,
        config,
        authoringCourse.courseKey,
      ).then(
        () => 200,
        (error: unknown) => (error instanceof ApiError ? error.status : error),
      );
      expect(dashboard).toBe(403);
    },
  );

  test(
    'a signed-in learner gets no Aspects dashboard or guest token from the LMS',
    {
      annotation: [
        testId('TC-00552'),
        issue(
          'https://github.com/openedx/platform-plugin-aspects/security/advisories/GHSA-hm6j-7x8q-5hqw',
        ),
      ],
    },
    async ({ config, authoringCourse, supersetColleague }) => {
      const { courseKey } = authoringCourse;
      // Aspects' three LMS views hand out what an embedded dashboard needs: the
      // Reports tab's dashboards, a Superset guest token for the course, and the
      // in-context dashboard. They admit global staff and the course's staff
      // only; before the fix for GHSA-hm6j-7x8q-5hqw, any signed-in user's GET
      // was admitted. Asked of an account enrolled as a learner and of one not
      // enrolled at all, each must answer 403.
      const statusOf = (read: Promise<unknown>) =>
        read.then(
          () => 200,
          (error: unknown) => (error instanceof ApiError ? error.status : error),
        );
      const enrolled = await supersetColleague();
      await enrollInCourseViaApi(enrolled.request, config, courseKey);
      const stranger = await supersetColleague();

      for (const [who, account] of [
        ['an enrolled learner', enrolled],
        ['an account with no enrollment', stranger],
      ] as const) {
        expect(
          {
            reports: await statusOf(fetchInstructorReports(account.request, config, courseKey)),
            guestToken: await statusOf(fetchGuestToken(account.request, config, courseKey)),
            inContext: await statusOf(fetchInContextDashboard(account.request, config, courseKey)),
          },
          who,
        ).toEqual({ reports: 403, guestToken: 403, inContext: 403 });
      }
    },
  );
});
