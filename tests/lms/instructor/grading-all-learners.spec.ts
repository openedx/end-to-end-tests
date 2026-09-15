import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchLearnerProblem, type QueuedGradingTask } from '../../../src/api';
import { submitProblem, waitForInstructorTask } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_TAGS, label } from './helpers';

/**
 * All-learner grading (TC-00523): rescore every submission, then reset every
 * learner's attempts, on a problem two learners have answered wrong. Both are
 * background tasks; the outcome is read per learner once the task list clears.
 */
test.describe(
  'Instructor dashboard grading — all learners',
  { tag: ['@regression', ...INSTRUCTOR_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'rescores and resets attempts for every learner on a problem',
      { annotation: testId('TC-00523') },
      async ({
        page,
        config,
        contentCourse,
        instructorGrading,
        roundTripLearners,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const courseKey = contentCourse.courseKey;
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          label('grade-all', test.info().testId),
          {
            subsections: [
              { gradedAs: 'Homework', units: [{ blocks: ['multiplechoiceresponse'] }] },
            ],
            publish: true,
          },
        );
        const block = section.blocks.find((b) => b.type === 'problem');
        if (block?.answers === undefined) throw new Error('The section has no problem block.');
        const problem = {
          usageKey: block.usageKey,
          type: 'multiplechoiceresponse' as const,
          ...block.answers,
        };
        const subsectionKey = section.subsections[0]?.usageKey ?? '';
        for (const learner of roundTripLearners) {
          await learner.prime(subsectionKey);
          expect(
            await submitProblem(learner.request, config, courseKey, problem, problem.incorrect),
          ).toBe('incorrect');
        }
        const states = () =>
          Promise.all(
            roundTripLearners.map((l) =>
              fetchLearnerProblem(
                page.request,
                config,
                courseKey,
                problem.usageKey,
                l.identity.username,
              ),
            ),
          );

        await instructorGrading.gotoTab(courseKey);
        await instructorGrading.selectScope('all');
        await instructorGrading.specifyProblem(problem.usageKey);

        const rescore = await instructorGrading.rescoreAll();
        expect(rescore.status()).toBe(202);
        expect(((await rescore.json()) as QueuedGradingTask).task_id).toBeTruthy();
        const rescored = await waitForInstructorTask(page.request, config, courseKey, {
          taskType: 'rescore_problem',
          reading: states,
          settled: (all) =>
            all.every((s) => s.current_score?.score === 0 && s.attempts?.current === 1),
        });
        expect(rescored.satisfied, JSON.stringify(rescored.last)).toBe(true);

        const reset = await instructorGrading.resetAllAttempts();
        expect([200, 202]).toContain(reset.status());
        const resetDone = await waitForInstructorTask(page.request, config, courseKey, {
          taskType: 'reset_problem_attempts',
          reading: states,
          settled: (all) => all.every((s) => s.attempts?.current === 0),
        });
        expect(resetDone.satisfied, JSON.stringify(resetDone.last)).toBe(true);
      },
    );
  },
);
