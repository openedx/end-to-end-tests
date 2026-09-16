import { writeFileSync } from 'node:fs';
import { uploadAsset } from '../../../src/api';
import { test } from '../../../src/fixtures';
import { authoringCourseBaseUrl } from '../../../src/pages/studio/authoring-base';

test('files diag7', { tag: ['@studio', '@author', '@mfe-authoring'] }, async ({ page, config, authoringCourse, studioAuthorSession }) => {
  void studioAuthorSession;
  const key = authoringCourse.courseKey;
  const a = await uploadAsset(page.request, config, key, { name: 'e2e-a.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100','hex') });
  await uploadAsset(page.request, config, key, { name: 'e2e-b.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100','hex') });
  const base = await authoringCourseBaseUrl(page, config, key);
  await page.goto(`${base}/assets`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="files-data-table"]').waitFor({ timeout: 30000 });
  await page.locator('[data-testid="icon-btn-val-card"]').click().catch(()=>{});
  await page.waitForTimeout(1000);
  const out: Record<string, unknown> = { assetId: a.id };
  await page.locator(`[id="file-menu-dropdown-${a.id}"]`).click();
  await page.waitForTimeout(500);
  out.rowMenu = await page.evaluate(() => { const m = document.querySelector('.dropdown-menu.show') as HTMLElement|null; return m ? Array.from(m.querySelectorAll('a,button,[role="menuitem"]')).map((i,idx)=>({idx, tag:i.tagName.toLowerCase(), testid:i.getAttribute('data-testid')||undefined, txt:(i.textContent||'').trim().slice(0,22)})) : {none:true}; });
  await page.keyboard.press('Escape');
  // select all then open bulk actions
  await page.locator('[data-testid="datatable-select-column-checkbox-header"]').click({force:true}).catch(()=>{});
  await page.waitForTimeout(400);
  await page.locator('#actions-menu-toggle').click().catch(()=>{});
  await page.waitForTimeout(500);
  out.bulkMenu = await page.evaluate(() => { const ms = Array.from(document.querySelectorAll('.dropdown-menu.show')); const m = ms[ms.length-1] as HTMLElement|undefined; return m ? Array.from(m.querySelectorAll('a,button,[role="menuitem"]')).map((i,idx)=>({idx, testid:i.getAttribute('data-testid')||undefined, txt:(i.textContent||'').trim().slice(0,22)})) : {none:true}; });
  writeFileSync('/tmp/claude-1000/-home-ty-Dev-end-to-end-tests/4e8a1152-a35f-4fb2-a243-23f9cecbd7b8/scratchpad/menus.json', JSON.stringify(out, null, 1));
});
