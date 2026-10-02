import { expect, test } from '../../src/fixtures';
import { TIMEOUTS } from '../../src/config';
import {
  ApiError,
  enrollInCourseViaApi,
  fetchInstructorCourse,
  makeGlobalStaff,
  supersetOrigin,
} from '../../src/api';
import type { Page } from '@playwright/test';
import { dashboardLocaleSuffix, openCourseComparison, signInToSuperset } from '../../src/steps';
import { testId } from '../../src/reporting';
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
    async ({ config, authoringCourse, contentCourse, supersetColleague, adminLms }) => {
      const staff = await supersetColleague();
      await adminLms((session) => makeGlobalStaff(session, config, staff.identity.username));
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
});
