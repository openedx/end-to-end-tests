import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS } from '../../../src/config';
import {
  SAMPLE_YOUTUBE_ID,
  createLibraryBlock,
  fetchBlockHierarchy,
  fetchLibraryBlock,
  fetchLibraryBlockAssets,
  fetchLibraryBlockOlx,
  fetchLibraryBlockTypes,
  libraryOlx,
  listLibraryBlocks,
  setLibraryBlockOlx,
  type LibraryBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { LIBRARY_A11Y_BASELINE, LIBRARY_TAGS, authorTextBlock, label } from './helpers';

/**
 * Components in a content library: authoring text (TC-00322) and video
 * (TC-00323, transcript TC-00324, start/stop TC-00325) through the editors,
 * publishing with the two-step confirmation (TC-00321, TC-00364), deleting
 * with confirmation (TC-00326), the hierarchy diagram (TC-00360), and a PDF
 * block (TC-00510).
 *
 * The UI drives every action; `/api/libraries/v2/` decides the outcome — the
 * block's OLX, `has_unpublished_changes`, the blocks list, the hierarchy.
 * Destructive cases run in the test's own empty library.
 */
test.describe('Content library components', { tag: ['@regression', ...LIBRARY_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'creates a text block with the rich-text editor',
    { annotation: testId('TC-00322') },
    async (
      { page, config, studioAuthorSession, authoringLibrary, libraryPage, studioTextEditor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const text = label('text', testInfo.testId);
      await libraryPage.goto(authoringLibrary.id);
      await libraryPage.openAddContent();
      await libraryPage.addComponent('html');

      await studioTextEditor.focus();
      await studioTextEditor.type(`${text} plain `);
      await studioTextEditor.bold();
      await studioTextEditor.type('bold');
      await studioTextEditor.bold();
      await studioTextEditor.type(' ');
      await studioTextEditor.italic();
      await studioTextEditor.type('italic');
      const created = (await (await libraryPage.saveNewComponent()).json()) as LibraryBlock;
      expect(created.block_type).toBe('html');

      // The editor writes the content in a follow-up call; read it back from the API.
      // TinyMCE stores the space before a format change as `&nbsp;`.
      await expect
        .poll(
          async () =>
            (await fetchLibraryBlockOlx(page.request, config, created.id)).replace(
              /&nbsp;|\u00a0/g,
              ' ',
            ),
          { timeout: TIMEOUTS.contentWrite },
        )
        .toContain(`${text} plain <strong>bold</strong> <em>italic</em>`);
      expect((await listLibraryBlocks(page.request, config, authoringLibrary.id)).count).toBe(1);
    },
  );

  test(
    'creates a video block from a YouTube URL',
    { annotation: testId('TC-00323') },
    async ({
      page,
      config,
      studioAuthorSession,
      authoringLibrary,
      libraryPage,
      studioVideoEditor,
    }) => {
      void studioAuthorSession;
      await libraryPage.goto(authoringLibrary.id);
      await libraryPage.openAddContent();
      await libraryPage.addComponent('video');

      await studioVideoEditor.setVideoUrl(`https://www.youtube.com/watch?v=${SAMPLE_YOUTUBE_ID}`);
      const created = (await (await libraryPage.saveNewComponent()).json()) as LibraryBlock;
      expect(created.block_type).toBe('video');
      await expect
        .poll(() => fetchLibraryBlockOlx(page.request, config, created.id), {
          timeout: TIMEOUTS.contentWrite,
        })
        .toContain(`youtube_id_1_0="${SAMPLE_YOUTUBE_ID}"`);
    },
  );

  test(
    'uploads a transcript to a library video',
    { annotation: testId('TC-00324') },
    async (
      { page, config, studioAuthorSession, authoringLibrary, libraryPage, studioVideoEditor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const title = label('video', testInfo.testId);
      const video = await createLibraryBlock(page.request, config, authoringLibrary.id, {
        blockType: 'video',
      });
      await setLibraryBlockOlx(
        page.request,
        config,
        video.id,
        libraryOlx.video(title, SAMPLE_YOUTUBE_ID),
      );

      await libraryPage.goto(authoringLibrary.id, 'components');
      await libraryPage.openCard(title);
      await libraryPage.sidebar.editComponent();
      await studioVideoEditor.addTranscript(
        'e2e.srt',
        '1\n00:00:00,000 --> 00:00:02,000\nE2E transcript line\n',
      );
      await libraryPage.saveEditor();

      // The transcript is stored as an `.srt` asset of the block.
      await expect
        .poll(
          async () =>
            (await fetchLibraryBlockAssets(page.request, config, video.id)).map((a) => a.path),
          { timeout: TIMEOUTS.contentWrite },
        )
        .toEqual(expect.arrayContaining([expect.stringMatching(/\.srt$/)]));
    },
  );

  test(
    'sets custom start and stop times on a library video',
    { annotation: testId('TC-00325') },
    async (
      { page, config, studioAuthorSession, authoringLibrary, libraryPage, studioVideoEditor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const title = label('video', testInfo.testId);
      const video = await createLibraryBlock(page.request, config, authoringLibrary.id, {
        blockType: 'video',
      });
      await setLibraryBlockOlx(
        page.request,
        config,
        video.id,
        libraryOlx.video(title, SAMPLE_YOUTUBE_ID),
      );

      await libraryPage.goto(authoringLibrary.id, 'components');
      await libraryPage.openCard(title);
      await libraryPage.sidebar.editComponent();
      await studioVideoEditor.setStartAndStopTimes('00:00:05', '00:00:20');
      await libraryPage.saveEditor();

      await expect
        .poll(() => fetchLibraryBlockOlx(page.request, config, video.id), {
          timeout: TIMEOUTS.contentWrite,
        })
        .toMatch(
          /start_time="0?0:00:05".*end_time="0?0:00:20"|end_time="0?0:00:20".*start_time="0?0:00:05"/s,
        );
    },
  );

  test(
    'publishes a component and its status updates',
    { annotation: testId('TC-00321') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      const title = label('publish', testInfo.testId);
      const block = await authorTextBlock(page.request, config, authoringLibrary.id, title);
      expect(
        (await fetchLibraryBlock(page.request, config, block.id)).has_unpublished_changes,
      ).toBe(true);

      await libraryPage.goto(authoringLibrary.id, 'components');
      await libraryPage.openCard(title);
      await expect(libraryPage.sidebar.publishStatusDraft).toBeVisible();
      const published = await libraryPage.sidebar.publish();
      expect(published.status()).toBe(200);

      expect(
        (await fetchLibraryBlock(page.request, config, block.id)).has_unpublished_changes,
      ).toBe(false);
      await expect(libraryPage.sidebar.publishStatusDraft).toHaveCount(0);
      await checkA11y(page, {
        label: 'library-components',
        additionalBaseline: LIBRARY_A11Y_BASELINE,
      });
    },
  );

  test(
    'asks for confirmation before publishing a component and honours Cancel',
    { annotation: testId('TC-00364') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      const title = label('confirm', testInfo.testId);
      const block = await authorTextBlock(page.request, config, authoringLibrary.id, title);

      await libraryPage.goto(authoringLibrary.id, 'components');
      await libraryPage.openCard(title);
      // Step one lists what will publish (the component itself) and publishes nothing yet.
      const listed = await libraryPage.sidebar.openPublishConfirmation();
      expect(listed).toContain(title);
      await libraryPage.sidebar.cancelPublish();
      expect(
        (await fetchLibraryBlock(page.request, config, block.id)).has_unpublished_changes,
      ).toBe(true);
      // Step two publishes.
      await libraryPage.sidebar.openPublishConfirmation();
      await libraryPage.sidebar.confirmPublish();
      expect(
        (await fetchLibraryBlock(page.request, config, block.id)).has_unpublished_changes,
      ).toBe(false);
    },
  );

  test(
    'deletes a component after confirmation, and Cancel keeps it',
    { annotation: testId('TC-00326') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      const title = label('delete', testInfo.testId);
      await authorTextBlock(page.request, config, authoringLibrary.id, title);

      await libraryPage.goto(authoringLibrary.id, 'components');
      await libraryPage.cardFor(title).first().waitFor();
      await libraryPage.openCardMenu(title);
      await page.locator('.dropdown-menu.show .dropdown-item:last-child').click();
      await libraryPage.cancelDialog();
      expect((await listLibraryBlocks(page.request, config, authoringLibrary.id)).count).toBe(1);

      const deleted = await libraryPage.deleteCard(title);
      expect(deleted.status()).toBe(200);
      expect((await listLibraryBlocks(page.request, config, authoringLibrary.id)).count).toBe(0);
      await expect(libraryPage.cardFor(title)).toHaveCount(0);
    },
  );

  test(
    'shows a component in its hierarchy',
    { annotation: testId('TC-00360') },
    async ({ page, config, studioAuthorSession, workerLibrary, libraryPage }) => {
      void studioAuthorSession;
      const { text } = workerLibrary.blocks;
      await libraryPage.goto(workerLibrary.libraryKey, 'components');
      await libraryPage.openCard(text.display_name);
      await libraryPage.sidebar.openTab('usage');

      const hierarchy = await fetchBlockHierarchy(page.request, config, text.id);
      const expected = [
        ...hierarchy.sections,
        ...hierarchy.subsections,
        ...hierarchy.units,
        ...hierarchy.components,
      ].map((entry) => entry.display_name);
      expect(expected).toEqual([
        workerLibrary.sections.section.display_name,
        workerLibrary.subsections.subsection.display_name,
        workerLibrary.units.unit.display_name,
        text.display_name,
      ]);
      expect(await libraryPage.sidebar.hierarchyTexts()).toEqual(expected);
      await expect(libraryPage.sidebar.hierarchySelectedRow).toHaveCount(1);
    },
  );

  test(
    'adds a PDF block from the Advanced / Other list',
    { tag: '@pdf-xblock', annotation: testId('TC-00510') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }) => {
      void studioAuthorSession;
      // The MFE labels each advanced type with the API's own `display_name`.
      const types = await fetchLibraryBlockTypes(page.request, config, authoringLibrary.id);
      const pdf = types.find((t) => t.block_type === 'pdf');
      expect(pdf).toBeDefined();

      await libraryPage.goto(authoringLibrary.id);
      await libraryPage.openAddContent();
      await libraryPage.addAdvancedComponent(pdf?.display_name ?? '');
      const created = (await (await libraryPage.saveNewComponent()).json()) as LibraryBlock;
      expect(created.block_type).toBe('pdf');
      expect(
        (await listLibraryBlocks(page.request, config, authoringLibrary.id)).results.map(
          (b) => b.block_type,
        ),
      ).toEqual(['pdf']);
    },
  );
});
