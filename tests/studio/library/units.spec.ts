import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS } from '../../../src/config';
import {
  addContainerChildren,
  createLibraryContainer,
  fetchContainerHierarchy,
  fetchLibraryBlock,
  fetchLibraryBlockOlx,
  fetchLibraryContainer,
  fetchLibraryContainerChildren,
  listLibraryBlocks,
  type LibraryBlock,
  type LibraryContainer,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { LIBRARY_A11Y_BASELINE, LIBRARY_TAGS, authorTextBlock, label } from './helpers';

/**
 * Units in a content library: create (TC-00336), add new (TC-00337) and
 * existing (TC-00338) components, edit a component from within a unit and see
 * the change globally (TC-00339), publish a component from within (TC-00340),
 * remove a component from the unit while it stays in the library (TC-00341),
 * delete a component from within (TC-00342), delete a unit (TC-00343), publish
 * a unit from its landing page (TC-00344) with the two-step confirmation
 * (TC-00363), and the unit's hierarchy (TC-00359).
 *
 * The UI drives; `containers/<key>/children/`, the blocks list and the block's
 * OLX / `has_unpublished_changes` decide. Each test uses its own empty library.
 */
test.describe('Content library units', { tag: ['@regression', ...LIBRARY_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  /** An empty unit in the test's library, through the API. */
  async function unitWith(
    request: Parameters<typeof createLibraryContainer>[0],
    config: Parameters<typeof createLibraryContainer>[1],
    libraryKey: string,
    title: string,
    children: readonly string[] = [],
  ): Promise<LibraryContainer> {
    const unit = await createLibraryContainer(request, config, libraryKey, 'unit', title);
    if (children.length > 0) await addContainerChildren(request, config, unit.id, children);
    return unit;
  }

  test(
    'creates a unit from the Add Content sidebar',
    { annotation: testId('TC-00336') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      const title = label('unit', testInfo.testId);
      await libraryPage.goto(authoringLibrary.id);
      await libraryPage.openAddContent();
      const created = (await (
        await libraryPage.addContainer('unit', title)
      ).json()) as LibraryContainer;
      expect(created).toMatchObject({ container_type: 'unit', display_name: title });

      expect((await fetchLibraryContainer(page.request, config, created.id)).display_name).toBe(
        title,
      );
      // The MFE opens the new unit's landing page.
      await expect(page).toHaveURL((url) => url.pathname.includes(`/unit/${created.id}`));
      await checkA11y(page, { label: 'library-unit', additionalBaseline: LIBRARY_A11Y_BASELINE });
    },
  );

  test(
    'adds a new component to a unit and it appears in the library',
    { annotation: testId('TC-00337') },
    async (
      {
        page,
        config,
        studioAuthorSession,
        authoringLibrary,
        libraryContainerPage,
        libraryPage,
        studioTextEditor,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      const unit = await unitWith(
        page.request,
        config,
        authoringLibrary.id,
        label('unit', testInfo.testId),
      );
      const text = label('text', testInfo.testId);

      await libraryContainerPage.goto(authoringLibrary.id, 'unit', unit.id);
      await libraryContainerPage.openAddContent();
      await libraryPage.addComponent('html');
      await studioTextEditor.focus();
      await studioTextEditor.type(text);
      const created = (await (await libraryPage.saveNewComponent()).json()) as LibraryBlock;

      await expect
        .poll(
          async () =>
            (await fetchLibraryContainerChildren(page.request, config, unit.id)).map((c) => c.id),
          { timeout: TIMEOUTS.contentWrite },
        )
        .toEqual([created.id]);
      expect(
        (await listLibraryBlocks(page.request, config, authoringLibrary.id)).results.map(
          (b) => b.id,
        ),
      ).toEqual([created.id]);
    },
  );

  test(
    'adds an existing library component to a unit',
    { annotation: testId('TC-00338') },
    async (
      {
        page,
        config,
        studioAuthorSession,
        authoringLibrary,
        libraryContainerPage,
        libraryPage,
        libraryPicker,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      const existing = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('existing', testInfo.testId),
      );
      const unit = await unitWith(
        page.request,
        config,
        authoringLibrary.id,
        label('unit', testInfo.testId),
      );

      await libraryContainerPage.goto(authoringLibrary.id, 'unit', unit.id);
      await libraryContainerPage.openAddContent();
      await libraryPage.openAddExisting();
      await libraryPicker
        .cardFor(existing.display_name)
        .first()
        .waitFor({ timeout: TIMEOUTS.librarySearch });
      const added = await libraryPicker.addToContainer(existing.display_name);
      expect(added.status()).toBe(200);

      expect(
        (await fetchLibraryContainerChildren(page.request, config, unit.id)).map((c) => c.id),
      ).toEqual([existing.id]);
      await expect(libraryContainerPage.childFor(existing.display_name)).toHaveCount(1);
    },
  );

  test(
    'edits a component from within a unit and the change is global',
    { annotation: testId('TC-00339') },
    async (
      {
        page,
        config,
        studioAuthorSession,
        authoringLibrary,
        libraryContainerPage,
        libraryPage,
        studioTextEditor,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      const block = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('shared', testInfo.testId),
      );
      const unit = await unitWith(
        page.request,
        config,
        authoringLibrary.id,
        label('unit', testInfo.testId),
        [block.id],
      );
      const addition = label('edited', testInfo.testId);

      await libraryContainerPage.goto(authoringLibrary.id, 'unit', unit.id);
      await libraryContainerPage.editChild(block.display_name);
      await studioTextEditor.focus();
      await page.keyboard.press('End');
      await studioTextEditor.type(` ${addition}`);
      await libraryPage.saveEditor();

      // The block is one object: its OLX (read from the library, not the unit) carries the edit.
      await expect
        .poll(() => fetchLibraryBlockOlx(page.request, config, block.id), {
          timeout: TIMEOUTS.contentWrite,
        })
        .toContain(addition);
    },
  );

  test(
    'publishes a component from within a unit',
    { annotation: testId('TC-00340') },
    async (
      { page, config, studioAuthorSession, authoringLibrary, libraryContainerPage },
      testInfo,
    ) => {
      void studioAuthorSession;
      const block = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('draft', testInfo.testId),
      );
      const unit = await unitWith(
        page.request,
        config,
        authoringLibrary.id,
        label('unit', testInfo.testId),
        [block.id],
      );

      await libraryContainerPage.goto(authoringLibrary.id, 'unit', unit.id);
      await libraryContainerPage.openChild(block.display_name);
      const published = await libraryContainerPage.sidebar.publish();
      expect(published.status()).toBe(200);

      expect(
        (await fetchLibraryBlock(page.request, config, block.id)).has_unpublished_changes,
      ).toBe(false);
    },
  );

  test(
    'removes a component from a unit while it stays in the library',
    { annotation: testId('TC-00341') },
    async (
      { page, config, studioAuthorSession, authoringLibrary, libraryContainerPage },
      testInfo,
    ) => {
      void studioAuthorSession;
      const block = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('kept', testInfo.testId),
      );
      const unit = await unitWith(
        page.request,
        config,
        authoringLibrary.id,
        label('unit', testInfo.testId),
        [block.id],
      );

      await libraryContainerPage.goto(authoringLibrary.id, 'unit', unit.id);
      const removed = await libraryContainerPage.removeChild(block.display_name);
      expect(removed.status()).toBe(200);

      expect(await fetchLibraryContainerChildren(page.request, config, unit.id)).toEqual([]);
      expect(
        (await listLibraryBlocks(page.request, config, authoringLibrary.id)).results.map(
          (b) => b.id,
        ),
      ).toEqual([block.id]);
      await expect(libraryContainerPage.childFor(block.display_name)).toHaveCount(0);
    },
  );

  // The sheet's manual verawood run recorded this as Failed
  // (wg-build-test-release#603); it did not reproduce on `main` or `verawood`
  // (2026-09-16), so it is asserted as intended behaviour with no defect marker.
  test(
    'deletes a component from within a unit, removing it from the library too',
    { annotation: testId('TC-00342') },
    async (
      { page, config, studioAuthorSession, authoringLibrary, libraryContainerPage },
      testInfo,
    ) => {
      void studioAuthorSession;
      const block = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('gone', testInfo.testId),
      );
      const unit = await unitWith(
        page.request,
        config,
        authoringLibrary.id,
        label('unit', testInfo.testId),
        [block.id],
      );

      await libraryContainerPage.goto(authoringLibrary.id, 'unit', unit.id);
      const deleted = await libraryContainerPage.deleteChild(block.display_name);
      expect(deleted.status()).toBe(200);

      expect(await fetchLibraryContainerChildren(page.request, config, unit.id)).toEqual([]);
      expect((await listLibraryBlocks(page.request, config, authoringLibrary.id)).count).toBe(0);
    },
  );

  test(
    'deletes a unit after confirmation',
    { annotation: testId('TC-00343') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      const unit = await unitWith(
        page.request,
        config,
        authoringLibrary.id,
        label('unit', testInfo.testId),
      );

      await libraryPage.goto(authoringLibrary.id, 'units');
      await libraryPage
        .cardFor(unit.display_name)
        .first()
        .waitFor({ timeout: TIMEOUTS.librarySearch });
      const deleted = await libraryPage.deleteCard(unit.display_name);
      expect(deleted.status()).toBe(204);

      await expect(fetchLibraryContainer(page.request, config, unit.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(libraryPage.cardFor(unit.display_name)).toHaveCount(0);
    },
  );

  test(
    'publishes a unit from its landing page after a two-step confirmation',
    { annotation: [testId('TC-00344'), testId('TC-00363')] },
    async (
      { page, config, studioAuthorSession, authoringLibrary, libraryContainerPage },
      testInfo,
    ) => {
      void studioAuthorSession;
      const block = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('child', testInfo.testId),
      );
      const unit = await unitWith(
        page.request,
        config,
        authoringLibrary.id,
        label('unit', testInfo.testId),
        [block.id],
      );

      await libraryContainerPage.goto(authoringLibrary.id, 'unit', unit.id);
      await libraryContainerPage.openInfo();
      // Step one lists the unit and its child; Cancel publishes nothing.
      const listed = await libraryContainerPage.sidebar.openPublishConfirmation();
      expect(listed).toEqual(expect.arrayContaining([unit.display_name, block.display_name]));
      await libraryContainerPage.sidebar.cancelPublish();
      expect(
        (await fetchLibraryContainer(page.request, config, unit.id)).has_unpublished_changes,
      ).toBe(true);
      // Step two publishes the unit and, with it, the child.
      await libraryContainerPage.sidebar.openPublishConfirmation();
      const published = await libraryContainerPage.sidebar.confirmPublish();
      expect(published.status()).toBe(200);
      expect(
        (await fetchLibraryContainer(page.request, config, unit.id)).has_unpublished_changes,
      ).toBe(false);
      expect(
        (await fetchLibraryBlock(page.request, config, block.id)).has_unpublished_changes,
      ).toBe(false);
    },
  );

  test(
    'shows a unit nested under its subsection in the hierarchy',
    { annotation: testId('TC-00359') },
    async ({ page, config, studioAuthorSession, seededLibrary, libraryContainerPage }) => {
      void studioAuthorSession;
      const { unit } = seededLibrary.units;
      await libraryContainerPage.goto(seededLibrary.libraryKey, 'unit', unit.id);
      await libraryContainerPage.openInfo();
      await libraryContainerPage.sidebar.openTab('usage');

      const hierarchy = await fetchContainerHierarchy(page.request, config, unit.id);
      expect(hierarchy.subsections.map((s) => s.id)).toEqual([
        seededLibrary.subsections.subsection.id,
      ]);
      expect(hierarchy.sections.map((s) => s.id)).toEqual([seededLibrary.sections.section.id]);
      const rows = await libraryContainerPage.sidebar.hierarchyTexts();
      expect(rows).toEqual(
        expect.arrayContaining([
          seededLibrary.sections.section.display_name,
          seededLibrary.subsections.subsection.display_name,
          unit.display_name,
        ]),
      );
      expect(rows.indexOf(seededLibrary.sections.section.display_name)).toBeLessThan(
        rows.indexOf(unit.display_name),
      );
    },
  );
});
