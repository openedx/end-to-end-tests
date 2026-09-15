import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  fetchLearnerProblem,
  type InstructorLearner,
  type LearnerProblem,
  type QueuedGradingTask,
} from '../../../src/api';
import { waitForInstructorTask, waitForLearnerProgress } from '../../../src/steps';
import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS } from './helpers';

/**
 * Single-learner grading: viewing a learner and a problem (TC-00521) and the
 * four adjustments in the sheet's order — rescore, override, reset attempts,
 * delete history (TC-00522).
 *
 * Arrangement comes from `gradedProblemWithWrongAnswer`: a graded problem the
 * learner has answered wrong. Each adjustment is confirmed in the dashboard;
 * the instructor's `problems/<key>` reading and the learner's own progress
 * decide the outcome, polled together because the platform recomputes grades
 * a moment after the task lands. A rescore of an unchanged wrong answer leaves
 * the score at 0 — and would undo an override, which is why the order matters.
 */
test.describe(
  'Instructor dashboard grading — single learner',
  { tag: ['@regression', ...INSTRUCTOR_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'shows a learner and their state on a problem',
      { annotation: testId('TC-00521') },
      async ({
        page,
        contentCourse,
        instructorGrading,
        gradedProblemWithWrongAnswer,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const { problem, learner } = gradedProblemWithWrongAnswer;
        await instructorGrading.gotoTab(contentCourse.courseKey);
        await instructorGrading.selectScope('single');

        const learnerReading = (await (
          await instructorGrading.specifyLearner(learner.identity.username)
        ).json()) as InstructorLearner;
        expect(learnerReading).toMatchObject({
          username: learner.identity.username,
          is_enrolled: true,
        });
        expect(new URL(learnerReading.progress_url).pathname).toContain('/progress/');

        const problemReading = (await (
          await instructorGrading.specifyProblem(problem.usageKey)
        ).json()) as LearnerProblem;
        expect(problemReading.id).toBe(problem.usageKey);
        expect(problemReading.current_score).toEqual({ score: 0, total: 1 });
        expect(problemReading.attempts?.current).toBe(1);
        await expect(instructorGrading.fieldError).toHaveCount(0);

        await checkA11y(page, {
          label: 'instructor-grading',
          additionalBaseline: INSTRUCTOR_A11Y_BASELINE,
        });
      },
    );

    test(
      'rescores, overrides, resets attempts and deletes history for one learner',
      { annotation: testId('TC-00522') },
      async ({
        page,
        config,
        contentCourse,
        instructorGrading,
        gradedProblemWithWrongAnswer,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const courseKey = contentCourse.courseKey;
        const { problem, learner, subsectionKey } = gradedProblemWithWrongAnswer;
        const username = learner.identity.username;
        const instructorSees = () =>
          fetchLearnerProblem(page.request, config, courseKey, problem.usageKey, username);
        const learnerEarned = (
          progress: Awaited<ReturnType<typeof waitForLearnerProgress>>['last'],
        ) => progress.subsections.find((s) => s.block_key === subsectionKey)?.num_points_earned;

        await instructorGrading.gotoTab(courseKey);
        await instructorGrading.selectScope('single');
        await instructorGrading.specifyLearner(username);
        await instructorGrading.specifyProblem(problem.usageKey);

        // 1. Rescore: the stored answer is wrong, so the score stays 0 once the task lands.
        const rescore = await instructorGrading.rescore();
        expect(rescore.status()).toBe(202);
        expect(((await rescore.json()) as QueuedGradingTask).task_id).toBeTruthy();
        const rescored = await waitForInstructorTask(page.request, config, courseKey, {
          taskType: 'rescore_problem',
          reading: instructorSees,
          settled: (state) => state.current_score?.score === 0,
        });
        expect(rescored.satisfied, JSON.stringify(rescored.last)).toBe(true);

        // 2. Override to full marks: instructor reading and learner progress agree.
        const override = await instructorGrading.overrideScore(1);
        expect(override.status()).toBe(202);
        const overridden = await waitForInstructorTask(page.request, config, courseKey, {
          taskType: 'override_problem_score',
          reading: instructorSees,
          settled: (state) => state.current_score?.score === 1,
        });
        expect(overridden.satisfied, JSON.stringify(overridden.last)).toBe(true);
        const learnerAfterOverride = await waitForLearnerProgress(
          learner.request,
          config,
          courseKey,
          (p) => learnerEarned(p) === 1,
        );
        expect(
          learnerAfterOverride.satisfied,
          JSON.stringify(learnerEarned(learnerAfterOverride.last)),
        ).toBe(true);

        // 3. Reset attempts: synchronous, attempts back to zero.
        const reset = await instructorGrading.resetAttempts();
        expect(reset.status()).toBe(200);
        expect((await instructorSees()).attempts?.current).toBe(0);

        // 4. Delete history: the learner's state on the problem is gone.
        const deleted = await instructorGrading.deleteHistory();
        expect(deleted.status()).toBe(200);
        await expect
          .poll(async () => {
            const state = await instructorSees();
            return { score: state.current_score, attempts: state.attempts };
          })
          .toEqual({ score: null, attempts: null });
        const learnerAfterDelete = await waitForLearnerProgress(
          learner.request,
          config,
          courseKey,
          (p) => learnerEarned(p) === 0,
        );
        expect(
          learnerAfterDelete.satisfied,
          JSON.stringify(learnerEarned(learnerAfterDelete.last)),
        ).toBe(true);
      },
    );
  },
);
