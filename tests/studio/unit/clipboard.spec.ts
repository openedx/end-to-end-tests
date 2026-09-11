import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchContainerChildren, fetchXBlockOutline } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Copying a unit from the unit page and pasting it as a new unit (TC-00204).
 *
 * The unit page's Item Menu "Copy to Clipboard" stages the unit on the
 * server-side clipboard; "Paste as new unit" inserts a copy into the same
 * subsection. The pasted unit is a vertical with the source's component types.
 */
test.describe(
  'Studio unit page clipboard',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'copies a unit from the unit page and pastes it as a new unit',
      { annotation: testId('TC-00204') },
      async ({ page, config, studioUnitPage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E unit-clip ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html', 'multiplechoiceresponse'] }] }] },
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const subsectionKey = section.subsections[0]?.usageKey ?? '';
        const sourceTypes = section.units[0]?.blocks.map((b) => b.type) ?? [];

        await studioUnitPage.goto(unitKey);
        await studioUnitPage.copyToClipboard();
        const pastedKey = await studioUnitPage.pasteAsNewUnit();

        expect(pastedKey).not.toBe(unitKey);
        expect((await fetchXBlockOutline(page.request, config, pastedKey)).category).toBe(
          'vertical',
        );
        const subsection = await fetchXBlockOutline(page.request, config, subsectionKey);
        expect(subsection.child_info?.children.map((c) => c.id)).toContain(pastedKey);
        const components = await fetchContainerChildren(page.request, config, pastedKey);
        expect(components.map((c) => c.block_type)).toEqual(sourceTypes);
      },
    );
  },
);
