import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  addAdvancedModules,
  advancedComponentTypes,
  availableComponentTypes,
  buildSection,
  fetchContainer,
  fetchContainerChildren,
  publishXBlock,
  updateXBlock,
} from '../../../src/api';
import type { RoundTripLearner } from '../../../src/fixtures';
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
  readonly blockKey: string;
}

interface Row {
  readonly testId: string;
  readonly category: string;
  /** Offered without an Advanced Settings entry (`DEFAULT_ADVANCED_MODULES`). */
  readonly offeredByDefault: boolean;
  readonly tags?: readonly string[];
  /** Fields the author sets before publishing. */
  readonly configure?: (ctx: RowContext) => Promise<unknown>;
  /** What the learner's rendering must show beyond the block's own root. */
  readonly learnerSees?: (ctx: RowContext, learner: RoundTripLearner) => Promise<void>;
}

const ANNOTATIONS = [
  { title: 'E2E note one', body: 'E2E body one' },
  { title: 'E2E note two', body: 'E2E body two' },
] as const;

const ROWS: readonly Row[] = [
  {
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
  },
  {
    testId: 'TC-00128',
    category: 'edx_sga',
    offeredByDefault: false,
    tags: ['@edx-sga'],
  },
  { testId: 'TC-00129', category: 'survey', offeredByDefault: true },
];

test.describe(
  'Advanced component configuration',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    for (const row of ROWS) {
      test(
        `lists ${row.category} in Advanced Settings, adds it from the tile and renders it for a learner`,
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
          const request = page.request;
          const { courseKey } = advancedModulesCourse;
          const section = await buildSection(
            request,
            config,
            courseKey,
            `E2E ${row.category} ${testInfo.testId.slice(-6)}R${testInfo.retry}`,
            { subsections: [{ units: [{ blocks: [] }] }] },
          );
          const unit = section.units[0]!;
          const offered = async () =>
            advancedComponentTypes(await fetchContainer(request, config, unit.usageKey));

          // Before: an opt-in module is not offered; a default one already is.
          expect(
            (await offered()).includes(row.category),
            `${row.category} offered before it is listed`,
          ).toBe(row.offeredByDefault);

          expect(await addAdvancedModules(request, config, courseKey, [row.category])).toContain(
            row.category,
          );
          await expect.poll(offered, { timeout: TIMEOUTS.contentPublish }).toContain(row.category);

          // The UI action: the Advanced tile offers the module and adds it.
          await studioUnitPage.goto(unit.usageKey);
          const tiles = availableComponentTypes(
            await fetchContainer(request, config, unit.usageKey),
          );
          const blockKey = await studioUnitPage.addAdvancedComponent(
            tiles.indexOf('advanced'),
            row.category,
          );
          const children = await fetchContainerChildren(request, config, unit.usageKey);
          expect(children.map((c) => [c.block_id, c.block_type])).toContainEqual([
            blockKey,
            row.category,
          ]);

          const ctx: RowContext = { request, config, courseKey, blockKey };
          await row.configure?.(ctx);
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
          await row.learnerSees?.(ctx, learner);
        },
      );
    }
  },
);
