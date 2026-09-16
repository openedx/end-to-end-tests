import type { APIRequestContext } from '@playwright/test';

import { assetStudioUrl, fetchAllAssets, uploadAsset, type CourseAsset } from '../../../src/api';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Acting on Studio files (BTR TC-00138, 00140, 00141): uploading, the per-file
 * 3-dot actions (copy links, lock/unlock, download, info, delete) and the bulk
 * download / delete. The UI drives; the assets API decides (`totalCount`, an
 * asset's `locked`, its absence after a delete) with download events and the
 * asset URL's resolvability as the remaining oracles. Copy actions are only
 * checked to be offered and to resolve — the clipboard is unreadable on http
 * (finding FILES-002).
 *
 * Gated on `@studio @author @mfe-authoring`; write-heavy, so `contentWrite`.
 */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100',
  'hex',
);

async function seedOne(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  name: string,
): Promise<CourseAsset> {
  return uploadAsset(request, config, courseKey, { name, mimeType: 'image/png', buffer: PNG });
}

test.describe(
  'Studio files — actions',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'uploads one file and then several',
      { annotation: testId('TC-00138') },
      async ({
        page,
        config,
        authoringCourse,
        filesPage,
        studioAuthorSession,
        acceptedUploadAgreements,
      }) => {
        void studioAuthorSession;
        // On a gated install the upload dropzone is blocked until agreements are
        // accepted; this is a no-op where nothing is gated.
        void acceptedUploadAgreements;
        const key = authoringCourse.courseKey;
        const suffix = test.info().testId.slice(-6);
        await filesPage.goto(key);

        await filesPage.upload([
          { name: `e2e-one-${suffix}.png`, mimeType: 'image/png', buffer: PNG },
        ]);
        await expect
          .poll(() => fetchAllAssets(page.request, config, key).then((a) => a.length))
          .toBe(1);

        await filesPage.upload([
          { name: `e2e-two-${suffix}.png`, mimeType: 'image/png', buffer: PNG },
          { name: `e2e-three-${suffix}.png`, mimeType: 'image/png', buffer: PNG },
        ]);
        await expect
          .poll(() => fetchAllAssets(page.request, config, key).then((a) => a.length))
          .toBe(3);
        await filesPage.setView('card');
        await expect(filesPage.cards).toHaveCount(3);
      },
    );

    test(
      'copies links, locks, downloads, shows info and deletes',
      { annotation: testId('TC-00140') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const suffix = test.info().testId.slice(-6);
        const asset = await seedOne(page.request, config, key, `e2e-act-${suffix}.png`);
        await filesPage.goto(key);
        await filesPage.setView('card');

        // Copy links are offered, and the asset's URL resolves.
        expect(await filesPage.menuOffersCopyLinks(asset.id)).toBe(true);
        const resolved = await page.request.get(assetStudioUrl(config, asset));
        expect(resolved.ok()).toBe(true);

        // Lock, then unlock — the API reflects each.
        await filesPage.toggleLock(asset.id);
        await expect.poll(() => lockedOf(page.request, config, key, asset.id)).toBe(true);
        await filesPage.toggleLock(asset.id);
        await expect.poll(() => lockedOf(page.request, config, key, asset.id)).toBe(false);

        // Download offers the file.
        const download = await filesPage.download(asset.id);
        expect(download.suggestedFilename().length).toBeGreaterThan(0);

        // Info opens the detail panel.
        await filesPage.openInfo(asset.id);
        await page.keyboard.press('Escape');

        // Cancelling delete keeps the file; confirming removes it.
        await filesPage.openDeleteDialog(asset.id);
        await filesPage.cancelDelete();
        expect((await fetchAllAssets(page.request, config, key)).map((a) => a.id)).toContain(
          asset.id,
        );
        await filesPage.openDeleteDialog(asset.id);
        await filesPage.confirmDelete();
        await expect
          .poll(() => fetchAllAssets(page.request, config, key).then((a) => a.map((x) => x.id)))
          .not.toContain(asset.id);
      },
    );

    test(
      'bulk downloads and deletes selected files',
      { annotation: testId('TC-00141') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const suffix = test.info().testId.slice(-6);
        await seedOne(page.request, config, key, `e2e-bulk-a-${suffix}.png`);
        await seedOne(page.request, config, key, `e2e-bulk-b-${suffix}.png`);
        await filesPage.goto(key);
        await filesPage.setView('list');
        await expect(filesPage.rows).toHaveCount(2);

        // Select all and bulk-download.
        await filesPage.selectAll();
        const download = await filesPage.bulkDownload();
        expect(download.suggestedFilename().length).toBeGreaterThan(0);

        // The selection persists after the download; bulk-delete it.
        await filesPage.openBulkDeleteDialog();
        await filesPage.confirmBulkDelete();
        await expect
          .poll(() => fetchAllAssets(page.request, config, key).then((a) => a.length))
          .toBe(0);
      },
    );
  },
);

/** An asset's current `locked` flag, or undefined if it is gone. */
async function lockedOf(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  assetId: string,
): Promise<boolean | undefined> {
  const asset = (await fetchAllAssets(request, config, courseKey)).find((a) => a.id === assetId);
  return asset?.locked;
}
