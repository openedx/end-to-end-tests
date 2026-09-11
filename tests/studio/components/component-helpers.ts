import type { APIRequestContext } from '@playwright/test';

import { expect } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  buildSection,
  createXBlock,
  publishXBlock,
  type BlockSpec,
  type CourseOutline,
} from '../../../src/api';

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

/**
 * Creates a component of `category` in a fresh unit, publishes it, and asserts the
 * learner's Blocks API lists it — the round trip every optional component type
 * shares. Returns the new block's usage key.
 */
export async function addComponentAndSeeAsLearner(
  request: APIRequestContext,
  config: Config,
  courseKey: string,
  learner: { outline: () => Promise<CourseOutline> },
  category: string,
  label: string,
): Promise<string> {
  const unitKey = await emptyUnit(request, config, courseKey, label);
  const blockKey = await createXBlock(request, config, {
    parentLocator: unitKey,
    category,
    displayName: `E2E ${category}`,
  });
  await publishXBlock(request, config, unitKey);
  await expect
    .poll(async () => (await learner.outline()).blocks[blockKey]?.type, {
      timeout: TIMEOUTS.contentPublish,
    })
    .toBe(category);
  return blockKey;
}
