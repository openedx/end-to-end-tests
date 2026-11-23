import { checkA11y } from '../../../src/a11y';
import { assignmentDateFor, fetchCourseDates } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';

/**
 * The learner's Dates tab — the timeline of a course's fixed dates and its
 * assignments' due dates.
 *
 * The course-home **dates API decides pass/fail**: it is what the tab renders,
 * and it carries the due date as a timestamp and the assignment's completion as
 * a boolean. The tab is then checked to have rendered that entry, by the link
 * to the subsection (its usage key, and the name the test gave it).
 *
 * Assignment dates are listed only while `course_experience.relative_dates` is
 * on for the course, which it is not by default; `assignmentDatesListed` turns
 * it on for the worker's content course and off again, through the Django
 * admin. The author's half (a graded subsection with a due date, published) is
 * done through the Studio API, which is why this runs as the author.
 */
test.describe(
  'Course dates',
  { tag: ['@regression', '@studio', '@author', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test("lists a graded subsection's due date on the learner's Dates tab", async ({
      config,
      contentCourse,
      gradedProblemWithWrongAnswer,
      assignmentDatesListed,
      studioAuthorSession,
    }) => {
      void studioAuthorSession;
      void assignmentDatesListed;
      const { courseKey } = contentCourse;
      const { subsectionKey, due, learner, section } = gradedProblemWithWrongAnswer;
      const subsectionName = section.subsections.at(0)?.displayName ?? '';
      const assignment = async () =>
        assignmentDateFor(
          await fetchCourseDates(learner.request, config, courseKey),
          subsectionKey,
        );

      // The learner's dates list the subsection, due when the author said. (The
      // listing follows the publish and the flag; poll it.)
      await expect
        .poll(async () => (await assignment())?.date.slice(0, 16), {
          timeout: TIMEOUTS.contentPublish,
        })
        .toBe(due.slice(0, 16));
      // It is the graded assignment the author made, open to this learner, and
      // done: the learner has already answered its one problem.
      expect(await assignment()).toMatchObject({
        assignment_type: 'Homework',
        learner_has_access: true,
        complete: true,
      });
      // The course's start is still listed beside it.
      const dates = await fetchCourseDates(learner.request, config, courseKey);
      expect(dates.course_date_blocks.map((block) => block.date_type)).toContain(
        'course-start-date',
      );

      // The Dates tab, reached from the course home's tab bar, shows that entry:
      // the subsection's name, linked to the subsection, on a day of its own
      // that is marked (as completed).
      await learner.courseOutlinePage.goto(courseKey);
      await learner.courseOutlinePage.dismissTourDialog();
      await learner.datesPage.gotoViaCourseTab(courseKey);
      await expect(learner.datesPage.assignmentLink(subsectionKey)).toHaveText(subsectionName);
      await expect(learner.datesPage.dayOf(subsectionKey)).toHaveCount(1);
      await expect(learner.datesPage.badgeOf(subsectionKey)).toBeVisible();
      // The start, today and the due date are three different days.
      expect(await learner.datesPage.days.count()).toBeGreaterThanOrEqual(3);

      await checkA11y(learner.page, { label: 'course-dates' });
    });
  },
);
