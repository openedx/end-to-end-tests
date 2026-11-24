import type { APIRequestContext } from '@playwright/test';

import {
  assetStudioUrl,
  buildSection,
  fetchAllAssets,
  uploadAsset,
  type CourseAsset,
} from '../../../src/api';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Acting on Studio files (BTR TC-00138, 00140, 00141): uploading, the per-file
 * 3-dot actions (copy links, lock/unlock, download, info, delete) and the bulk
 * download / delete. The UI drives; the assets API decides (`totalCount`, an
 * asset's `locked`, its absence after a delete) with download events and the
 * asset URL serving the uploaded bytes as the remaining oracles. The targets are
 * served over http, where the browser gives a page no clipboard (finding
 * FILES-002), so the copy actions write to a recording stand-in
 * (`FilesPage.recordClipboardWrites`) and the copied text is what is judged.
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
      { tag: '@smoke', annotation: testId('TC-00138') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
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
      { tag: '@smoke', annotation: testId('TC-00140') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const suffix = test.info().testId.slice(-6);
        const name = `e2e-act-${suffix}.png`;
        const asset = await seedOne(page.request, config, key, name);
        // One component that uses the file, for the Info modal's usage list.
        const section = await buildSection(page.request, config, key, `E2E usage ${suffix}`, {
          subsections: [
            {
              units: [{ blocks: [{ html: `<p><img src="${asset.portable_url}" alt="" /></p>` }] }],
            },
          ],
        });
        const usingUnit = section.units[0]!.usageKey;
        const yearAdded = /\d{4}/.exec(asset.date_added)?.[0] ?? '';
        await filesPage.recordClipboardWrites();
        await filesPage.goto(key);
        await filesPage.setView('card');

        // Copy Studio URL hands over the file's portable `/static/…` path, and
        // Copy Web URL its absolute address — which serves the file itself.
        expect(await filesPage.menuOffersCopyLinks(asset.id)).toBe(true);
        expect(await filesPage.copyUrl(asset.id, 'copyStudioUrl')).toBe(asset.portable_url);
        const webUrl = await filesPage.copyUrl(asset.id, 'copyWebUrl');
        expect(webUrl).toBe(assetStudioUrl(config, asset));
        const served = await page.request.get(webUrl);
        expect(served.ok()).toBe(true);
        expect((await served.body()).equals(PNG)).toBe(true);

        // Lock, then unlock — the API reflects each, and so does the list
        // view's access cell, whose icon is not the same drawing in both states.
        await filesPage.setView('list');
        const access = () => filesPage.rowCell(name, 'access').innerHTML();
        const unlockedIcon = await access();
        await filesPage.toggleLockFromRow(name);
        await expect.poll(() => lockedOf(page.request, config, key, asset.id)).toBe(true);
        await expect.poll(access).not.toBe(unlockedIcon);
        await filesPage.setView('card');

        // Info shows the file's own details: both URLs, its size, the year it
        // was added, and the lock as it now stands.
        await filesPage.openInfo(asset.id);
        await expect(filesPage.infoUrls).toHaveText([asset.portable_url, webUrl]);
        await expect(filesPage.infoBody).toContainText(String(asset.file_size));
        await expect(filesPage.infoBody).toContainText(yearAdded);
        await expect(filesPage.infoLockCheckbox).toBeChecked();
        // …and where it is used: one link, to the unit whose text embeds it.
        await expect(filesPage.infoUsageLinks).toHaveCount(1);
        await expect(filesPage.infoUsageLinks).toHaveAttribute(
          'href',
          new RegExp(`/container/${usingUnit.replace(/[+.]/g, '\\$&')}`),
        );
        await filesPage.closeInfo();

        // Unlocking from the card's menu puts the unlocked icon back.
        await filesPage.toggleLock(asset.id);
        await expect.poll(() => lockedOf(page.request, config, key, asset.id)).toBe(false);
        await filesPage.setView('list');
        await expect.poll(access).toBe(unlockedIcon);
        await filesPage.setView('card');

        // Download offers the file under its own name.
        const download = await filesPage.download(asset.id);
        expect(download.suggestedFilename()).toBe(name);

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
      { tag: '@smoke', annotation: testId('TC-00141') },
      async ({ page, config, authoringCourse, filesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const suffix = test.info().testId.slice(-6);
        const names = ['a', 'b', 'c'].map((letter) => `e2e-bulk-${letter}-${suffix}.png`);
        const [first, second, kept] = names as [string, string, string];
        for (const name of names) await seedOne(page.request, config, key, name);
        const remaining = () =>
          fetchAllAssets(page.request, config, key).then((assets) =>
            assets.map((asset) => asset.display_name).sort(),
          );
        await filesPage.goto(key);
        await filesPage.setView('list');
        await expect(filesPage.rows).toHaveCount(3);

        // The header box selects every row, and unselects them again.
        await filesPage.selectAll();
        await expect(filesPage.rowCheckboxes.and(page.locator(':checked'))).toHaveCount(3);
        await filesPage.clearSelection();
        await expect(filesPage.rowCheckboxes.and(page.locator(':checked'))).toHaveCount(0);

        // Two of the three ticked by hand: the Actions menu downloads them…
        await filesPage.selectRow(first);
        await filesPage.selectRow(second);
        await expect(filesPage.rowCheckbox(kept)).not.toBeChecked();
        const download = await filesPage.bulkDownload();
        expect(download.suggestedFilename().length).toBeGreaterThan(0);

        // …and deletes them, once the confirmation is accepted: cancelling it
        // closes the dialog and keeps every file.
        await filesPage.openBulkDeleteDialog();
        await filesPage.cancelDelete();
        await expect(filesPage.deleteDialog).toBeHidden();
        expect(await remaining()).toEqual([...names].sort());

        await filesPage.openBulkDeleteDialog();
        await filesPage.confirmBulkDelete();
        await expect.poll(remaining).toEqual([kept]);
        await expect(filesPage.rows).toHaveCount(1);
        await expect(filesPage.row(kept)).toBeVisible();
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
