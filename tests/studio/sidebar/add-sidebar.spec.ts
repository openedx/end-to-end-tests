import type { Response } from '@playwright/test';

import {
  buildSection,
  courseUsageKey,
  fetchContainerChildren,
  fetchXBlockOutline,
} from '../../../src/api';
import { TIMEOUTS, STUDIO_SIDEBAR_SELECTORS as S } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * The Verawood Add sidebar on the outline and unit page (BTR TC-00491, 00496):
 * it opens with an Add New (default) and an Add Existing tab. From Add New a
 * section, subsection and unit are added to the outline and a component to a
 * unit, each decided by the block the platform then holds. Add Existing is
 * narrowed by library (to nothing, for an empty one) and a library unit added
 * from it. The library-reference guard is a known upstream defect
 * (wg-build-test-release#587, the sheet's Failed note) and is not driven.
 *
 * Gated on `studio-sidebar`; `studioAuthorSession` resolves last.
 */
test.describe(
  'Authoring Add sidebar',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@studio-sidebar'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'opens on the outline with Add New and Add Existing tabs',
      { tag: '@smoke', annotation: testId('TC-00491') },
      async ({
        page,
        config,
        authoringCourse,
        authoringSidebar,
        studioCourseOutlinePage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const { courseKey } = authoringCourse;
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E add outline ${test.info().testId.slice(-6)}`,
        );
        const subsection = section.subsections[0];
        if (subsection === undefined) throw new Error('buildSection produced no subsection.');
        const children = async (key: string) =>
          (await fetchXBlockOutline(page.request, config, key)).child_info?.children.map(
            (child) => child.id,
          ) ?? [];
        const newKey = async (created: Response) =>
          ((await created.json()) as { locator: string }).locator;
        await studioCourseOutlinePage.goto(courseKey);
        await studioCourseOutlinePage.waitForCourse(courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);

        await authoringSidebar.openPage('add');
        await expect(authoringSidebar.tab(S.outlineAddTab('addNew'))).toBeVisible();
        await expect(authoringSidebar.tab(S.outlineAddTab('addExisting'))).toBeVisible();

        // Both tabs are reachable.
        await authoringSidebar.openTab(S.outlineAddTab('addExisting'));
        await authoringSidebar.openTab(S.outlineAddTab('addNew'));

        // Add New offers a section, a subsection and a unit. With nothing
        // selected, a new section lands at the end of the course.
        const addedSection = await newKey(await authoringSidebar.addNewOutlineItem('section'));
        await expect
          .poll(() => children(courseUsageKey(courseKey)), { timeout: TIMEOUTS.contentWrite })
          .toEqual([section.usageKey, addedSection]);
        await expect(studioCourseOutlinePage.sectionCards).toHaveCount(2);

        // With a section selected, a new subsection lands in that section.
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionTitled(section.displayName),
          'section',
        );
        await authoringSidebar.openPage('add');
        const addedSubsection = await newKey(
          await authoringSidebar.addNewOutlineItem('subsection'),
        );
        await expect
          .poll(() => children(section.usageKey), { timeout: TIMEOUTS.contentWrite })
          .toEqual([subsection.usageKey, addedSubsection]);

        // With a subsection selected, a new unit lands in that subsection.
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.subsectionTitled(subsection.displayName),
          'subsection',
        );
        await authoringSidebar.openPage('add');
        const addedUnit = await newKey(await authoringSidebar.addNewOutlineItem('unit'));
        await expect
          .poll(() => children(subsection.usageKey), { timeout: TIMEOUTS.contentWrite })
          .toEqual([...subsection.units.map((unit) => unit.usageKey), addedUnit]);
      },
    );

    test(
      'narrows Add Existing to the chosen library, and to nothing for an empty one',
      { tag: '@content-libraries', annotation: testId('TC-00491') },
      async ({
        page,
        config,
        studioAuthorSession,
        resyncStudioAuthor,
        seededLibrary,
        authoringLibrary,
        authoringCourse,
        authoringSidebar,
        studioCourseOutlinePage,
      }) => {
        void studioAuthorSession;
        await resyncStudioAuthor();
        const { courseKey } = authoringCourse;
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E add existing ${test.info().testId.slice(-6)}`,
        );
        const subsection = section.subsections[0];
        if (subsection === undefined) throw new Error('buildSection produced no subsection.');
        const { unit } = seededLibrary.units;
        const seeded = { key: seededLibrary.libraryKey, title: seededLibrary.library.title };
        const empty = { key: authoringLibrary.id, title: authoringLibrary.title };

        await studioCourseOutlinePage.goto(courseKey);
        await studioCourseOutlinePage.waitForCourse(courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        // The subsection's own "Use unit from library" opens the Add sidebar on
        // Add Existing, listing library units to put in that subsection.
        const surface = await studioCourseOutlinePage.openUseLibraryUnit(
          studioCourseOutlinePage.subsectionTitled(subsection.displayName),
        );
        expect(surface).toBe('sidebar');
        await expect(authoringSidebar.tab(S.outlineAddTab('addExisting'))).toHaveAttribute(
          'aria-selected',
          'true',
        );

        // Filtered to the seeded library, the pane lists that library's unit.
        const unitCard = authoringSidebar.addExistingCards.filter({ hasText: unit.display_name });
        await authoringSidebar.setAddExistingLibrary(seeded.key, seeded.title, true);
        await expect(unitCard.first()).toBeVisible({ timeout: TIMEOUTS.librarySearch });

        // Filtered to a library that holds nothing, it lists nothing.
        await authoringSidebar.setAddExistingLibrary(seeded.key, seeded.title, false);
        await authoringSidebar.setAddExistingLibrary(empty.key, empty.title, true);
        await expect(authoringSidebar.addExistingCards).toHaveCount(0, {
          timeout: TIMEOUTS.librarySearch,
        });
        await expect(authoringSidebar.addExistingPane).toBeVisible();

        // Back on the seeded library, "Add" on the unit puts it in that
        // subsection, after the unit already there.
        await authoringSidebar.setAddExistingLibrary(empty.key, empty.title, false);
        const response = await authoringSidebar.addExistingFromLibrary(
          seeded.key,
          seeded.title,
          unit.display_name,
        );
        const imported = (await response.json()) as { locator: string; upstreamRef: string };
        expect(imported.upstreamRef).toBe(unit.id);
        await expect
          .poll(
            async () =>
              (
                await fetchXBlockOutline(page.request, config, subsection.usageKey)
              ).child_info?.children.map((child) => child.id),
            { timeout: TIMEOUTS.contentWrite },
          )
          .toEqual([...subsection.units.map((u) => u.usageKey), imported.locator]);
      },
    );

    test(
      'opens on the unit page with Add New and Add Existing tabs',
      { tag: '@smoke', annotation: testId('TC-00496') },
      async ({
        page,
        config,
        authoringCourse,
        authoringSidebar,
        studioUnitPage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E add unit ${test.info().testId.slice(-6)}`,
        );
        const unit = section.units.at(0);
        if (unit === undefined) throw new Error('buildSection produced no unit.');
        await studioUnitPage.goto(unit.usageKey);

        await authoringSidebar.openPage('add');
        await expect(authoringSidebar.tab(S.unitAddTab('add-new'))).toBeVisible();
        await expect(authoringSidebar.tab(S.unitAddTab('add-existing'))).toBeVisible();

        await authoringSidebar.openTab(S.unitAddTab('add-existing'));
        await authoringSidebar.openTab(S.unitAddTab('add-new'));

        // Add New lists the component types: text, video, problem and advanced.
        for (const type of ['html', 'video', 'problem', 'advanced']) {
          await expect(authoringSidebar.unitAddNewType(type)).toBeVisible();
        }

        // Leaving the Add sidebar without choosing one adds nothing.
        const childKeys = async () =>
          (await fetchContainerChildren(page.request, config, unit.usageKey)).map(
            (child) => child.block_id,
          );
        const before = await childKeys();
        await authoringSidebar.openPage('info');
        expect(await childKeys()).toEqual(before);

        // Choosing Text adds a text component to the end of the unit (and opens
        // its editor).
        await authoringSidebar.openPage('add');
        const created = await authoringSidebar.addNewComponent('html');
        const added = ((await created.json()) as { locator: string }).locator;
        expect(added).toContain('type@html');
        await expect
          .poll(childKeys, { timeout: TIMEOUTS.contentWrite })
          .toEqual([...before, added]);
      },
    );

    test(
      'adds a drag-and-drop component to the unit, shown at once',
      { tag: '@drag-and-drop-v2', annotation: testId('TC-00496') },
      async ({
        page,
        config,
        authoringCourse,
        authoringSidebar,
        studioUnitPage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E add dnd ${test.info().testId.slice(-6)}`,
        );
        const unit = section.units.at(0);
        if (unit === undefined) throw new Error('buildSection produced no unit.');
        await studioUnitPage.goto(unit.usageKey);
        await authoringSidebar.openPage('add');

        // A type with no editor of its own to open: the new component is added
        // to the end of the unit and rendered in it straight away.
        const created = await authoringSidebar.addNewComponent('drag-and-drop-v2');
        const added = ((await created.json()) as { locator: string }).locator;
        await expect
          .poll(
            async () =>
              (await fetchContainerChildren(page.request, config, unit.usageKey)).map((child) => ({
                key: child.block_id,
                type: child.block_type,
              })),
            { timeout: TIMEOUTS.contentWrite },
          )
          .toEqual([
            ...unit.blocks.map((block) => ({ key: block.usageKey, type: expect.any(String) })),
            { key: added, type: 'drag-and-drop-v2' },
          ]);
        await expect(studioUnitPage.component(added)).toBeVisible({
          timeout: TIMEOUTS.contentWrite,
        });
      },
    );
  },
);
