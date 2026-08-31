import { isEnrolled } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { catalogSearchTermFor } from '../../../src/steps';

/**
 * Enrollment through the course About page — the journey a learner takes from
 * discovery to being enrolled.
 *
 * The UI drives the action; the **enrollment API decides pass/fail**. The test
 * case's wording ("the button is disabled and says *You are enrolled in this
 * course*") is deliberately not asserted as copy — and on this platform version
 * the enrolled state is not a disabled button at all, but a link into the
 * courseware, which is what the structural assertion below checks.
 */
test.describe('Course enrollment', () => {
  test(
    'enrolls a learner from the course About page',
    { tag: ['@smoke', '@authenticated'], annotation: testId('TC-00008') },
    async ({ request, config, catalogPage, courseAboutPage, courseDetail, courseLearner }) => {
      const { courseKey } = courseLearner;

      // Not enrolled yet: the About page offers the enroll call to action and no
      // route into the courseware.
      await catalogPage.goto();
      await catalogPage.search(catalogSearchTermFor(courseDetail));
      await catalogPage.openCourseAbout(courseKey);

      await expect(courseAboutPage.enrollButton).toBeEnabled();
      await expect(courseAboutPage.coursewareLink(courseKey)).toHaveCount(0);
      expect(await isEnrolled(request, config, courseKey)).toBe(false);

      await courseAboutPage.enroll(courseKey);

      // The authoritative check: the platform records an active enrollment.
      expect(await isEnrolled(request, config, courseKey)).toBe(true);

      // Revisiting About shows the enrolled state — a way into the course rather
      // than an enroll button.
      await courseAboutPage.goto(courseKey);
      await expect(courseAboutPage.coursewareLink(courseKey)).toBeVisible();
      await expect(courseAboutPage.enrollButton).toHaveCount(0);
    },
  );
});
