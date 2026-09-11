import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, copyToClipboard, fetchContainerChildren } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Copying a component from the unit page and pasting it into the same unit
 * (TC-00222).
 *
 * The copy is staged through the content-staging API (`copyToClipboard`, the
 * endpoint the component's "Copy to Clipboard" calls); the in-iframe copy control
 * lives in the legacy container view and does not fire the write under Playwright
 * on this release. The unit page's "Paste component" button then inserts a copy,
 * and the unit holds a second component of the same type.
 */
test.describe(
  'Studio component clipboard',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'copies a component and pastes it into the unit',
      { annotation: testId('TC-00222') },
      async ({ page, config, studioUnitPage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const unitKey = await unitWithHtml(page.request, config, authoringCourse.courseKey);

        const before = await fetchContainerChildren(page.request, config, unitKey);
        expect(before).toHaveLength(1);
        const componentKey = before[0]?.block_id ?? '';

        // Stage the component on the clipboard, then paste it through the unit page.
        await copyToClipboard(page.request, config, componentKey);
        await studioUnitPage.goto(unitKey);
        await studioUnitPage.pasteComponent();

        const after = await fetchContainerChildren(page.request, config, unitKey);
        expect(after).toHaveLength(2);
        expect(after.map((c) => c.block_type)).toEqual(['html', 'html']);
      },
    );
  },
);

async function unitWithHtml(
  request: APIRequestContext,
  config: Parameters<typeof buildSection>[1],
  courseKey: string,
): Promise<string> {
  const section = await buildSection(
    request,
    config,
    courseKey,
    `E2E comp-clip ${Math.random().toString(36).slice(2, 8)}`,
    { subsections: [{ units: [{ blocks: ['html'] }] }] },
  );
  const key = section.units[0]?.usageKey;
  if (key === undefined) throw new Error('The section has no unit.');
  return key;
}
