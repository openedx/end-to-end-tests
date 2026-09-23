import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { fetchUserTours } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * The course-home tour (TC-00040): a learner new to the platform is offered
 * the tour, walks it to the end, is not offered it again, and can relaunch it
 * from the course home. The learner's tour state (`user_tours`) decides; the
 * number of steps is read from the tour, never assumed.
 */
test(
  'walks a new learner through the course-home tour, and relaunches it',
  { tag: ['@regression', '@authenticated', '@mfe-learning'], annotation: testId('TC-00040') },
  async ({ page, request, config, courseOutlinePage, enrolledCourse }) => {
    const { courseKey, identity } = enrolledCourse;
    expect((await fetchUserTours(request, config, identity.username)).course_home_tour_status).toBe(
      'show-new-user-tour',
    );

    await courseOutlinePage.goto(courseKey);
    await courseOutlinePage.beginTour();
    await checkA11y(page, {
      label: 'course-home-tour',
      additionalBaseline: ['nested-interactive'],
    });
    expect(await courseOutlinePage.finishTour()).toBeGreaterThan(0);
    await expect(courseOutlinePage.tourCheckpoint).toHaveCount(0);
    expect((await fetchUserTours(request, config, identity.username)).course_home_tour_status).toBe(
      'no-tour',
    );

    // A returning visit offers no tour, and "Launch tour" starts it again.
    await courseOutlinePage.goto(courseKey);
    await expect(courseOutlinePage.tourDialog).toHaveCount(0);
    await courseOutlinePage.launchTour();
    await expect(courseOutlinePage.tourCheckpoint).toBeVisible();
  },
);
