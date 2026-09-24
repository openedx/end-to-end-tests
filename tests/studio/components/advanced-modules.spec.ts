import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import {
  ADVANCED_BLOCK_SELECTORS,
  LEGACY_EDITOR_SELECTORS,
  TIMEOUTS,
  advancedBlockRoot,
  type AppConfig,
} from '../../../src/config';
import {
  addAdvancedModules,
  authorHtml,
  authorProblem,
  fetchConditionalContent,
  fetchCourseProgress,
  fetchWordCloudState,
  fetchXBlock,
  advancedComponentTypes,
  availableComponentTypes,
  buildSection,
  fetchContainer,
  fetchContainerChildren,
  publishXBlock,
  updateXBlock,
} from '../../../src/api';
import type { RoundTripLearner } from '../../../src/fixtures';
import type { StudioUnitPage } from '../../../src/pages/studio/unit.page';
import { submitProblem } from '../../../src/steps';
import { testId } from '../../../src/reporting';

/**
 * The legacy XBlock configuration matrix (BTR "STUDIO XBLOCKS"): for each
 * advanced module, list it in the course's Advanced Settings, see the unit
 * page's "Advanced" tile offer it, add it from the tile, and render it for a
 * learner.
 *
 * Every module here ships with edx-platform, so a row whose module is missing
 * **fails** — only modules that already have a capability in the suite carry
 * its tag. Eight modules are offered by the platform without any Advanced
 * Settings entry (`DEFAULT_ADVANCED_MODULES`); for those the row proves listing
 * the module is accepted and the tile still offers it, while the opt-in modules
 * prove the tile gains them. `advanced_modules` is written through the API
 * (TC-00300 covers the settings page itself); the tile is the UI action under
 * test, and the learner's own reading of the block decides the rest.
 *
 * Each row only adds its module to the worker's `advancedModulesCourse`, so
 * "not offered before" holds for it.
 */

interface RowContext {
  readonly request: APIRequestContext;
  readonly config: AppConfig;
  readonly courseKey: string;
  readonly unitKey: string;
  readonly sequentialKey: string;
  readonly blockKey: string;
  readonly studioUnitPage: StudioUnitPage;
}

interface Row<S = unknown> {
  readonly testId: string;
  readonly category: string;
  /** Offered without an Advanced Settings entry (`DEFAULT_ADVANCED_MODULES`). */
  readonly offeredByDefault: boolean;
  readonly tags?: readonly string[];
  /** What the author sets before publishing; its result is handed to the learner half. */
  readonly configure?: (ctx: RowContext) => Promise<S>;
  /** What the learner's rendering and readings must show beyond the block's own root. */
  readonly learnerSees?: (ctx: RowContext, learner: RoundTripLearner, state: S) => Promise<void>;
}

/** Keeps a row's `configure` and `learnerSees` agreeing on the state they share. */
const row = <S>(r: Row<S>): Row => r as unknown as Row;

/** A learner's points on the subsection that holds only the row's block. */
async function subsectionScores(ctx: RowContext, learner: RoundTripLearner) {
  const progress = await fetchCourseProgress(learner.request, ctx.config, ctx.courseKey);
  return progress.subsections.find((sub) => sub.block_key === ctx.sequentialKey)?.problem_scores;
}

const ANNOTATIONS = [
  { title: 'E2E note one', body: 'E2E body one' },
  { title: 'E2E note two', body: 'E2E body two' },
] as const;

const unique = () => Math.random().toString(36).slice(2, 10);

