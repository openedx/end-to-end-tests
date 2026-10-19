/*
 * Problem: learner controls in each runtime (asset channel A).
 *
 * Every button here is wired up by `ProblemBlockDisplay.js` — the webpack bundle
 * xblocks-core builds into `xblock_problem/public/` and each runtime serves via
 * `runtime.local_resource_url`. If that bundle is missing or mis-served, none of
 * these controls do anything. Runs once per runtime (LMS learner, Studio unit
 * preview, library preview); see `openProblem` in `./problem-runtimes.ts` for
 * how each is authored and opened.
 *
 * The problem: multiple choice (B correct), two demand hints, a solution;
 * showanswer=always, show_reset_button=true, max_attempts=10 (so Save shows).
 *
 * Steps, after opening the problem:
 *  1. Click Hint: `hint_button` 2xx; the hint notification shows hint 1.
 *  2. Pick the wrong choice and click Save: `problem_save` 2xx; the save
 *     notification shows.
 *  3. Submit: `problem_check` says "incorrect"; the choice is marked incorrect.
 *  4. Click Reset: `problem_reset` 2xx; the incorrect mark is gone and no choice
 *     is selected.
 *  5. Pick the right choice and Submit: `problem_check` says "correct"; the
 *     choice is marked correct.
 *  6. Click Show Answer: `problem_show` 2xx; the solution text shows.
 */
import { expect, test } from '../../../../src/fixtures';
import { TIMEOUTS } from '../../../../src/config';
import { PROBLEM_TAGS, openProblem, type ProblemRuntime } from './problem-runtimes';

const BODY =
  `<multiplechoiceresponse><label>Which is right?</label>` +
  `<choicegroup type="MultipleChoice">` +
  `<choice correct="false">E2E wrong</choice><choice correct="true">E2E right</choice>` +
  `</choicegroup></multiplechoiceresponse>` +
  `<solution><div class="detailed-solution"><p>E2E solution text</p></div></solution>` +
  `<demandhint><hint>E2E hint one</hint><hint>E2E hint two</hint></demandhint>`;

const SETTINGS = { showanswer: 'always', show_reset_button: true, max_attempts: 10 };

const RUNTIMES: readonly ProblemRuntime[] = ['lms', 'studio', 'library'];

test.describe('xblocks-core: Problem controls', { tag: [...PROBLEM_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  for (const runtime of RUNTIMES) {
    test(`hint, save, submit, reset, show answer (${runtime})`, async ({
      page,
      config,
      studioAuthorSession,
      resyncStudioAuthor,
      contentCourse,
      roundTripLearnerLater,
      studioUnitPage,
    }, testInfo) => {
      void studioAuthorSession;
      const fx = {
        page,
        config,
        resyncStudioAuthor,
        contentCourse,
        roundTripLearnerLater,
        studioUnitPage,
      };
      const { problem } = await openProblem(runtime, fx, testInfo, {
        body: BODY,
        settings: SETTINGS,
      });
      const { root } = problem;
      await expect(problem.radios).toHaveCount(2);

      // 1. Hint.
      await problem.hint();
      await expect(root.locator('.notification-hint')).toBeVisible();
      await expect(root.locator('.notification-hint')).toContainText('E2E hint one');

      // 2. Save.
      await problem.radios.nth(0).check();
      await problem.save();
      await expect(root.locator('.notification-save')).toBeVisible();

      // 3. Submit wrong.
      expect((await problem.submit()).success).toBe('incorrect');
      await expect(root.locator('.choicegroup_incorrect')).toHaveCount(1);

      // 4. Reset.
      await problem.reset();
      await expect(root.locator('.choicegroup_incorrect')).toHaveCount(0);
      await expect(root.locator('input[type="radio"]:checked')).toHaveCount(0);

      // 5. Submit right.
      await problem.radios.nth(1).check();
      expect((await problem.submit()).success).toBe('correct');
      await expect(root.locator('.choicegroup_correct')).toHaveCount(1);

      // 6. Show answer.
      await problem.showAnswer();
      await expect(root.getByText('E2E solution text')).toBeVisible();
    });
  }
});
