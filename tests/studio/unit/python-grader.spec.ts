import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchXBlock, primeCoursewareForLearner } from '../../../src/api';
import { submitProblem } from '../../../src/steps';
import { testId } from '../../../src/reporting';

/**
 * A custom Python-graded problem (TC-00203): a `<script type="loncapa/python">`
 * grader whose learner submission is scored by executing author-supplied Python.
 *
 * Gated on `@codejail`: scoring such a problem runs the script in the codejail
 * sandbox, and a default Open edX install has no working one. Without one, the
 * check answers with no grade: edx-codejail either refuses to run the script
 * ("safe_exec has not been configured for Python") or its jailed subprocess
 * fails, as on a stock Tutor install. The problem is
 * authored as OLX through the xblock API, like the common types in
 * `tests/studio/components/problems.spec.ts`. The grader computes the answer, so
 * a correct grade shows that the sandbox ran the script rather than a string
 * match.
 */
test.describe(
  'Studio custom Python grader',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning', '@codejail'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'grades a custom Python problem a learner submits',
      { annotation: testId('TC-00203') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E python grader ${test.info().testId.slice(-6)}`,
          {
            subsections: [{ units: [{ blocks: [{ problem: 'customresponse' }] }] }],
            publish: true,
          },
        );
        const block = section.units[0]?.blocks[0];
        if (block?.answers === undefined) throw new Error('No authored Python-graded problem.');
        const problem = {
          usageKey: block.usageKey,
          type: 'customresponse' as const,
          ...block.answers,
        };
        await primeCoursewareForLearner(
          authoringCourseLearner.request,
          config,
          section.subsections[0]?.usageKey ?? '',
        );

        // Author side: the block's OLX carries the Python grader.
        const data = (await fetchXBlock(page.request, config, block.usageKey)).data ?? '';
        expect(data).toContain('<script type="loncapa/python">');
        expect(data).toContain('<customresponse cfn="e2e_check"');

        // Learner side: the sandbox scores the right answer correct and a wrong one incorrect.
        expect(
          await submitProblem(
            authoringCourseLearner.request,
            config,
            authoringCourse.courseKey,
            problem,
            problem.correct,
          ),
        ).toBe('correct');
        expect(
          await submitProblem(
            authoringCourseLearner.request,
            config,
            authoringCourse.courseKey,
            problem,
            problem.incorrect,
          ),
        ).toBe('incorrect');
      },
    );
  },
);