const ROWS: readonly Row[] = [
  row({
    testId: 'TC-00117',
    category: 'annotatable',
    offeredByDefault: false,
    configure: ({ request, config, blockKey }) =>
      updateXBlock(request, config, blockKey, {
        data:
          '<annotatable><instructions><p>E2E instructions</p></instructions><p>' +
          ANNOTATIONS.map(
            (a, i) => `<annotation title="${a.title}" body="${a.body}">E2E span ${i}</annotation>`,
          ).join(' ') +
          '</p></annotatable>',
      }),
    learnerSees: async ({ blockKey }, learner) => {
      const block = learner.unitPage.annotatableBlock(blockKey);
      await expect(block.annotations).toHaveCount(ANNOTATIONS.length);
      for (const [i, annotation] of ANNOTATIONS.entries()) {
        await expect(block.annotations.nth(i)).toHaveAttribute(
          'data-comment-title',
          annotation.title,
        );
        await expect(block.annotations.nth(i)).toHaveAttribute(
          'data-comment-body',
          annotation.body,
        );
      }
    },
  }),
  row({
    testId: 'TC-00118',
    category: 'conditional',
    offeredByDefault: false,
    // Reveals its child once the learner has attempted the source problem.
    configure: async ({ request, config, unitKey, blockKey }) => {
      const source = await authorProblem(
        request,
        config,
        unitKey,
        'multiplechoiceresponse',
        'E2E source',
      );
      await updateXBlock(request, config, blockKey, {
        metadata: { conditional_attr: 'attempted', conditional_value: 'True' },
        fields: { sources_list: [source.usageKey] },
      });
      const revealed = `E2E revealed ${unique()}`;
      await authorHtml(request, config, blockKey, 'E2E child', `<p>${revealed}</p>`);
      return { source, revealed };
    },
    learnerSees: async ({ config, courseKey, blockKey }, learner, { source, revealed }) => {
      const before = await fetchConditionalContent(learner.request, config, courseKey, blockKey);
      expect(before.met).toBe(false);
      expect(before.fragments.join('')).not.toContain(revealed);

      await submitProblem(learner.request, config, courseKey, source, source.incorrect);
      const revealedToLearner = async () => {
        const after = await fetchConditionalContent(learner.request, config, courseKey, blockKey);
        return after.met && after.fragments.join('').includes(revealed);
      };
      await expect.poll(revealedToLearner).toBe(true);
      await learner.page.reload();
      await expect(learner.unitPage.advancedBlock(blockKey, 'conditional').rendered).toContainText(
        revealed,
      );
    },
  }),
  row({
    testId: 'TC-00119',
    category: 'done',
    offeredByDefault: false,
    learnerSees: async (ctx, learner) => {
      const response = await learner.unitPage.doneBlock(ctx.blockKey).toggle();
      expect(response.ok()).toBe(true);
      expect(await response.json()).toEqual({ state: true });
      // The block scores 1 of 1 once marked complete; the grade lands a moment later.
      await expect
        .poll(() => subsectionScores(ctx, learner), { timeout: TIMEOUTS.contentPublish })
        .toEqual([{ earned: 1, possible: 1 }]);
    },
  }),
  row({
    testId: 'TC-00120',
    category: 'google-calendar',
    offeredByDefault: true,
    // The Studio editor saves a calendar of the test's own; nothing loads from Google.
    configure: async ({ request, config, blockKey, studioUnitPage }) => {
      const calendarId = `e2e-${unique()}@group.calendar.google.com`;
      const editor = await studioUnitPage.openLegacyEditor(blockKey);
      await editor.locator(LEGACY_EDITOR_SELECTORS.calendarId).fill(calendarId);
      const saved = await studioUnitPage.saveLegacyEditor(
        editor,
        LEGACY_EDITOR_SELECTORS.calendarSave,
      );
      expect(saved.ok()).toBe(true);
      expect((await fetchXBlock(request, config, blockKey)).metadata.calendar_id).toBe(calendarId);
      return calendarId;
    },
    learnerSees: async ({ blockKey }, learner, calendarId) => {
      const frame = learner.unitPage
        .advancedBlock(blockKey, 'google-calendar')
        .rendered.locator(ADVANCED_BLOCK_SELECTORS.embedFrame);
      await expect(frame).toHaveAttribute('src', new RegExp(`src=${escapeRegExp(calendarId)}`));
    },
  }),
  row({
    testId: 'TC-00121',
    category: 'google-document',
    offeredByDefault: true,
    learnerSees: async ({ blockKey }, learner) => {
      const frame = learner.unitPage
        .advancedBlock(blockKey, 'google-document')
        .rendered.locator(ADVANCED_BLOCK_SELECTORS.embedFrame);
      await expect(frame).toHaveAttribute('src', /^https:\/\//);
    },
  }),
  row({
    testId: 'TC-00124',
    category: 'lti_consumer',
    offeredByDefault: true,
    tags: ['@lti'],
    // Graded, with no tool to launch: the learner is offered its points.
    configure: ({ request, config, blockKey }) =>
      updateXBlock(request, config, blockKey, { metadata: { has_score: true, weight: 5 } }),
    learnerSees: async (ctx, learner) => {
      await expect
        .poll(() => subsectionScores(ctx, learner), { timeout: TIMEOUTS.contentPublish })
        .toEqual([{ earned: 0, possible: 5 }]);
    },
  }),
  row({ testId: 'TC-00125', category: 'poll', offeredByDefault: true, tags: ['@smoke'] }),
  row({
    testId: 'TC-00128',
    category: 'edx_sga',
    offeredByDefault: false,
    tags: ['@edx-sga'],
  }),
  row({ testId: 'TC-00129', category: 'survey', offeredByDefault: true }),
  row({
    testId: 'TC-00133',
    category: 'word_cloud',
    offeredByDefault: true,
    learnerSees: async ({ config, courseKey, blockKey }, learner) => {
      const words = [`e2e${unique()}`, `e2e${unique()}`];
      const response = await learner.unitPage.wordCloudBlock(blockKey).submit(words);
      expect(response.ok()).toBe(true);
      const state = await fetchWordCloudState(learner.request, config, courseKey, blockKey);
      expect(state.submitted).toBe(true);
      expect(Object.keys(state.studentWords).sort()).toEqual([...words].sort());
    },
  }),
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The Studio half every row shares: a fresh unit, the picker before (absent for
 * an opt-in module, offered for a default one), the module listed in Advanced
 * Settings, the picker after, and the block added from the Advanced tile.
 */
async function listAndAddFromTile(
  author: {
    readonly request: APIRequestContext;
    readonly config: AppConfig;
    readonly studioUnitPage: StudioUnitPage;
  },
  courseKey: string,
  module: Pick<Row, 'category' | 'offeredByDefault'>,
  label: string,
): Promise<RowContext> {
  const { request, config, studioUnitPage } = author;
  const section = await buildSection(request, config, courseKey, label, {
    subsections: [{ units: [{ blocks: [] }] }],
  });
  const unit = section.units[0]!;
  const offered = async () =>
    advancedComponentTypes(await fetchContainer(request, config, unit.usageKey));

  expect(
    (await offered()).includes(module.category),
    `${module.category} offered before it is listed`,
  ).toBe(module.offeredByDefault);
  expect(await addAdvancedModules(request, config, courseKey, [module.category])).toContain(
    module.category,
  );
  await expect.poll(offered, { timeout: TIMEOUTS.contentPublish }).toContain(module.category);

  // The UI action: the Advanced tile offers the module and adds it.
  await studioUnitPage.goto(unit.usageKey);
  const tiles = availableComponentTypes(await fetchContainer(request, config, unit.usageKey));
  const blockKey = await studioUnitPage.addAdvancedComponent(
    tiles.indexOf('advanced'),
    module.category,
  );
  const children = await fetchContainerChildren(request, config, unit.usageKey);
  expect(children.map((c) => [c.block_id, c.block_type])).toContainEqual([
    blockKey,
    module.category,
  ]);
  return {
    request,
    config,
    courseKey,
    unitKey: unit.usageKey,
    sequentialKey: unit.sequentialUsageKey,
    blockKey,
    studioUnitPage,
  };
}

test.describe(
  'Advanced component configuration',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    for (const row of ROWS) {
      test(
        `lists ${row.category} in Advanced Settings, adds it from the tile and renders it`,
        { tag: [...(row.tags ?? [])], annotation: testId(row.testId) },
        async (
          {
            page,
            config,
            advancedModulesCourse,
            studioAuthorSession,
            studioUnitPage,
            advancedModulesLearnerLater,
          },
          testInfo,
        ) => {
          void studioAuthorSession;
          const ctx = await listAndAddFromTile(
            { request: page.request, config, studioUnitPage },
            advancedModulesCourse.courseKey,
            row,
            `E2E ${row.category} ${testInfo.testId.slice(-6)}R${testInfo.retry}`,
          );
          const { request, courseKey, blockKey } = ctx;
          const unit = { usageKey: ctx.unitKey, sequentialUsageKey: ctx.sequentialKey };
          const state = await row.configure?.(ctx);
          await publishXBlock(request, config, unit.usageKey);

          // The learner: the block is served, and it renders.
          const learner = await advancedModulesLearnerLater();
          await expect
            .poll(async () => (await learner.outline()).blocks[blockKey]?.type, {
              timeout: TIMEOUTS.contentPublish,
            })
            .toBe(row.category);
          await learner.prime(unit.sequentialUsageKey);
          await learner.unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
          await expect(
            learner.unitPage.advancedBlock(blockKey, row.category).rendered,
          ).toBeVisible();
          await row.learnerSees?.(ctx, learner, state);
        },
      );
    }

    // The recommender loads jQuery UI and intro.js from third-party CDNs
    // (XBLOCK-001), so its rendering is judged in the Studio preview, where the
    // block's own markup is server-rendered, not in the learner's courseware.
    test(
      'lists recommender in Advanced Settings, adds it from the tile and previews it',
      { annotation: testId('TC-00131') },
      async (
        { page, config, advancedModulesCourse, studioAuthorSession, studioUnitPage },
        testInfo,
      ) => {
        void studioAuthorSession;
        const { unitKey, blockKey } = await listAndAddFromTile(
          { request: page.request, config, studioUnitPage },
          advancedModulesCourse.courseKey,
          { category: 'recommender', offeredByDefault: false },
          `E2E recommender ${testInfo.testId.slice(-6)}R${testInfo.retry}`,
        );
        await studioUnitPage.goto(unitKey);
        await expect(
          studioUnitPage.component(blockKey).locator(advancedBlockRoot('recommender')),
        ).toBeAttached();
      },
    );
  },
);
