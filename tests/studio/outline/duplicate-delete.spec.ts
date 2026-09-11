import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  buildSection,
  fetchXBlockOutline,
  type AuthoredSection,
  type XBlockOutline,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Duplicating (TC-00162/163/164) and deleting (TC-00165/166/167) outline items,
 * at section, subsection and unit level.
 *
 * The author acts through the outline's 3-dot menu; `xblock/outline` decides the
 * author-side outcome (a duplicate gains a copy with the same descendant shape; a
 * delete loses the key and its descendants), and the learner's Blocks API mirrors
 * it after publish. Duplicate display names are the platform's localized
 * "Duplicate of …", never asserted — the copy is identified by its returned key.
 */
test.describe(
  'Course outline duplicate and delete',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'duplicates a section with its contents',
      { annotation: testId('TC-00162') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const section = await built(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'dup-sec',
        );
        const unitKey = only(section.units);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        const copyKey = await studioCourseOutlinePage.duplicate(
          studioCourseOutlinePage.section(unitKey),
          'section',
        );

        // The copy is a chapter with the same subsection/unit shape underneath.
        const copy = await fetchXBlockOutline(page.request, config, copyKey);
        expect(copy.category).toBe('chapter');
        expect(descendantCategories(copy)).toEqual(['sequential', 'vertical']);
      },
    );

    test(
      'duplicates a subsection with its contents',
      { annotation: testId('TC-00163') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const section = await built(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'dup-sub',
        );
        const unitKey = only(section.units);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        const copyKey = await studioCourseOutlinePage.duplicate(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
        );

        const copy = await fetchXBlockOutline(page.request, config, copyKey);
        expect(copy.category).toBe('sequential');
        expect(copy.child_info?.children.map((c) => c.category)).toEqual(['vertical']);
      },
    );

    test(
      'duplicates a unit with its contents',
      { annotation: testId('TC-00164') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const section = await built(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'dup-unit',
        );
        const unitKey = only(section.units);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        const copyKey = await studioCourseOutlinePage.duplicate(
          studioCourseOutlinePage.unit(unitKey),
          'unit',
        );

        const copy = await fetchXBlockOutline(page.request, config, copyKey);
        expect(copy.category).toBe('vertical');
      },
    );

    test(
      'deletes a section and all its nested content',
      { annotation: testId('TC-00165') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await built(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'del-sec',
          true,
        );
        const unitKey = only(section.units);
        await learnerSees(roundTripLearner, unitKey, true);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.delete(studioCourseOutlinePage.section(unitKey), 'section');

        expect(await exists(page, config, section.usageKey)).toBe(false);
        await learnerSees(roundTripLearner, unitKey, false);
      },
    );

    test(
      'deletes a subsection and its nested units',
      { annotation: testId('TC-00166') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await built(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'del-sub',
          true,
        );
        const subsectionKey = only(section.subsections);
        const unitKey = only(section.units);
        await learnerSees(roundTripLearner, unitKey, true);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.delete(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
        );

        expect(await exists(page, config, subsectionKey)).toBe(false);
        await learnerSees(roundTripLearner, unitKey, false);
      },
    );

    test(
      'deletes a unit',
      { annotation: testId('TC-00167') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await built(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'del-unit',
          true,
        );
        const unitKey = only(section.units);
        await learnerSees(roundTripLearner, unitKey, true);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.delete(studioCourseOutlinePage.unit(unitKey), 'unit');

        expect(await exists(page, config, unitKey)).toBe(false);
        await learnerSees(roundTripLearner, unitKey, false);
      },
    );
  },
);

/** Every descendant category of a block, depth-first (for a section: sequential, vertical). */
function descendantCategories(block: XBlockOutline): string[] {
  const out: string[] = [];
  for (const child of block.child_info?.children ?? []) {
    out.push(child.category);
    out.push(...descendantCategories(child));
  }
  return out;
}

async function exists(
  page: { request: APIRequestContext },
  config: Parameters<typeof fetchXBlockOutline>[1],
  usageKey: string,
): Promise<boolean> {
  try {
    await fetchXBlockOutline(page.request, config, usageKey);
    return true;
  } catch {
    return false;
  }
}

async function learnerSees(
  learner: { outline: () => Promise<{ units: readonly { id: string }[] }> },
  unitKey: string,
  present: boolean,
): Promise<void> {
  await expect
    .poll(async () => (await learner.outline()).units.some((u) => u.id === unitKey), {
      timeout: TIMEOUTS.contentPublish,
    })
    .toBe(present);
}

function built(
  request: Parameters<typeof buildSection>[0],
  config: Parameters<typeof buildSection>[1],
  courseKey: string,
  info: { testId: string },
  tag: string,
  publish = false,
) {
  return buildSection(request, config, courseKey, `E2E ${tag} ${info.testId.slice(-6)}`, {
    subsections: [{ units: [{ blocks: ['html'] }] }],
    publish,
  });
}

function only(items: AuthoredSection['units'] | AuthoredSection['subsections']): string {
  const [first] = items;
  if (first === undefined) throw new Error('The section is missing an item.');
  return first.usageKey;
}
