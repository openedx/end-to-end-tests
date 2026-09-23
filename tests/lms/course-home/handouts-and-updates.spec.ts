import { randomUUID } from 'node:crypto';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  courseTool,
  createCourseUpdate,
  fetchCourseHomeOutline,
  updateHandouts,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { AUTHORED_COURSE_HOME_TAGS } from './helpers';

/**
 * What an author posts on Studio's Updates page, as the learner meets it on the
 * course home: the handouts in the sidebar (TC-00026) and the course updates
 * behind the Updates tool (TC-00037). The author writes through the same
 * endpoints the Updates page saves to; the learner's course-home outline API
 * decides whether each arrived, and the course home shows it.
 */
test.describe(
  'Course handouts and updates',
  { tag: ['@regression', ...AUTHORED_COURSE_HOME_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'shows the handouts the author posted',
      { annotation: testId('TC-00026') },
      async ({ page, config, contentCourse, studioAuthorSession, roundTripLearner }) => {
        void studioAuthorSession;
        const { courseKey } = contentCourse;
        const { request, courseOutlinePage } = roundTripLearner;
        const href = `https://example.com/e2e-handout-${randomUUID().slice(0, 8)}`;

        await updateHandouts(
          page.request,
          config,
          courseKey,
          `<ol><li><a href="${href}">E2E handout</a></li></ol>`,
        );
        await expect
          .poll(
            async () => (await fetchCourseHomeOutline(request, config, courseKey))?.handouts_html,
            {
              timeout: TIMEOUTS.contentPublish,
            },
          )
          .toContain(href);

        await courseOutlinePage.gotoHome(courseKey);
        await courseOutlinePage.dismissTourDialog();
        const handouts = courseOutlinePage.fragmentHolding(href);
        await expect(handouts.frame).toBeVisible();
        await expect(handouts.content.locator(`a[href="${href}"]`)).toBeAttached();
      },
    );

    test(
      'lists the course updates under the Updates tool',
      { annotation: testId('TC-00037') },
      async ({ page, config, contentCourse, studioAuthorSession, roundTripLearner }) => {
        void studioAuthorSession;
        const { courseKey } = contentCourse;
        const { request, courseOutlinePage, courseToolsPage } = roundTripLearner;
        const token = `E2E update ${randomUUID().slice(0, 8)}`;

        await createCourseUpdate(page.request, config, courseKey, {
          date: 'January 1, 2026',
          content: `<p>${token}</p>`,
        });
        const updatesTool = async () =>
          courseTool(await fetchCourseHomeOutline(request, config, courseKey), 'edx.updates');
        await expect.poll(updatesTool, { timeout: TIMEOUTS.contentPublish }).toBeDefined();
        const tool = (await updatesTool())!;

        await courseOutlinePage.gotoHome(courseKey);
        await courseOutlinePage.dismissTourDialog();
        await expect(courseOutlinePage.toolLink(tool.url)).toBeVisible();
        await courseToolsPage.gotoUpdates(tool.url);
        await expect(courseToolsPage.updates.filter({ hasText: token })).toHaveCount(1);
      },
    );
  },
);
