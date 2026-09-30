import type { APIRequestContext, Locator } from '@playwright/test';

import { fetchAllAssets, uploadAsset, type CourseAsset } from '../../../src/api';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Browsing the Studio Files page (BTR TC-00134–00139): the course asset library's
 * layout, name search, sort, type filter and the card/list views. The page
 * filters and sorts client-side over the loaded asset set, so the oracle is the
 * rendered card/row set for the test's own uploads (keyed by asset id) alongside
 * the assets API. Each test seeds its own files into its fresh `authoringCourse`.
 *
 * Gated on `@studio @author @mfe-authoring`.
 */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100',
  'hex',
);
const PDF = Buffer.from(
  `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
);

/** Uploads one image and one document with a shared, searchable prefix. */
async function seedTwo(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  suffix: string,
): Promise<{ image: CourseAsset; doc: CourseAsset }> {
  const image = await uploadAsset(request, config, courseKey, {
    name: `e2e-aaa-${suffix}.png`,
    mimeType: 'image/png',
    buffer: PNG,
  });
  const doc = await uploadAsset(request, config, courseKey, {
    name: `e2e-bbb-${suffix}.pdf`,
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  return { image, doc };
}

test.describe(
  'Studio files — browse',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'lays out the files table with both views',
      { annotation: testId('TC-00134') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const suffix = test.info().testId.slice(-6);
        const { image, doc } = await seedTwo(
          page.request,
          config,
          authoringCourse.courseKey,
          suffix,
        );

        await filesPage.goto(authoringCourse.courseKey);
        await filesPage.setView('card');
        await expect(filesPage.card(image.id)).toBeVisible();
        await expect(filesPage.card(doc.id)).toBeVisible();
        await expect(filesPage.cards).toHaveCount(2);

        const total = (await fetchAllAssets(page.request, config, authoringCourse.courseKey))
          .length;
        expect(total).toBe(2);

        await filesPage.setView('list');
        await expect(filesPage.rows).toHaveCount(2);

        // `FILES-003`: the Files table carries an ARIA attribute its role does
        // not allow. Baselined on this scan only, so every other rule gates here.
        await checkA11y(page, {
          label: 'studio-files',
          additionalBaseline: ['aria-allowed-attr'],
        });
      },
    );

    test(
      'searches, sorts, filters and clears',
      { annotation: testId('TC-00135') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const suffix = test.info().testId.slice(-6);
        const { image, doc } = await seedTwo(
          page.request,
          config,
          authoringCourse.courseKey,
          suffix,
        );
        await filesPage.goto(authoringCourse.courseKey);
        await filesPage.setView('card');

        // Search narrows to the one matching name.
        await filesPage.search('aaa');
        await expect(filesPage.card(image.id)).toBeVisible();
        await expect(filesPage.cards).toHaveCount(1);
        await filesPage.clearSearch();
        await expect(filesPage.cards).toHaveCount(2);

        // Sort by name descending: the document (bbb) comes first.
        await filesPage.sortBy('displayName,desc');
        await expect.poll(() => cardIds(filesPage.cards)).toEqual([doc.id, image.id]);

        // Filter to images only: the document drops out.
        await filesPage.clearFilters();
        await filesPage.filterBy('image');
        await expect(filesPage.card(image.id)).toBeVisible();
        await expect(filesPage.cards).toHaveCount(1);

        // Clear the filter: both are back.
        await filesPage.clearFilters();
        await expect(filesPage.cards).toHaveCount(2);
      },
    );

    test(
      'searches by substring, extension and a spaced term',
      { annotation: testId('TC-00136') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const suffix = test.info().testId.slice(-6);
        const { doc } = await seedTwo(page.request, config, authoringCourse.courseKey, suffix);
        await filesPage.goto(authoringCourse.courseKey);
        await filesPage.setView('card');

        // Substring of the shared suffix matches both.
        await filesPage.search(suffix);
        await expect(filesPage.cards).toHaveCount(2);

        // Extension narrows to the PDF.
        await filesPage.search('.pdf');
        await expect(filesPage.card(doc.id)).toBeVisible();
        await expect(filesPage.cards).toHaveCount(1);

        // A term matching nothing empties the set.
        await filesPage.search('e2e-zzz-nomatch');
        await expect(filesPage.cards).toHaveCount(0);

        await filesPage.clearSearch();
        await expect(filesPage.cards).toHaveCount(2);
      },
    );

    test(
      'sorts and filters without a search term',
      { annotation: testId('TC-00137') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const suffix = test.info().testId.slice(-6);
        const { image, doc } = await seedTwo(
          page.request,
          config,
          authoringCourse.courseKey,
          suffix,
        );
        await filesPage.goto(authoringCourse.courseKey);
        await filesPage.setView('card');

        await filesPage.sortBy('displayName,asc');
        await expect.poll(() => cardIds(filesPage.cards)).toEqual([image.id, doc.id]);

        await filesPage.clearFilters();
        await filesPage.filterBy('document');
        await expect(filesPage.card(doc.id)).toBeVisible();
        await expect(filesPage.cards).toHaveCount(1);
      },
    );

    test(
      'lists files with metadata and selectable checkboxes',
      { annotation: testId('TC-00139') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const suffix = test.info().testId.slice(-6);
        const { image, doc } = await seedTwo(
          page.request,
          config,
          authoringCourse.courseKey,
          suffix,
        );
        await filesPage.goto(authoringCourse.courseKey);
        // The two seeded assets are the ones on the page (card view keys by id).
        await filesPage.setView('card');
        await expect(filesPage.card(image.id)).toBeVisible();
        await expect(filesPage.card(doc.id)).toBeVisible();

        await filesPage.setView('list');
        await expect(filesPage.rows).toHaveCount(2);

        // Select all: every row checkbox becomes checked.
        await filesPage.selectAll();
        await expect(filesPage.rowCheckboxes).toHaveCount(2);
        for (let i = 0; i < 2; i += 1) {
          await expect(filesPage.rowCheckboxes.nth(i)).toBeChecked();
        }
      },
    );
  },
);

/** The asset ids of the visible cards, in order (from their `grid-card-<id>` test ids). */
async function cardIds(cards: Locator): Promise<string[]> {
  const testids = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid') ?? ''),
  );
  return testids.map((t) => t.replace(/^grid-card-/, ''));
}
