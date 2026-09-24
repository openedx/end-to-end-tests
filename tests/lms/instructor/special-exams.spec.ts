import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { listAllowances } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS } from './helpers';

/**
 * Special-exam allowances (TC-00541): in the instructor dashboard's Special
 * Exams tab the instructor grants a learner extra time on a timed exam, edits
 * it, and deletes it. The allowance writes answer 200 whether or not each row
 * took, so the course's allowance list, read back for the learner, decides.
 * Timed exams need `ENABLE_SPECIAL_EXAMS` (`special-exams`); a timed exam, not
 * a proctored one, is what a stock install can create.
 */
test.describe(
  'Instructor dashboard: special-exam allowances',
  { tag: ['@regression', '@special-exams', ...INSTRUCTOR_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    const allowancesOf = async (
      request: Parameters<typeof listAllowances>[0],
      config: Parameters<typeof listAllowances>[1],
      courseKey: string,
      username: string,
    ) =>
      (await listAllowances(request, config, courseKey, username)).map((a) => ({
        exam: a.proctored_exam.id,
        key: a.key,
        value: a.value,
      }));

    test(
      'grants a learner extra time on a timed exam and edits it',
      { annotation: testId('TC-00541') },
      async ({ page, config, timedExam, instructorSpecialExams, authoringCourseLearnerLater }) => {
        const { courseKey, examId } = timedExam;
        const { username } = (await authoringCourseLearnerLater()).identity;

        await instructorSpecialExams.gotoAllowances(courseKey);
        const added = await instructorSpecialExams.addAllowance({
          learner: username,
          examType: 'timed',
          examId,
          type: 'additional_time_granted',
          value: '15',
        });
        expect(await added.json()).toMatchObject({ results: [{ success: true }] });
        expect(await allowancesOf(page.request, config, courseKey, username)).toEqual([
          { exam: examId, key: 'additional_time_granted', value: '15' },
        ]);
        await checkA11y(page, {
          label: 'instructor-special-exams',
          additionalBaseline: [...INSTRUCTOR_A11Y_BASELINE],
        });

        const edited = await instructorSpecialExams.editAllowance(username, '20');
        expect(await edited.json()).toMatchObject({ results: [{ success: true }] });
        expect(await allowancesOf(page.request, config, courseKey, username)).toEqual([
          { exam: examId, key: 'additional_time_granted', value: '20' },
        ]);
      },
    );

    test(
      'deletes a learner’s allowance',
      { annotation: testId('TC-00541') },
      async ({ page, config, timedExam, instructorSpecialExams, authoringCourseLearnerLater }) => {
        test.fail(
          true,
          'INSTR-009: Delete sends the learner’s numeric id, the server finds no user by it ' +
            '(200, "User not found") and the allowance stays',
        );
        const { courseKey, examId } = timedExam;
        const { username } = (await authoringCourseLearnerLater()).identity;
        await instructorSpecialExams.gotoAllowances(courseKey);
        await instructorSpecialExams.addAllowance({
          learner: username,
          examType: 'timed',
          examId,
          type: 'additional_time_granted',
          value: '15',
        });
        expect(await allowancesOf(page.request, config, courseKey, username)).toHaveLength(1);

        const deleted = await instructorSpecialExams.deleteAllowance(username);
        expect(await deleted.json()).toMatchObject({ results: [{ success: true }] });
        expect(await allowancesOf(page.request, config, courseKey, username)).toEqual([]);
      },
    );
  },
);
