import { expect, test } from '../../../src/fixtures';
import { INSTRUCTOR_TAB_IDS, instructorTabPath } from '../../../src/config';
import { fetchInstructorCourse } from '../../../src/api';
import { INSTRUCTOR_TAGS } from './helpers';

/**
 * Proof-of-life for the instructor persona, with no UI: the worker author is
 * the instructor of its own course (creator → `instructor` + `staff` course
 * roles, plus the `data_researcher` role the content-course seed grants), the
 * dashboard model lists the tabs this epic covers with the MFE's URLs. Kept as
 * the fastest signal that a target's instructor API and roles are as the suite
 * expects. (The legacy `/courses/<key>/instructor` redirect to the MFE is a
 * Django-session view — the session the platform's concurrent-login rule
 * evicts — so it is recorded in the plan, not asserted here.)
 */
test.describe(
  'Instructor dashboard bootstrap',
  { tag: ['@regression', ...INSTRUCTOR_TAGS] },
  () => {
    test('the worker author is the instructor and data researcher of its course', async ({
      page,
      config,
      contentCourse,
      studioAuthorSession,
    }) => {
      void studioAuthorSession;
      const course = await fetchInstructorCourse(page.request, config, contentCourse.courseKey);

      expect(course.course_id).toBe(contentCourse.courseKey);
      expect(course.permissions).toMatchObject({
        instructor: true,
        staff: true,
        data_researcher: true,
      });
      const tabIds = course.tabs.map((tab) => tab.tab_id);
      for (const tabId of [
        INSTRUCTOR_TAB_IDS.courseInfo,
        INSTRUCTOR_TAB_IDS.enrollments,
        INSTRUCTOR_TAB_IDS.grading,
        INSTRUCTOR_TAB_IDS.dateExtensions,
        INSTRUCTOR_TAB_IDS.dataDownloads,
      ]) {
        expect(tabIds).toContain(tabId);
      }
      for (const tab of course.tabs) {
        expect(tab.url).toBe(instructorTabPath(contentCourse.courseKey, tab.tab_id as never));
      }
    });
  },
);
