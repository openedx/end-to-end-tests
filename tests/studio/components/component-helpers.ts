import type { APIRequestContext } from '@playwright/test';

import { expect } from '../../../src/fixtures';
import type { RoundTripLearner } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  addAdvancedModules,
  advancedComponentTypes,
  availableComponentTypes,
  buildSection,
  fetchContainer,
  fetchContainerChildren,
  type BlockSpec,
} from '../../../src/api';
import type { StudioUnitPage } from '../../../src/pages/studio/unit.page';

type Config = Parameters<typeof buildSection>[1];

/**
 * Builds a section with one unit in `courseKey` and returns the unit key. `label`
 * names the section (a random suffix keeps it unique), `blocks` are the unit's
 * components (default none), and `publish` publishes the unit (default false).
 */
export async function buildUnit(
  request: APIRequestContext,
  config: Config,
  courseKey: string,
  opts: { label?: string; blocks?: readonly BlockSpec[]; publish?: boolean } = {},
): Promise<string> {
  const section = await buildSection(
    request,
    config,
    courseKey,
    `E2E ${opts.label ?? 'unit'} ${Math.random().toString(36).slice(2, 8)}`,
    { subsections: [{ units: [{ blocks: opts.blocks ?? [] }] }], publish: opts.publish ?? false },
  );
  const key = section.units[0]?.usageKey;
  if (key === undefined) throw new Error('The section has no unit.');
  return key;
}

/** Builds a section with one empty unit in `courseKey` and returns the unit key. */
export async function emptyUnit(
  request: APIRequestContext,
  config: Config,
  courseKey: string,
  label: string,
): Promise<string> {
  return buildUnit(request, config, courseKey, { label });
}

/** What {@link listAndAddFromTile} built: the unit, its subsection, and the new block. */
export interface AdvancedTileContext {
  readonly request: APIRequestContext;
  readonly config: AppConfig;
  readonly courseKey: string;
  readonly unitKey: string;
  readonly sequentialKey: string;
  readonly blockKey: string;
  readonly studioUnitPage: StudioUnitPage;
}

/**
 * The Studio half of adding an advanced component the way an author does: a
 * fresh unit, the picker before (absent for an opt-in module, offered for a
 * default one), the module listed in Advanced Settings (through the API — the
 * settings page is TC-00300's), the picker after, and the block added from the
 * unit page's Advanced tile — the UI action — then read back as the unit's child.
 */
export async function listAndAddFromTile(
  author: {
    readonly request: APIRequestContext;
    readonly config: AppConfig;
    readonly studioUnitPage: StudioUnitPage;
  },
  courseKey: string,
  module: { readonly category: string; readonly offeredByDefault: boolean },
  label: string,
): Promise<AdvancedTileContext> {
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

/**
 * The learner half once the unit is published: the learner's Blocks API serves
 * the block as `category`, and the unit renders the block's own root in the
 * courseware — visible, or for a block that is empty until the author gives it
 * content (`rendered: 'attached'`), present in the unit's markup.
 */
export async function expectRenderedForLearner(
  learner: RoundTripLearner,
  ctx: Pick<AdvancedTileContext, 'courseKey' | 'unitKey' | 'sequentialKey' | 'blockKey'>,
  category: string,
  rendered: 'visible' | 'attached' = 'visible',
): Promise<void> {
  await expect
    .poll(async () => (await learner.outline()).blocks[ctx.blockKey]?.type, {
      timeout: TIMEOUTS.contentPublish,
    })
    .toBe(category);
  await learner.prime(ctx.sequentialKey);
  await learner.unitPage.goto(ctx.courseKey, ctx.sequentialKey, ctx.unitKey);
  const root = learner.unitPage.advancedBlock(ctx.blockKey, category).rendered;
  if (rendered === 'visible') await expect(root).toBeVisible();
  else await expect(root).toBeAttached();
}
