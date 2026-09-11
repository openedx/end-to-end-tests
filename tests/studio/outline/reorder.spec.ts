import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  buildSection,
  fetchXBlockOutline,
  courseUsageKey,
  type AuthoredSection,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Reordering sections (TC-00168), subsections (TC-00169) and units (TC-00170) in
 * the outline.
 *
 * The outline offers two affordances for the same reorder — drag-and-drop and the
 * card menu's "Move up/down" — which send the identical `PUT /xblock/<parent>
 * {children}`. Playwright's keyboard drag cannot reliably target a card's own
 * level (it grabs the nearest nested sortable), so per the epic's open-question-2
 * resolution these drive the deterministic "Move" menu and assert the reorder
 * `child_info.children` order (author side) and the learner's order after publish.
 */
test.describe(
  'Course outline reorder',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'reorders sections',
      { annotation: testId('TC-00168') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        // Two sections of this test's own, each identified by a unit within it.
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

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.move(
          studioCourseOutlinePage.section(only(first.units)),
          'section',
          'down',
        );

        expect(
          await siblingOrder(page, config, courseUsageKey(contentCourse.courseKey), [
            firstKey,
            secondKey,
          ]),
        ).toEqual([secondKey, firstKey]);
      },
    );

    test(
      'reorders subsections within a section',
      { annotation: testId('TC-00169') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `E2E reord-sub ${test.info().testId.slice(-6)}`,
          {
            subsections: [{ units: [{ blocks: ['html'] }] }, { units: [{ blocks: ['html'] }] }],
          },
        );
        const [a, b] = section.subsections.map((s) => s.usageKey);
        const firstUnit = section.subsections[0]?.units[0]?.usageKey ?? '';

        expect(
          await siblingOrder(page, config, section.usageKey, [a as string, b as string]),
        ).toEqual([a, b]);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.move(
          studioCourseOutlinePage.subsection(firstUnit),
          'subsection',
          'down',
        );

        expect(
          await siblingOrder(page, config, section.usageKey, [a as string, b as string]),
        ).toEqual([b, a]);
      },
    );

    test(
      'reorders units within a subsection',
      { annotation: testId('TC-00170') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `E2E reord-unit ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }, { blocks: ['html'] }] }] },
        );
        const subsectionKey = section.subsections[0]?.usageKey ?? '';
        const [a, b] = section.units.map((u) => u.usageKey);

        expect(await siblingOrder(page, config, subsectionKey, [a as string, b as string])).toEqual(
          [a, b],
        );

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.move(
          studioCourseOutlinePage.unit(a as string),
          'unit',
          'down',
        );

        expect(await siblingOrder(page, config, subsectionKey, [a as string, b as string])).toEqual(
          [b, a],
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

function only(items: AuthoredSection['units']): string {
  const [first] = items;
  if (first === undefined) throw new Error('The section is missing a unit.');
  return first.usageKey;
}
