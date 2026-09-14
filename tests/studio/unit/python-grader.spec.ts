import { test } from '../../../src/fixtures';
import { issue, testId } from '../../../src/reporting';

/**
 * A custom Python-graded problem (TC-00203) — a `<script type="loncapa/python">`
 * grader whose learner submission is scored by executing author-supplied Python.
 *
 * Declared `fixme`: grading such a problem requires the `codejail` sandbox
 * (`CODE_JAIL`/`ENABLE_CODEJAIL`), which is not part of a default Open edX install
 * and is out of scope for this epic — authoring the block would round-trip, but
 * the learner-side grade the round trip asserts on cannot be produced without the
 * sandbox. Recorded so the case is visible in coverage and picked up when a target
 * that ships codejail is in scope.
 */
test.describe(
  'Studio custom Python grader',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.fixme(
      'grades a custom Python problem a learner submits (needs codejail)',
      {
        annotation: [
          testId('TC-00203'),
          issue('https://github.com/openedx/end-to-end-tests/issues/39'),
        ],
      },
      () => {
        // Intentionally empty until a target with the codejail sandbox is covered.
      },
    );
  },
);
