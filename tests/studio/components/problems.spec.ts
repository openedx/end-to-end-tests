import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  fetchContainer,
  fetchXBlock,
  primeCoursewareForLearner,
  publishXBlock,
  type AuthoredProblem,
  type ProblemAnswer,
  type ProblemType,
} from '../../../src/api';
import { submitProblem } from '../../../src/steps';
import { testId } from '../../../src/reporting';

/**
 * The common problem types (TC-00216): multiple choice, checkboxes, dropdown,
 * numerical and text input.
 *
 * Each type is authored and published, then the learner submits the
 * known-correct answer — graded correct — and a wrong one — graded incorrect.
 * Twice: once with the problem written in the editor the "Problem" tile opens
 * (type picker, question, answers, the correct mark, Save), and once seeded as
 * OLX through the API, which keeps the grading check independent of the
 * editor. The picker is also asserted to offer every type.
 */
const TYPES: readonly { type: ProblemType; olxRoot: string }[] = [
  { type: 'multiplechoiceresponse', olxRoot: '<multiplechoiceresponse>' },
  { type: 'choiceresponse', olxRoot: '<choiceresponse>' },
  { type: 'optionresponse', olxRoot: '<optionresponse>' },
  { type: 'numericalresponse', olxRoot: '<numericalresponse' },
  { type: 'stringresponse', olxRoot: '<stringresponse' },
];

/**
 * What the author types into the problem editor for each type, and what a
 * learner then enters. The texts are the test's own data; the editor keys the
 * answers `A`, `B`, `C` in order, which is the order CAPA numbers the choices
 * in (`choice_0`, …).
 */
const EDITED: readonly {
  type: ProblemType;
  /** `rich`: each answer is a TinyMCE field; `plain`: a plain text field. */
  field: 'rich' | 'plain';
  answers: Readonly<Record<string, string>>;
  correctKey: string;
  correct: ProblemAnswer;
  incorrect: ProblemAnswer;
}[] = [
  {
    type: 'multiplechoiceresponse',
    field: 'rich',
    answers: { A: 'E2E single A', B: 'E2E single B', C: 'E2E single C' },
    correctKey: 'B',
    correct: { inputSuffix: '2_1', values: ['choice_1'] },
    incorrect: { inputSuffix: '2_1', values: ['choice_0'] },
  },
  {
    type: 'choiceresponse',
    field: 'rich',
    answers: { A: 'E2E multi A', B: 'E2E multi B', C: 'E2E multi C' },
    // A is correct when the editor opens; C is added to it.
    correctKey: 'C',
    correct: { inputSuffix: '2_1[]', values: ['choice_0', 'choice_2'] },
    incorrect: { inputSuffix: '2_1[]', values: ['choice_1'] },
  },
  {
    type: 'optionresponse',
    field: 'plain',
    answers: { A: 'E2E red', B: 'E2E blue', C: 'E2E green' },
    correctKey: 'B',
    correct: { inputSuffix: '2_1', values: ['E2E blue'] },
    incorrect: { inputSuffix: '2_1', values: ['E2E red'] },
  },
  {
    type: 'numericalresponse',
    field: 'plain',
    answers: { A: '42' },
    correctKey: 'A',
    correct: { inputSuffix: '2_1', values: ['42'] },
    incorrect: { inputSuffix: '2_1', values: ['7'] },
  },
  {
    type: 'stringresponse',
    field: 'plain',
    // The editor opens with two accepted answers.
    answers: { A: 'openedx', B: 'open-edx' },
    correctKey: 'A',
    correct: { inputSuffix: '2_1', values: ['openedx'] },
    incorrect: { inputSuffix: '2_1', values: ['closedx'] },
  },
];

test.describe(
  'Studio common problem types',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'authors each common problem type and the learner is graded on it',
      { tag: '@smoke', annotation: testId('TC-00216') },
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
      'authors each common problem type in the problem editor and the learner is graded on it',
      { annotation: testId('TC-00216') },
      async ({
        page,
        config,
        studioUnitPage,
        studioProblemEditor,
        authoringCourse,
        studioAuthorSession,
        authoringCourseLearner,
      }) => {
        void studioAuthorSession;
        const { courseKey } = authoringCourse;
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E problem-editor ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: EDITED.map(() => ({ blocks: [] })) }] },
        );

        // Author side: one unit per type, each problem written in the editor the
        // "Problem" tile opens — type, question, answers — and saved.
        const problems: AuthoredProblem[] = [];
        for (const [i, authored] of EDITED.entries()) {
          const unitKey = section.units[i]!.usageKey;
          await studioUnitPage.goto(unitKey);
          const tiles = availableComponentTypes(
            await fetchContainer(page.request, config, unitKey),
          );
          const usageKey = await studioUnitPage.addComponentFromTile(tiles.indexOf('problem'));
          await studioProblemEditor.chooseType(authored.type);
          // Known debt in the editor: its TinyMCE fields' frames have no title,
          // and its answer rows carry an ARIA attribute their role does not
          // permit (`aria-prohibited-attr` on `main`; `verawood`'s markup trips
          // `aria-allowed-attr` for the same rows).
          await checkA11y(page, {
            label: 'studio-problem-editor',
            additionalBaseline: ['aria-prohibited-attr', 'aria-allowed-attr', 'frame-title'],
          });
          await studioProblemEditor.setQuestion(`E2E ${authored.type} question`);
          for (const [key, text] of Object.entries(authored.answers)) {
            await studioProblemEditor.setAnswer(key, text, authored.field);
          }
          await studioProblemEditor.markCorrect(authored.correctKey);
          expect((await studioProblemEditor.save()).ok(), `saving ${authored.type}`).toBe(true);

          // What was saved is a problem of this type carrying the typed answers.
          const data = (await fetchXBlock(page.request, config, usageKey)).data ?? '';
          expect(data, `OLX for ${authored.type}`).toContain(`<${authored.type}`);
          for (const text of Object.values(authored.answers)) {
            expect(data, `OLX for ${authored.type}`).toContain(text);
          }
          problems.push({
            usageKey,
            type: authored.type,
            correct: authored.correct,
            incorrect: authored.incorrect,
          });
        }
        await publishXBlock(page.request, config, section.usageKey);

        // Learner side: each published problem grades its right answer correct
        // and a wrong one incorrect.
        const learner = authoringCourseLearner;
        await expect
          .poll(async () => (await learner.outline()).blocks[problems.at(-1)!.usageKey]?.type, {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe('problem');
        await primeCoursewareForLearner(
          learner.request,
          config,
          section.subsections[0]?.usageKey ?? '',
        );
        for (const problem of problems) {
          expect(
            await submitProblem(learner.request, config, courseKey, problem, problem.correct),
            `correct answer for ${problem.type}`,
          ).toBe('correct');
          expect(
            await submitProblem(learner.request, config, courseKey, problem, problem.incorrect),
            `wrong answer for ${problem.type}`,
          ).toBe('incorrect');
        }
      },
    );

    test(
      "the unit page's problem picker offers every common type",
      { tag: '@smoke', annotation: testId('TC-00216') },
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
