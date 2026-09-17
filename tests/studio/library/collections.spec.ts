import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS } from '../../../src/config';
import {
  addCollectionItems,
  createCollection,
  fetchCollection,
  fetchLibraryBlock,
  listCollections,
  listLibraryBlocks,
  type LibraryBlock,
  type LibraryCollection,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { LIBRARY_A11Y_BASELINE, LIBRARY_TAGS, authorTextBlock, label } from './helpers';

/**
 * Collections in a content library: create one (TC-00317), add a new component
 * from the collection page (TC-00318), add existing library content to it
 * (TC-00319), and remove content from it while it stays in the library
 * (TC-00320).
 *
 * The UI drives; `/api/libraries/v2/<lib>/collections/` and the block's own
 * `collections[]` decide. Each test uses its own empty library.
 */
test.describe('Content library collections', { tag: ['@regression', ...LIBRARY_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'creates a collection from the Add Content sidebar',
    { annotation: testId('TC-00317') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      const title = label('collection', testInfo.testId);
      await libraryPage.goto(authoringLibrary.id);
      await libraryPage.openAddContent();
      const created = (await (
        await libraryPage.addContainer('collection', title)
      ).json()) as LibraryCollection;
      expect(created.title).toBe(title);

      const collections = await listCollections(page.request, config, authoringLibrary.id);
      expect(collections.results.map((c) => c.title)).toEqual([title]);
      // The MFE opens the new collection's page.
      await expect(page).toHaveURL((url) => url.pathname.includes(`/collection/${created.key}`));
      await checkA11y(page, {
        label: 'library-collection',
        additionalBaseline: LIBRARY_A11Y_BASELINE,
      });
    },
  );

  test(
    'adds a new component from the collection page and it appears in the library',
    { annotation: testId('TC-00318') },
    async (
      { page, config, studioAuthorSession, authoringLibrary, libraryPage, studioTextEditor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const text = label('coll-text', testInfo.testId);
      const collection = await createCollection(
        page.request,
        config,
        authoringLibrary.id,
        label('collection', testInfo.testId),
      );

      await libraryPage.gotoCollection(authoringLibrary.id, collection.key);
      await libraryPage.openAddContent();
      await libraryPage.addComponent('html');
      await studioTextEditor.focus();
      await studioTextEditor.type(text);
      const created = (await (await libraryPage.saveNewComponent()).json()) as LibraryBlock;

      // In the collection, and in the library's own block list.
      await expect
        .poll(
          async () =>
            (await fetchLibraryBlock(page.request, config, created.id)).collections.map(
              (c) => c.key,
            ),
          { timeout: TIMEOUTS.contentWrite },
        )
        .toEqual([collection.key]);
      expect(
        (await listLibraryBlocks(page.request, config, authoringLibrary.id)).results.map(
          (b) => b.id,
        ),
      ).toEqual([created.id]);
    },
  );

  test(
    'adds existing library content to a collection from the collection page and from a card',
    { annotation: testId('TC-00319') },
    async (
      { page, config, studioAuthorSession, authoringLibrary, libraryPage, libraryPicker },
      testInfo,
    ) => {
      void studioAuthorSession;
      const first = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('first', testInfo.testId),
      );
      const second = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('second', testInfo.testId),
      );
      const collection = await createCollection(
        page.request,
        config,
        authoringLibrary.id,
        label('collection', testInfo.testId),
      );

      // From within the collection: "Existing Library Content" opens the picker.
      await libraryPage.gotoCollection(authoringLibrary.id, collection.key);
      await libraryPage.openAddContent();
      await libraryPage.openAddExisting();
      await libraryPicker
        .cardFor(first.display_name)
        .first()
        .waitFor({ timeout: TIMEOUTS.librarySearch });
      const added = await libraryPicker.addToCollection(first.display_name);
      expect(added.status()).toBe(200);
      await expect
        .poll(() =>
          fetchCollection(page.request, config, authoringLibrary.id, collection.key).then(
            (c) => c.entities.length,
          ),
        )
        .toBe(1);

      // From the library: a card's "Add to collection" → the collection picker in the sidebar.
      await libraryPage.goto(authoringLibrary.id, 'components');
      await libraryPage.openCardAddToCollection(second.display_name, 'component');
      await libraryPage.chooseCollection(collection.key);
      await expect
        .poll(
          async () =>
            (await fetchLibraryBlock(page.request, config, second.id)).collections.map(
              (c) => c.key,
            ),
          { timeout: TIMEOUTS.contentWrite },
        )
        .toEqual([collection.key]);
      expect(
        (await fetchCollection(page.request, config, authoringLibrary.id, collection.key)).entities,
      ).toHaveLength(2);
    },
  );

  test(
    'removes content from a collection while it stays in the library',
    { annotation: testId('TC-00320') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      const block = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        label('kept', testInfo.testId),
      );
      const collection = await createCollection(
        page.request,
        config,
        authoringLibrary.id,
        label('collection', testInfo.testId),
      );
      await addCollectionItems(page.request, config, authoringLibrary.id, collection.key, [
        block.id,
      ]);

      await libraryPage.gotoCollection(authoringLibrary.id, collection.key);
      await libraryPage
        .cardFor(block.display_name)
        .first()
        .waitFor({ timeout: TIMEOUTS.librarySearch });
      const removed = await libraryPage.removeCardFromCollection(block.display_name);
      expect(removed.status()).toBe(200);

      expect(
        (await fetchCollection(page.request, config, authoringLibrary.id, collection.key)).entities,
      ).toHaveLength(0);
      expect((await fetchLibraryBlock(page.request, config, block.id)).collections).toEqual([]);
      expect((await listLibraryBlocks(page.request, config, authoringLibrary.id)).count).toBe(1);
    },
  );
});
