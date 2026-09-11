import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchContainerChildren, fetchXBlockOutline } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Copying a unit and pasting it into another course through the outline
 * (TC-00175).
 *
 * Both actions are driven through the outline: the source unit's 3-dot menu
 * "Copy to clipboard" (shown once the unit is published) stages it on the
 * server-side clipboard, and the destination course's "Paste unit" button inserts
 * it. The destination gains a unit with the same component types as the source.
 * No browser clipboard permission is involved — the clipboard is server-side.
 */
test.describe(
  'Course outline clipboard',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'copies a unit and pastes it into another course',
      { annotation: testId('TC-00175') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        futureCourse,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        // Source: a unit with a text and a problem block, in the content course.
        const source = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `E2E clip-src ${test.info().testId.slice(-6)}`,
          {
            subsections: [{ units: [{ blocks: ['html', 'multiplechoiceresponse'] }] }],
            publish: true,
          },
        );
        const sourceUnitKey = source.units[0]?.usageKey ?? '';
        const sourceTypes = source.units[0]?.blocks.map((b) => b.type) ?? [];

        // Destination: a subsection in the (separate) future course with one
        // placeholder unit, so its card is locatable by that unit's key.
        const dest = await buildSection(
          page.request,
          config,
          futureCourse.courseKey,
          `E2E clip-dst ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }] },
        );
        const destSubsectionKey = dest.subsections[0]?.usageKey ?? '';
        const destAnchorUnitKey = dest.units[0]?.usageKey ?? '';

        // Copy the source unit through its outline 3-dot menu.
        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.copyUnitToClipboard(
          studioCourseOutlinePage.unit(sourceUnitKey),
        );

        // Paste it into the destination course through the outline.
        await studioCourseOutlinePage.goto(futureCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        const destUnitKey = await studioCourseOutlinePage.pasteUnit(
          studioCourseOutlinePage.subsection(destAnchorUnitKey).first(),
        );

        // The pasted unit is a vertical under the destination subsection with the
        // same component types as the source.
        const pasted = await fetchXBlockOutline(page.request, config, destUnitKey);
        expect(pasted.category).toBe('vertical');
        const destParent = await fetchXBlockOutline(page.request, config, destSubsectionKey);
        expect(destParent.child_info?.children.map((c) => c.id)).toContain(destUnitKey);
        const components = await fetchContainerChildren(page.request, config, destUnitKey);
        expect(components.map((c) => c.block_type)).toEqual(sourceTypes);
      },
    );
  },
);
