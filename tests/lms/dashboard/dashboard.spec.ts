import { checkA11y } from '../../../src/a11y';
import { isEnrolled } from '../../../src/api';
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
      tag: ['@regression', '@authenticated'],
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
