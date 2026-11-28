import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { LEGACY_EDITOR_SELECTORS, TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  createXBlock,
  fetchContainer,
  fetchPollResults,
  fetchSurveyResults,
  publishXBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Using a poll and a survey (xblock-poll): the author writes a poll in the
 * block's own Studio editor — and adds a survey from the Advanced tile and
 * rewrites a question there — and a learner votes in the courseware. The block's
 * `get_results` handler, read as the learner, decides whether the vote was
 * recorded against the answer they chose. Answers are identified by their keys
 * (R/B/G/O for a poll, Y/N/M for a survey) — course content, not copy.
 */
test.describe(
  'Poll and survey components',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'an author writes a poll and a learner votes in it',
      { annotation: testId('TC-00126') },
      async (
        { page, config, contentCourse, studioAuthorSession, studioUnitPage, roundTripLearnerLater },
        testInfo,
      ) => {
        void studioAuthorSession;
        const request = page.request;
        const { courseKey } = contentCourse;
        const section = await buildSection(
          request,
          config,
          courseKey,
          `E2E poll ${testInfo.testId.slice(-6)}R${testInfo.retry}`,
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unit = section.units[0]!;
        const pollKey = await createXBlock(request, config, {
          parentLocator: unit.usageKey,
          category: 'poll',
          displayName: 'E2E poll',
        });
        const question = `E2E question ${Math.random().toString(36).slice(2, 8)}?`;

        await studioUnitPage.goto(unit.usageKey);
        const editor = await studioUnitPage.openLegacyEditor(pollKey);
        await checkA11y(page, {
          label: 'studio-poll-editor',
          include: LEGACY_EDITOR_SELECTORS.frame,
        });
        await editor.locator(LEGACY_EDITOR_SELECTORS.pollQuestion).fill(question);
        await editor.locator(LEGACY_EDITOR_SELECTORS.pollAnswerLabel('B')).fill('E2E answer B');
        const saved = await studioUnitPage.saveLegacyEditor(
          editor,
          LEGACY_EDITOR_SELECTORS.pollSave,
        );
        expect(saved.ok()).toBe(true);
        await publishXBlock(request, config, unit.usageKey);

        const learner = await roundTripLearnerLater();
        await expect
          .poll(async () => (await learner.outline()).blocks[pollKey]?.type, {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe('poll');
        await learner.prime(unit.sequentialUsageKey);
        await learner.unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
        const poll = learner.unitPage.pollBlock(pollKey, 'poll');
        await poll.choose('B');
        const vote = await poll.submit();
        expect(await vote.json()).toMatchObject({ success: true });

        const results = await fetchPollResults(learner.request, config, courseKey, pollKey);
        expect(results.question).toContain(question);
        expect(results.total).toBe(1);
        expect(results.tally.find((t) => t.key === 'B')?.count).toBe(1);
      },
    );

    test(
      'an author adds and edits a survey and a learner answers every question',
      { tag: '@smoke', annotation: testId('TC-00130') },
      async (
        { page, config, contentCourse, studioAuthorSession, studioUnitPage, roundTripLearnerLater },
        testInfo,
      ) => {
        void studioAuthorSession;
        const request = page.request;
        const { courseKey } = contentCourse;
        const section = await buildSection(
          request,
          config,
          courseKey,
          `E2E survey ${testInfo.testId.slice(-6)}R${testInfo.retry}`,
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unit = section.units[0]!;

        // The author adds the survey from the unit page's Advanced tile…
        await studioUnitPage.goto(unit.usageKey);
        const tiles = availableComponentTypes(await fetchContainer(request, config, unit.usageKey));
        const surveyKey = await studioUnitPage.addAdvancedComponent(
          tiles.indexOf('advanced'),
          'survey',
        );
        expect(surveyKey).toContain('type@survey+');

        // …and rewrites one of its default questions in the block's own editor.
        const question = `E2E survey question ${Math.random().toString(36).slice(2, 8)}?`;
        const editor = await studioUnitPage.openLegacyEditor(surveyKey);
        await checkA11y(page, {
          label: 'studio-survey-editor',
          include: LEGACY_EDITOR_SELECTORS.frame,
        });
        await editor.locator(LEGACY_EDITOR_SELECTORS.surveyQuestionLabel('enjoy')).fill(question);
        const saved = await studioUnitPage.saveLegacyEditor(
          editor,
          LEGACY_EDITOR_SELECTORS.pollSave,
        );
        expect(saved.ok()).toBe(true);
        await publishXBlock(request, config, unit.usageKey);
        // The survey's default questions and answers, by key.
        const answers = { enjoy: 'Y', recommend: 'N', learn: 'M' } as const;

        const learner = await roundTripLearnerLater();
        await expect
          .poll(async () => (await learner.outline()).blocks[surveyKey]?.type, {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe('survey');
        await learner.prime(unit.sequentialUsageKey);
        await learner.unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
        const survey = learner.unitPage.pollBlock(surveyKey, 'survey');
        for (const [key, answer] of Object.entries(answers)) {
          await survey.answer(key, answer);
        }
        const vote = await survey.submit();
        expect(await vote.json()).toMatchObject({ success: true });

        // The learner's survey is the edited one, with their answers recorded.
        const results = await fetchSurveyResults(learner.request, config, courseKey, surveyKey);
        expect(results.find((q) => q.key === 'enjoy')?.label).toContain(question);
        expect(
          Object.fromEntries(
            results.map((q) => [q.key, q.answers.filter((a) => a.count > 0).map((a) => a.key)]),
          ),
        ).toEqual({ enjoy: ['Y'], recommend: ['N'], learn: ['M'] });
      },
    );
  },
);
