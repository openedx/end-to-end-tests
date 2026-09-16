import type { Download, Locator, Page } from '@playwright/test';

import { TAXONOMY_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { TAGGING_BASE } from '../../../api';
import { authoringMfeBaseFromHome } from '../authoring-base';
import type { ImportFile } from './taxonomy-list.page';

/**
 * A single taxonomy's detail page (`/taxonomy/<id>`) — staff only. Its SubHeader
 * carries the same taxonomy menu as the list-page card (import/re-import, export,
 * delete, manage orgs), so this object owns those per-taxonomy actions while
 * {@link TaxonomyListPage} owns new-taxonomy import and templates.
 *
 * The delete confirm word is the one localized string a test must reproduce: it
 * is read from the dialog (`.textContent()`, not a text match) and typed back, so
 * the coverage stays deployment-agnostic.
 */
export class TaxonomyDetailPage {
  private readonly s = TAXONOMY_SELECTORS;
  readonly menuButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.menuButton = page.locator(this.s.menuButton).first();
  }

  /** Navigates straight to a taxonomy's detail page. */
  async goto(id: number): Promise<void> {
    const base = await authoringMfeBaseFromHome(this.page, this.config);
    await this.page.goto(`${base}/taxonomy/${id}`, { waitUntil: 'domcontentloaded' });
    await this.menuButton.waitFor();
  }

  private async openMenu(): Promise<void> {
    await this.menuButton.click();
    await this.page.locator(this.s.menuExport).waitFor();
  }

  /** Exports the taxonomy in `format`, returning the download event. */
  async export(id: number, format: 'csv' | 'json'): Promise<Download> {
    await this.openMenu();
    await this.page.locator(this.s.menuExport).click();
    await this.page
      .locator(format === 'csv' ? this.s.exportFormatCsv : this.s.exportFormatJson)
      .check();
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.locator(this.s.exportButton(id)).click(),
    ]);
    return download;
  }

  /**
   * Re-imports `file` into this taxonomy through the wizard: export → upload →
   * plan → confirm. Waits for the confirm `PUT tags/import/`. The upload-step and
   * confirm-step primary buttons have no test id, so they are the footer primary.
   */
  async reimport(id: number, file: ImportFile): Promise<void> {
    await this.openMenu();
    await this.page.locator(this.s.menuImport).click();
    // Re-import opens on the export step; skip it.
    await this.page.locator(this.s.wizardNext).click();
    await this.page.locator(this.s.uploadStep).waitFor();
    await this.page.locator(this.s.dropzoneInput).setInputFiles({
      name: file.name,
      mimeType: file.mimeType,
      buffer: file.buffer,
    });
    await this.page.locator(this.s.fileInfo).waitFor();
    // Upload-step primary (generatePlan) → plan step.
    await this.page.locator(this.s.wizardPrimaryButton).click();
    await this.page.locator(this.s.planStep).waitFor({ timeout: TIMEOUTS.taxonomyImport });
    await this.page.locator(this.s.wizardContinue).click();
    await this.page.locator(this.s.confirmStep).waitFor();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes(`${TAGGING_BASE}/taxonomies/${id}/tags/import/`) &&
          !r.url().includes('/plan/') &&
          r.request().method() === 'PUT',
        { timeout: TIMEOUTS.taxonomyImport },
      ),
      // Confirm-step primary (confirmImportTags) has no test id.
      this.page.locator(this.s.wizardPrimaryButton).click(),
    ]);
    if (!response.ok()) {
      throw new Error(`Re-import failed: ${response.status()} ${await response.text()}`);
    }
  }

  /**
   * Deletes the taxonomy: opens the dialog, reads its confirm word, types it back
   * and confirms. Waits for the `DELETE` to complete.
   */
  async delete(id: number): Promise<void> {
    await this.openMenu();
    await this.page.locator(this.s.menuDelete).click();
    await this.page.locator(this.s.deleteDialog).waitFor();
    const word = (await this.page.locator(this.s.deleteConfirmWord).textContent())?.trim() ?? '';
    if (word === '') throw new Error('The delete dialog exposed no confirmation word.');
    await this.page.locator(this.s.deleteConfirmInput).fill(word);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes(`${TAGGING_BASE}/taxonomies/${id}/`) &&
          r.request().method() === 'DELETE',
        { timeout: TIMEOUTS.action },
      ),
      this.page.locator(this.s.deleteButton).click(),
    ]);
    if (!response.ok()) {
      throw new Error(`Delete failed: ${response.status()} ${await response.text()}`);
    }
  }

  /** Assigns the taxonomy to all orgs via the manage-orgs modal ("all orgs" + Save). */
  async assignAllOrgs(): Promise<void> {
    await this.openMenu();
    await this.page.locator(this.s.menuManageOrgs).click();
    await this.page.locator(this.s.manageOrgsModal).waitFor();
    await this.page.locator(this.s.manageOrgsAllCheckbox).check();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes(`${TAGGING_BASE}/taxonomies/`) &&
          r.url().includes('/orgs/') &&
          r.request().method() === 'PUT',
        { timeout: TIMEOUTS.action },
      ),
      this.page.locator(this.s.manageOrgsSave).click(),
    ]);
    if (!response.ok()) {
      throw new Error(`Assign orgs failed: ${response.status()} ${await response.text()}`);
    }
  }
}
