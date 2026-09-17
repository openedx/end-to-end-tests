import { expect, test } from '../../../src/fixtures';
import { INSTRUCTOR_TAB_IDS } from '../../../src/config';
import { fetchInstructorCourse } from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS } from './helpers';

/**
 * The Course Info tab (TC-00515, TC-00516): identifiers, enrollment counts per
 * track, and the course status chip.
 *
 * The numbers are the dashboard model's; the spec reads them from the API and
 * compares them to the rendered counters inside one `expect.poll`, so a count
 * that moves between two readings cannot produce a false failure. The status
 * chip is asserted by its Paragon variant, decided by the API's `has_started`,
 * never by its label.
 */
test.describe('Instructor dashboard course info', { tag: [...INSTRUCTOR_TAGS] }, () => {
  test(
    'shows the course identifiers and enrollment counts',
    { tag: '@smoke', annotation: testId('TC-00515') },
    async ({ page, config, contentCourse, instructorCourseInfo, studioAuthorSession }) => {
      void studioAuthorSession;
      const courseKey = contentCourse.courseKey;
      await instructorCourseInfo.gotoTab(courseKey);

      // The dashboard offers every tab this persona should have.
      for (const tabId of [
        INSTRUCTOR_TAB_IDS.courseInfo,
        INSTRUCTOR_TAB_IDS.enrollments,
        INSTRUCTOR_TAB_IDS.grading,
        INSTRUCTOR_TAB_IDS.dateExtensions,
        INSTRUCTOR_TAB_IDS.dataDownloads,
      ]) {
        await expect(instructorCourseInfo.tabLink(courseKey, tabId)).toBeVisible();
      }

      // Identifiers are the suite's own data (org / number / run), so matching
      // them in the rendered card is matching test-supplied values.
      await expect(instructorCourseInfo.identifiers.first()).toBeVisible();
      const rendered = (await instructorCourseInfo.identifiers.allTextContents()).join(' ');
      expect(rendered).toContain(contentCourse.org);
      expect(rendered).toContain(contentCourse.courseKey);

      // Counters equal the API's counts — both readings taken together, so a
      // count that moves between two reads cannot fail the test spuriously.
      const counters = async () => {
        const model = await fetchInstructorCourse(page.request, config, courseKey);
        const modes = Object.keys(model.enrollment_counts).filter((key) => key !== 'total');
        return {
          rendered: await instructorCourseInfo.counterValues(),
          api: [
            model.total_enrollment,
            model.staff_count,
            model.learner_count,
            ...modes.map((mode) => model.enrollment_counts[mode]),
          ],
        };
      };
      await expect
        .poll(async () => {
          const { rendered, api } = await counters();
          return JSON.stringify(rendered) === JSON.stringify(api)
            ? 'match'
            : `rendered ${JSON.stringify(rendered)} vs api ${JSON.stringify(api)}`;
        })
        .toBe('match');
      const model = await fetchInstructorCourse(page.request, config, courseKey);

      // A started, not-ended course wears the "active" variant.
      expect(model.has_started).toBe(true);
      expect(model.has_ended).toBe(false);
      await expect(instructorCourseInfo.activeBadge).toBeVisible();

      await checkA11y(page, {
        label: 'instructor-course-info',
        additionalBaseline: INSTRUCTOR_A11Y_BASELINE,
      });
    },
  );

  test(
    'flags a course that has not started as upcoming',
    { tag: '@regression', annotation: testId('TC-00516') },
    async ({ page, config, futureCourse, instructorCourseInfo, studioAuthorSession }) => {
      void studioAuthorSession;
      await instructorCourseInfo.gotoTab(futureCourse.courseKey);

      const model = await fetchInstructorCourse(page.request, config, futureCourse.courseKey);
      expect(model.has_started).toBe(false);
      await expect(instructorCourseInfo.upcomingBadge).toBeVisible();
      await expect(instructorCourseInfo.activeBadge).toHaveCount(0);
    },
  );
});
