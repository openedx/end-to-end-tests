import { expect, test } from '../../../src/fixtures';
import { fetchLearnerHome } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Global staff's "View as" on the learner dashboard (TC-00045): staff see a
 * search bar that shows the dashboard as another learner, and learners do not
 * get one — the platform refuses them the other user's data as well.
 */
test.describe(
  'Learner dashboard "View as"',
  { tag: ['@regression', '@mfe-learner-dashboard'] },
  () => {
    test(
      'lets global staff view the dashboard as a learner',
      { tag: '@authenticated', annotation: testId('TC-00045') },
      async ({ adminDashboardPage, enrolledCourse }) => {
        const { courseKey, identity } = enrolledCourse;
        await adminDashboardPage.goto();
        await expect(adminDashboardPage.masqueradeInput).toBeVisible();

        const response = await adminDashboardPage.masqueradeAs(identity.username);
        expect(response.status()).toBe(200);
        const viewed = (await response.json()) as {
          courses: { courseRun: { courseId: string } }[];
        };
        expect(viewed.courses.map((course) => course.courseRun.courseId)).toEqual([courseKey]);
        await expect(adminDashboardPage.courseCard(courseKey)).toBeVisible();
        await expect(adminDashboardPage.masqueradeChip).toBeVisible();
      },
    );

    test(
      'offers a learner no "View as", and refuses them another learner’s dashboard',
      { tag: '@authenticated', annotation: testId('TC-00045') },
      async ({ request, config, dashboardPage, courseLearner, profileViewer }) => {
        void courseLearner;
        await dashboardPage.goto();
        await expect(dashboardPage.masqueradeInput).toHaveCount(0);
        expect(await fetchLearnerHome(request, config, { user: profileViewer.username })).toEqual({
          forbidden: true,
        });
      },
    );
  },
);
