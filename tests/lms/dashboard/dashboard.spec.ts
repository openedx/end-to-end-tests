import { checkA11y } from '../../../src/a11y';
import {
  enrollInCourseViaApi,
  fetchLearnerHome,
  isEnrolled,
  type LearnerHome,
} from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * The learner dashboard: the enrolled course is listed, and its card leads into
 * the course.
 *
 * The card's call to action reads "Begin Course", "Resume Course" or "View
 * Course" depending on progress — one affordance in three states — so it is never
 * matched by label. Where the learner ends up is the assertion.
 */
test.describe('Learner dashboard', () => {
  test(
    'lists the courses the learner is enrolled in',
    {
      tag: ['@smoke', '@authenticated'],
      annotation: testId('TC-00041'),
    },
    async ({ page, request, config, dashboardPage, enrolledCourse }) => {
      const { courseKey } = enrolledCourse;

      // The platform's record of the enrollment, before looking at any rendering.
      expect(await isEnrolled(request, config, courseKey)).toBe(true);

      await dashboardPage.goto();

      await expect(dashboardPage.content).toBeVisible();
      await expect(dashboardPage.courseCard(courseKey)).toBeVisible();

      // The course name is a link into the course, which is the case's own wording
      // ("the course name is a link to the course outline") expressed as an href.
      await expect(dashboardPage.courseCardTitle(courseKey)).toHaveAttribute(
        'href',
        new RegExp(`/course/${courseKey.replace(/[+:]/g, '\\$&')}/`),
      );

      await checkA11y(page, { label: 'dashboard' });
    },
  );

  test(
    'filters the courses by status and sorts them by enrollment or title',
    {
      tag: ['@regression', '@studio', '@author', '@mfe-learner-dashboard'],
      annotation: testId('TC-00041'),
    },
    async ({ config, contentCourse, courseKey, roundTripLearner }) => {
      // A learner of the suite's own with two enrollments, so that an order is
      // observable: the worker course first, then the configured course.
      const learner = roundTripLearner;
      const dashboard = learner.dashboardPage;
      await enrollInCourseViaApi(learner.request, config, courseKey);
      const home = (await fetchLearnerHome(learner.request, config)) as LearnerHome;
      const keys = (courses: LearnerHome['courses']) => courses.map((c) => c.courseRun.courseId);
      expect(keys(home.courses)).toEqual(
        expect.arrayContaining([contentCourse.courseKey, courseKey]),
      );

      await dashboard.goto();
      // Every card offers the way into its course (Begin, Resume or View).
      for (const key of keys(home.courses)) {
        await expect(dashboard.courseCardCta(key)).toBeVisible();
      }

      // What each control should leave on the page is worked out from the
      // dashboard's own data, never from the labels.
      const byEnrollment = [...home.courses].sort(
        (a, b) => Date.parse(b.enrollment.lastEnrolled) - Date.parse(a.enrollment.lastEnrolled),
      );
      const byTitle = [...home.courses].sort((a, b) =>
        a.course.courseName.toLowerCase().localeCompare(b.course.courseName.toLowerCase()),
      );

      await dashboard.openRefine();
      await expect(dashboard.sortOption('enrolled')).toBeChecked();
      await expect.poll(() => dashboard.shownCourseKeys()).toEqual(keys(byEnrollment));

      await dashboard.sortOption('title').check();
      await expect.poll(() => dashboard.shownCourseKeys()).toEqual(keys(byTitle));

      // Status: the two filters split the list by whether the course was opened.
      const started = byTitle.filter((c) => c.enrollment.hasStarted);
      const notStarted = byTitle.filter((c) => !c.enrollment.hasStarted);
      await dashboard.statusFilter('notStarted').check();
      await expect.poll(() => dashboard.shownCourseKeys()).toEqual(keys(notStarted));

      await dashboard.statusFilter('notStarted').uncheck();
      await dashboard.statusFilter('inProgress').check();
      await expect.poll(() => dashboard.shownCourseKeys()).toEqual(keys(started));

      // With no filter left the whole list is back.
      await dashboard.statusFilter('inProgress').uncheck();
      await expect.poll(() => dashboard.shownCourseKeys()).toEqual(keys(byTitle));
    },
  );

  test(
    'the course card leads into the course',
    {
      tag: ['@regression', '@authenticated'],
      annotation: testId('TC-00042'),
    },
    async ({ page, dashboardPage, enrolledCourse }) => {
      const { courseKey } = enrolledCourse;
      await dashboardPage.goto();

      await dashboardPage.beginCourse(courseKey);

      // Landed in the courseware for this course rather than anywhere else.
      const url = new URL(page.url());
      expect(url.pathname).toContain(`/course/${courseKey}`);
    },
  );

  test(
    'unenrolls from a course through its card, and keeps it on cancel',
    {
      tag: ['@regression', '@authenticated', '@mfe-learner-dashboard'],
      annotation: testId('TC-00043'),
    },
    async ({ page, request, config, dashboardPage, enrolledCourse }) => {
      const { courseKey } = enrolledCourse;
      await dashboardPage.goto();
      await expect(dashboardPage.courseCard(courseKey)).toBeVisible();

      // Cancelling leaves the learner enrolled.
      await dashboardPage.cancelUnenroll(courseKey);
      expect(await isEnrolled(request, config, courseKey)).toBe(true);
      await checkA11y(page, { label: 'dashboard-after-cancel' });

      // Confirming unenrolls: the platform's record, then the card.
      expect((await dashboardPage.unenroll(courseKey)).ok()).toBe(true);
      expect(await isEnrolled(request, config, courseKey)).toBe(false);
      await dashboardPage.goto();
      await expect(dashboardPage.courseCard(courseKey)).toHaveCount(0);
    },
  );
});
