import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  CLIPBOARD_PATH,
  copyToClipboard,
  fetchContainerChildren,
  listLibraryBlocks,
  studioOrigin,
  type Clipboard,
  type LibraryBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { buildUnit } from '../components/component-helpers';
import { LIBRARY_TAGS, authorTextBlock, label } from './helpers';

/**
 * The clipboard between libraries and courses: copy library content to the
 * clipboard (TC-00334) and paste clipboard content into a library — from a
 * course block and from another library's block (TC-00335). The clipboard is
 * the user's server-side content-staging store, so the copy is asserted on
 * `GET /api/content-staging/v1/clipboard/` and the paste on the library's
 * blocks list.
 */
test.describe('Content library clipboard', { tag: ['@regression', ...LIBRARY_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'copies a library component to the clipboard',
    { annotation: testId('TC-00334') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      const block = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('copied', testInfo.testId),
      );

      await libraryPage.goto(authoringLibrary.id, 'components');
      await libraryPage
        .cardFor(block.display_name)
        .first()
        .waitFor({ timeout: TIMEOUTS.librarySearch });
      const copied = await libraryPage.copyCardToClipboard(block.display_name);
      expect(copied.status()).toBe(200);

      const clipboard = (await (
        await page.request.get(`${studioOrigin(config)}${CLIPBOARD_PATH}`)
      ).json()) as Clipboard;
      expect(clipboard.source_usage_key).toBe(block.id);
      expect(clipboard.content?.block_type).toBe('html');
    },
  );

  test(
    'pastes clipboard content into a library from a course and from another library',
    { annotation: testId('TC-00335') },
    async ({
      page,
      config,
      studioAuthorSession,
      resyncStudioAuthor,
      authoringLibrary,
      workerLibrary,
      contentCourse,
      libraryPage,
    }) => {
      void studioAuthorSession;
      // The two seeded libraries' v2 writes rotated this context's Studio session;
      // re-sync before the course-side legacy write below.
      await resyncStudioAuthor();
      // A course component on the clipboard (the content-staging API the
      // course's "Copy to clipboard" calls), pasted through the library's sidebar.
      const unitKey = await buildUnit(page.request, config, contentCourse.courseKey, {
        label: 'lib-paste',
        blocks: ['html'],
      });
      const [courseBlock] = await fetchContainerChildren(page.request, config, unitKey);
      await copyToClipboard(page.request, config, courseBlock?.block_id ?? '');

      await libraryPage.goto(authoringLibrary.id);
      await libraryPage.openAddContent();
      const fromCourse = (await (await libraryPage.pasteFromClipboard()).json()) as LibraryBlock;
      expect(fromCourse.block_type).toBe('html');
      expect(
        (await listLibraryBlocks(page.request, config, authoringLibrary.id)).results.map(
          (b) => b.id,
        ),
      ).toEqual([fromCourse.id]);

      // A component copied from another library, pasted the same way.
      await copyToClipboard(page.request, config, workerLibrary.blocks.problem.id);
      await libraryPage.openAddContent();
      const fromLibrary = (await (await libraryPage.pasteFromClipboard()).json()) as LibraryBlock;
      expect(fromLibrary.block_type).toBe('problem');
      expect((await listLibraryBlocks(page.request, config, authoringLibrary.id)).count).toBe(2);
    },
  );
});
