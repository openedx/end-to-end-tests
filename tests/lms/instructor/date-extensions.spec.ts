import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  assignmentDateFor,
  fetchCourseDates,
  fetchCourseProgress,
  listUnitExtensions,
} from '../../../src/api';
import { waitForLearnerProgress } from '../../../src/steps';
import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS } from './helpers';

/**
 * Individual due-date extensions (TC-00525): grant one for a learner on a
 * graded subsection, see it listed and reflected in the learner's own dates,
 * then reset it.
 *
 * The learner's oracles are the progress API's per-subsection `due` and the
 * course-home dates API, which lists the assignment while
 * `assignmentDatesListed` holds relative dates on for the course; the Dates
 * tab is then read for the assignment under the extended day, and under the
 * course's own due day again after the reset.
 */
test.describe(
  'Instructor dashboard date extensions',
  { tag: ['@regression', ...INSTRUCTOR_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'grants and resets an individual extension',
      { tag: '@smoke', annotation: testId('TC-00525') },
      async ({
        page,
        config,
        contentCourse,
        instructorDateExtensions,
        gradedProblemWithWrongAnswer,
        assignmentDatesListed,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        void assignmentDatesListed;
        const courseKey = contentCourse.courseKey;
        const { subsectionKey, due, learner } = gradedProblemWithWrongAnswer;
        const username = learner.identity.username;
        // The learner's Dates tab: the day the dates API puts the assignment
        // on, to the minute, and whether the tab lists it under that day.
        const datesTabDue = async () =>
          assignmentDateFor(
            await fetchCourseDates(learner.request, config, courseKey),
            subsectionKey,
          )?.date.slice(0, 16);
        const listedOn = async (instant: string) => {
          await learner.datesPage.goto(courseKey);
          return learner.datesPage
            .dayOn(await learner.datesPage.formatDay(instant))
            .and(learner.datesPage.dayOf(subsectionKey));
        };
        const learnerDue = async () =>
          (await fetchCourseProgress(learner.request, config, courseKey)).subsections.find(
            (s) => s.block_key === subsectionKey,
          )?.due;
        // The learner's reading follows the block-structure rebuild; poll it.
        await expect
          .poll(async () => (await learnerDue())?.slice(0, 10), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe(due.slice(0, 10));

        await instructorDateExtensions.gotoTab(courseKey);
        await expect(instructorDateExtensions.rowFor(username)).toHaveCount(0);

        const extended = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        extended.setUTCSeconds(0, 0);
        const added = await instructorDateExtensions.addExtension({
          emailOrUsername: username,
          subsectionUsageKey: subsectionKey,
          due: extended,
          reason: `E2E ${test.info().testId.slice(-6)}`,
        });
        expect(added.status()).toBe(200);

        // Instructor side: the table and the API list it with the date entered.
        await expect(instructorDateExtensions.rowFor(username)).toBeVisible();
        const listed = await listUnitExtensions(page.request, config, courseKey, {
          emailOrUsername: username,
        });
        const row = listed.results.find((r) => r.unit_location === subsectionKey);
        expect(row?.extended_due_date.slice(0, 16)).toBe(extended.toISOString().slice(0, 16));
        // Learner side: their due date is the extension.
        const seen = await waitForLearnerProgress(
          learner.request,
          config,
          courseKey,
          (p) =>
            p.subsections.find((s) => s.block_key === subsectionKey)?.due?.slice(0, 16) ===
            extended.toISOString().slice(0, 16),
        );
        expect(
          seen.satisfied,
          JSON.stringify(seen.last.subsections.find((s) => s.block_key === subsectionKey)),
        ).toBe(true);

        // And on their Dates tab the assignment has moved to the extended day.
        await expect
          .poll(datesTabDue, { timeout: TIMEOUTS.contentPublish })
          .toBe(extended.toISOString().slice(0, 16));
        await expect(await listedOn(extended.toISOString())).toHaveCount(1);

        await checkA11y(page, {
          label: 'instructor-date-extensions',
          additionalBaseline: INSTRUCTOR_A11Y_BASELINE,
        });

        // Reset: gone from the table and the API; the learner is back on the course due date.
        const reset = await instructorDateExtensions.resetExtension(username);
        expect(reset.status()).toBe(200);
        await expect
          .poll(
            async () =>
              (
                await listUnitExtensions(page.request, config, courseKey, {
                  emailOrUsername: username,
                })
              ).count,
          )
          .toBe(0);
        await expect(instructorDateExtensions.rowFor(username)).toHaveCount(0);
        const back = await waitForLearnerProgress(
          learner.request,
          config,
          courseKey,
          (p) =>
            p.subsections.find((s) => s.block_key === subsectionKey)?.due?.slice(0, 10) ===
            due.slice(0, 10),
        );
        expect(back.satisfied).toBe(true);
        await expect.poll(datesTabDue, { timeout: TIMEOUTS.contentPublish }).toBe(due.slice(0, 16));
        await expect(await listedOn(due)).toHaveCount(1);
      },
    );
  },
);
