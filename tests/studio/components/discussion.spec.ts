import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchXBlock } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Toggling discussions on a unit (TC-00219).
 *
 * The author toggles "Enable discussion" on the unit's Settings tab. On this
 * install discussion is **enabled by default** (`discussion_enabled` is unset,
 * meaning on), so the control is proven by turning it **off** — which stores
 * `discussion_enabled: false` — and back **on**. The learner-facing discussion
 * block needs the discussions service, gated by `@discussions`.
 */
test.describe(
  'Studio unit discussion',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning', '@discussions'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'enables a discussion on a unit',
      { annotation: testId('TC-00219') },
      async ({ page, config, studioUnitPage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const unitKey = await unit(page.request, config, authoringCourse.courseKey);

        await studioUnitPage.goto(unitKey);

        // Off: the flag is stored false.
        await studioUnitPage.setDiscussionEnabled(false);
        expect(
          (await fetchXBlock(page.request, config, unitKey)).metadata['discussion_enabled'],
        ).toBe(false);

        // On again: no longer disabled (default-on, so the flag clears or is true).
        await studioUnitPage.setDiscussionEnabled(true);
        expect(
          (await fetchXBlock(page.request, config, unitKey)).metadata['discussion_enabled'],
        ).not.toBe(false);
      },
    );
  },
);

async function unit(
  request: APIRequestContext,
  config: Parameters<typeof buildSection>[1],
  courseKey: string,
): Promise<string> {
  const section = await buildSection(
    request,
    config,
    courseKey,
    `E2E disc ${Math.random().toString(36).slice(2, 8)}`,
    { subsections: [{ units: [{ blocks: ['html'] }] }] },
  );
  const key = section.units[0]?.usageKey;
  if (key === undefined) throw new Error('The section has no unit.');
  return key;
}
