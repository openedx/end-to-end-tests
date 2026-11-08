import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchXBlockOutline, courseUsageKey } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Reordering sections (TC-00168), subsections (TC-00169) and units (TC-00170) in
 * the outline by drag-and-drop.
 *
 * Each card is dragged down past its sibling with dnd-kit's keyboard sensor (its
 * own drag handle, Space, ArrowDown, Space — `reorderByKeyboard`), the platform's
 * `child_info.children` order is the outcome, and the card menu's "Move up" — the
 * other affordance, sending the same `PUT /xblock/<parent> {children}` — then
 * restores the order as a cross-check.
 */
test.describe(
  'Course outline reorder',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'reorders sections',
      { annotation: testId('TC-00168') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        // Two sections of this test's own, found by their (test-owned) titles.
        const label = `E2E reord-sec ${test.info().testId.slice(-6)}`;
        const first = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `${label} A`,
          shape(),
        );
        const second = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `${label} B`,
          shape(),
        );
        const [firstKey, secondKey] = [first.usageKey, second.usageKey];

        // Order before: A precedes B under the course.
        expect(
          await siblingOrder(page, config, courseUsageKey(contentCourse.courseKey), [
            firstKey,
            secondKey,
          ]),
        ).toEqual([firstKey, secondKey]);

        // Collapsed, so the Arrow can only land on sections, not on A's own
        // subsections (dnd-kit moves to the nearest droppable below).
        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(false);
        const card = studioCourseOutlinePage.sectionTitled(`${label} A`);
        await studioCourseOutlinePage.reorderByKeyboard(card, 'down');
        expect(
          await siblingOrder(page, config, courseUsageKey(contentCourse.courseKey), [
            firstKey,
            secondKey,
          ]),
        ).toEqual([secondKey, firstKey]);

        await studioCourseOutlinePage.move(card, 'section', 'up');
        expect(
          await siblingOrder(page, config, courseUsageKey(contentCourse.courseKey), [
            firstKey,
            secondKey,
          ]),
        ).toEqual([firstKey, secondKey]);
      },
    );

    test(
      'reorders subsections within a section',
      { annotation: testId('TC-00169') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const label = `E2E reord-sub ${test.info().testId.slice(-6)}`;
        const section = await buildSection(page.request, config, contentCourse.courseKey, label, {
          subsections: [{ units: [{ blocks: ['html'] }] }, { units: [{ blocks: ['html'] }] }],
        });
        const [a, b] = section.subsections.map((s) => s.usageKey);

        expect(
          await siblingOrder(page, config, section.usageKey, [a as string, b as string]),
        ).toEqual([a, b]);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        const sectionCard = studioCourseOutlinePage.sectionTitled(label);
        await studioCourseOutlinePage.expand(sectionCard, 'section');
        const card = studioCourseOutlinePage.subsectionTitled(`${label} subsection 1`);
        await studioCourseOutlinePage.reorderByKeyboard(card, 'down');
        expect(
          await siblingOrder(page, config, section.usageKey, [a as string, b as string]),
        ).toEqual([b, a]);

        // Dragging collapses the outline's sections.
        await studioCourseOutlinePage.expand(sectionCard, 'section');
        await studioCourseOutlinePage.move(card, 'subsection', 'up');
        expect(
          await siblingOrder(page, config, section.usageKey, [a as string, b as string]),
        ).toEqual([a, b]);
      },
    );

    test(
      'reorders units within a subsection',
      { annotation: testId('TC-00170') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const label = `E2E reord-unit ${test.info().testId.slice(-6)}`;
        const section = await buildSection(page.request, config, contentCourse.courseKey, label, {
          subsections: [{ units: [{ blocks: ['html'] }, { blocks: ['html'] }] }],
        });
        const subsectionKey = section.subsections[0]?.usageKey ?? '';
        const [a, b] = section.units.map((u) => u.usageKey);

        expect(await siblingOrder(page, config, subsectionKey, [a as string, b as string])).toEqual(
          [a, b],
        );

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        const sectionCard = studioCourseOutlinePage.sectionTitled(label);
        const subsectionCard = studioCourseOutlinePage.subsectionTitled(`${label} subsection 1`);
        const expandToUnits = async () => {
          await studioCourseOutlinePage.expand(sectionCard, 'section');
          await studioCourseOutlinePage.expand(subsectionCard, 'subsection');
        };
        await expandToUnits();
        const card = studioCourseOutlinePage.unit(a as string);
        await studioCourseOutlinePage.reorderByKeyboard(card, 'down');
        expect(await siblingOrder(page, config, subsectionKey, [a as string, b as string])).toEqual(
          [b, a],
        );

        // Dragging collapses the outline's sections.
        await expandToUnits();
        await studioCourseOutlinePage.move(card, 'unit', 'up');
        expect(await siblingOrder(page, config, subsectionKey, [a as string, b as string])).toEqual(
          [a, b],
        );
      },
    );
  },
);

/** The order of the given keys among `parent`'s children, filtered to just those keys. */
async function siblingOrder(
  page: { request: APIRequestContext },
  config: Parameters<typeof fetchXBlockOutline>[1],
  parentUsageKey: string,
  keys: string[],
): Promise<string[]> {
  const parent = await fetchXBlockOutline(page.request, config, parentUsageKey);
  return (parent.child_info?.children ?? []).map((c) => c.id).filter((id) => keys.includes(id));
}

function shape() {
  return { subsections: [{ units: [{ blocks: ['html' as const] }] }] };
}
