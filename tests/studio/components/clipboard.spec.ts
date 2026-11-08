import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { copyToClipboard, fetchContainerChildren, type Clipboard } from '../../../src/api';
import { knownGap, testId } from '../../../src/reporting';
import { buildUnit } from './component-helpers';

/**
 * Copying a component from the unit page and pasting it into the same unit
 * (TC-00222).
 *
 * The case's copy is the component's own three-dot menu → "Copy to Clipboard",
 * inside the unit's component iframe. That menu is intermittently cut off by the
 * iframe, its items covered and unclickable (`STUDIO-013`), so the menu path is
 * held (`fixme`) and the paste half is reached by staging the copy through the
 * content-staging API (`copyToClipboard`, the endpoint the menu's copy ends in).
 * The unit page's "Paste component" button then inserts a copy, and the unit
 * holds a second component of the same type.
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
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'comp-clip',
          blocks: ['html'],
        });

        const before = await fetchContainerChildren(page.request, config, unitKey);
        expect(before).toHaveLength(1);
        const componentKey = before[0]?.block_id ?? '';

        // Stage the component on the clipboard (the menu's copy is STUDIO-013's),
        // then paste it through the unit page.
        await copyToClipboard(page.request, config, componentKey);
        await studioUnitPage.goto(unitKey);
        await studioUnitPage.pasteComponent();

        const after = await fetchContainerChildren(page.request, config, unitKey);
        expect(after).toHaveLength(2);
        expect(after.map((c) => c.block_type)).toEqual(['html', 'html']);
      },
    );

    // STUDIO-013: the menu is intermittently clipped by the unit iframe (its
    // dropdown-resize message is never sent), so a run passes or fails by chance.
    test.fixme(
      'copies a component to the clipboard from its menu',
      {
        annotation: [
          testId('TC-00222'),
          knownGap(
            'STUDIO-013: the component’s three-dot menu inside the unit iframe is intermittently clipped, so Copy to Clipboard cannot be clicked',
          ),
        ],
      },
      async ({ page, config, studioUnitPage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'comp-copy',
          blocks: ['html'],
        });
        const [component] = await fetchContainerChildren(page.request, config, unitKey);

        await studioUnitPage.goto(unitKey);
        const copied = await studioUnitPage.copyComponentToClipboard(component?.block_id ?? '');
        expect(copied.ok()).toBe(true);
        expect(((await copied.json()) as Clipboard).source_usage_key).toBe(component?.block_id);
      },
    );
  },
);
