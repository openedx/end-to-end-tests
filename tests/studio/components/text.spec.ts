import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  fetchContainer,
  fetchContainerChildren,
  fetchXBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Authoring a text component in the TinyMCE editor (TC-00217), covering a
 * representative set of its formatting via keyboard shortcuts (TC-00218 is an
 * exploratory "test all features" case — a representative set is covered here).
 *
 * Formatting is applied by keyboard shortcut, and the assertion is the saved OLX
 * HTML — `<strong>` and `<em>` — plus the block rendering that markup for the
 * learner. Toolbar labels (localized) are never matched.
 */
test.describe(
  'Studio text component',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'authors bold and italic text in the editor',
      { annotation: [testId('TC-00217'), testId('TC-00218')] },
      async ({
        page,
        config,
        studioUnitPage,
        studioTextEditor,
        authoringCourse,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const unitKey = await emptyUnit(page.request, config, authoringCourse.courseKey);

        await studioUnitPage.goto(unitKey);
        const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
        await studioUnitPage.openAddComponent(types.indexOf('html'));
        await studioTextEditor.chooseTemplate('html');

        await studioTextEditor.type('E2E plain ');
        await studioTextEditor.bold();
        await studioTextEditor.type('bold');
        await studioTextEditor.bold();
        await studioTextEditor.type(' ');
        await studioTextEditor.italic();
        await studioTextEditor.type('italic');
        await studioTextEditor.save();

        const components = await fetchContainerChildren(page.request, config, unitKey);
        const html = components.find((c) => c.block_type === 'html');
        expect(html).toBeDefined();
        const data = (await fetchXBlock(page.request, config, html?.block_id ?? '')).data ?? '';
        expect(data).toContain('<strong>bold</strong>');
        expect(data).toContain('<em>italic</em>');
        expect(data).toContain('E2E plain');
      },
    );
  },
);

async function emptyUnit(
  request: APIRequestContext,
  config: Parameters<typeof buildSection>[1],
  courseKey: string,
): Promise<string> {
  const section = await buildSection(
    request,
    config,
    courseKey,
    `E2E text ${Math.random().toString(36).slice(2, 8)}`,
    { subsections: [{ units: [{ blocks: [] }] }] },
  );
  const key = section.units[0]?.usageKey;
  if (key === undefined) throw new Error('The section has no unit.');
  return key;
}
