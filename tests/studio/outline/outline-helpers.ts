import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, type AuthoredSection } from '../../../src/api';

/** Returns the sole element of `items`, or throws naming `what` and the actual count. */
export function only<T>(items: readonly T[], what = 'item'): T {
  const [first] = items;
  if (first === undefined || items.length !== 1) {
    throw new Error(`Expected exactly one ${what}, found ${items.length}.`);
  }
  return first;
}

/** The usage key of the single unit the default outline shape puts in a section. */
export function firstUnitKey(section: AuthoredSection): string {
  return only(section.units, 'unit').usageKey;
}

/** Polls the learner's Blocks API until the unit is present (default) or absent. */
export async function learnerSees(
  learner: { outline: () => Promise<{ units: readonly { id: string }[] }> },
  unitKey: string,
  present = true,
): Promise<void> {
  await expect
    .poll(async () => (await learner.outline()).units.some((u) => u.id === unitKey), {
      timeout: TIMEOUTS.contentPublish,
    })
    .toBe(present);
}

/**
 * Builds a one-subsection, one-unit HTML section named `E2E <tag> <testId>` in
 * `courseKey` — the draft (or, with `publish`, published) shape the outline specs
 * arrange through the API before driving the UI.
 */
export function buildHtmlSection(
  request: Parameters<typeof buildSection>[0],
  config: Parameters<typeof buildSection>[1],
  courseKey: string,
  tag: string,
  opts: { publish?: boolean } = {},
): Promise<AuthoredSection> {
  return buildSection(request, config, courseKey, `E2E ${tag} ${test.info().testId.slice(-6)}`, {
    subsections: [{ units: [{ blocks: ['html'] }] }],
    publish: opts.publish ?? false,
  });
}
