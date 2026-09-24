import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  ApiError,
  fetchCourseMetadata,
  fetchInstructorCourse,
  grantCourseTeamRole,
} from '../../../src/api';
import { CourseOutlinePage } from '../../../src/pages/lms/course-home/course-outline.page';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_TAGS } from './helpers';

/**
 * Who may open the instructor dashboard (TC-00513): course staff and global
 * staff see the course home's "Instructor" tab and land on the dashboard from
 * it; a learner sees no such tab. Each actor is read twice, together: the
 * course home's tab list (`course_metadata.tabs[]`, `tab_id: instructor`) and
 * the dashboard model's answer (200 with the actor's permissions, or 403). The
 * course's own instructor is `instructor-bootstrap.spec.ts`'s subject.
 */

/** The course home's tabs and the dashboard model's status, as one actor reads them. */
async function accessOf(request: APIRequestContext, config: AppConfig, courseKey: string) {
  const tabs = (await fetchCourseMetadata(request, config, courseKey)).tabs.map((t) => t.tab_id);
  try {
    const course = await fetchInstructorCourse(request, config, courseKey);
    return {
      instructorTab: tabs.includes('instructor'),
      status: 200,
      permissions: course.permissions,
    };
  } catch (error) {
    if (error instanceof ApiError)
      return { instructorTab: tabs.includes('instructor'), status: error.status };
    throw error;
  }
}

/** Clicks the course home's Instructor tab and waits to land on the dashboard. */
async function openDashboardFromCourseHome(home: CourseOutlinePage, page: Page, courseKey: string) {
  await home.gotoHome(courseKey);
  // A first visit opens the course-home welcome tour over the tabs.
  await home.dismissTourDialog();
  await home.instructorTab(courseKey).click();
  await page.waitForURL((url) => url.pathname.startsWith(`/instructor-dashboard/${courseKey}`));
}

test.describe('Instructor dashboard access', { tag: ['@regression', ...INSTRUCTOR_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'course staff see the Instructor tab and open the dashboard from it',
    { tag: '@smoke', annotation: testId('TC-00513') },
    async ({ page, config, contentCourse, studioAuthorSession, instructorCast }) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const staff = await instructorCast('staff');
      await grantCourseTeamRole(
        page.request,
        config,
        courseKey,
        [staff.identity.username],
        'staff',
      );
      try {
        await expect
          .poll(() => accessOf(staff.request, config, courseKey))
          .toMatchObject({
            instructorTab: true,
            status: 200,
            permissions: { staff: true, admin: false },
          });
        await openDashboardFromCourseHome(staff.courseOutlinePage, staff.page, courseKey);
        await expect(staff.instructorDashboardPage.tabNav).toBeVisible();
      } finally {
        await grantCourseTeamRole(
          page.request,
          config,
          courseKey,
          [staff.identity.username],
          'staff',
          'revoke',
        );
      }
    },
  );

  test(
    'global staff see the Instructor tab of a course they hold no role in',
    { annotation: testId('TC-00513') },
    async ({ config, contentCourse, adminPage }) => {
      const { courseKey } = contentCourse;
      expect(await accessOf(adminPage.request, config, courseKey)).toMatchObject({
        instructorTab: true,
        status: 200,
        permissions: { admin: true },
      });
      // The admin's browser has no course-home page object of its own.
      await openDashboardFromCourseHome(
        new CourseOutlinePage(adminPage, config),
        adminPage,
        courseKey,
      );
    },
  );

  test(
    'a learner sees no Instructor tab and is refused the dashboard',
    { annotation: testId('TC-00513') },
    async ({ config, contentCourse, roundTripLearner }) => {
      const { courseKey } = contentCourse;
      expect(await accessOf(roundTripLearner.request, config, courseKey)).toEqual({
        instructorTab: false,
        status: 403,
      });
      const home = roundTripLearner.courseOutlinePage;
      await home.gotoHome(courseKey);
      await expect(home.instructorTab(courseKey)).toHaveCount(0);
    },
  );
});
