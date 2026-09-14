import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  fetchContainer,
  fetchXBlock,
  primeCoursewareForLearner,
  type ProblemType,
} from '../../../src/api';
import { submitProblem } from '../../../src/steps';
import { testId } from '../../../src/reporting';

/**
 * The common problem types (TC-00216): multiple choice, checkboxes, dropdown,
 * numerical and text input.
 *
 * Each type is authored (as the OLX the MFE's problem editor produces) and
 * published, then the learner submits the known-correct answer — graded correct
 * — and a wrong one — graded incorrect. The unit page's problem picker is
 * asserted to offer every type, so an author can add each through the UI; driving
 * the full React problem editor per type is left to the exploratory sheet.
 */
const TYPES: readonly { type: ProblemType; olxRoot: string }[] = [
  { type: 'multiplechoiceresponse', olxRoot: '<multiplechoiceresponse>' },
  { type: 'choiceresponse', olxRoot: '<choiceresponse>' },
  { type: 'optionresponse', olxRoot: '<optionresponse>' },
  { type: 'numericalresponse', olxRoot: '<numericalresponse' },
  { type: 'stringresponse', olxRoot: '<stringresponse' },
];

test.describe(
  'Studio common problem types',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'authors each common problem type and the learner is graded on it',
      { annotation: testId('TC-00216') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        // One unit per type, each holding that problem, published.
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E problems ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: TYPES.map((t) => ({ blocks: [t.type] })) }], publish: true },
        );
        const subsectionKey = section.subsections[0]?.usageKey ?? '';
        await primeCoursewareForLearner(authoringCourseLearner.request, config, subsectionKey);

        for (const [i, { type, olxRoot }] of TYPES.entries()) {
          const block = section.units[i]?.blocks[0];
          if (block?.answers === undefined) throw new Error(`No authored problem for ${type}.`);
          const problem = { usageKey: block.usageKey, type, ...block.answers };

          // Author side: the block's OLX is of this type.
          const data = (await fetchXBlock(page.request, config, block.usageKey)).data ?? '';
          expect(data, `OLX for ${type}`).toContain(olxRoot);

          // Learner side: a correct answer grades correct, a wrong one incorrect.
          expect(
            await submitProblem(
              authoringCourseLearner.request,
              config,
              authoringCourse.courseKey,
              problem,
              problem.correct,
            ),
            `correct answer for ${type}`,
          ).toBe('correct');
          expect(
            await submitProblem(
              authoringCourseLearner.request,
              config,
              authoringCourse.courseKey,
              problem,
              problem.incorrect,
            ),
            `wrong answer for ${type}`,
          ).toBe('incorrect');
        }
      },
    );

    test(
      "the unit page's problem picker offers every common type",
      { annotation: testId('TC-00216') },
      async ({ page, config, studioUnitPage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E problem-picker ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unitKey = section.units[0]?.usageKey ?? '';

        await studioUnitPage.goto(unitKey);
        const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
        await studioUnitPage.openAddComponent(types.indexOf('problem'));

        // The picker lists a radio per common type (values are the OLX response
        // tags). The radios are styled/hidden, so wait for one to attach.
        const radios = page.locator(
          '.pgn__modal input[type="radio"], [role="dialog"] input[type="radio"]',
        );
        await radios.first().waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });
        const offered = await radios.evaluateAll((els) =>
          els.map((e) => (e as HTMLInputElement).value),
        );
        for (const { type } of TYPES) {
          expect(offered, `picker offers ${type}`).toContain(type);
        }
      },
    );
  },
);
