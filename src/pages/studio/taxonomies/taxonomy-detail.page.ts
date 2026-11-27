import type { Download, Locator, Page } from '@playwright/test';

import { TAXONOMY_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { TAGGING_BASE } from '../../../api';
import { menuItemTestIds, waitForCompetencyRoute } from './menu';
import { ImportWizardBlock, type ImportFile } from './import-wizard.block';

/**
 * A single taxonomy's detail page (`/taxonomy/<id>`). The admin drives its management
 * actions; a non-staff author or a global-staff user opens it by URL. Its SubHeader
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
  /** The connection-error alert the page shows when the taxonomy request fails. */
  readonly errorAlert: Locator;
  /** The import wizard the menu's re-import item opens. */
  readonly wizard: ImportWizardBlock;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.menuButton = page.locator(this.s.menuButton).first();
    this.errorAlert = page.locator(this.s.connectionError);
    this.wizard = new ImportWizardBlock(page);
  }

  /** Navigates straight to a taxonomy's detail page. */
  async goto(id: number): Promise<void> {
    await this.page.goto(`${this.config.mfeUrls.authoring}/taxonomy/${id}`, {
      waitUntil: 'domcontentloaded',
    });
    await this.menuButton.waitFor();
  }

  /**
   * Opens `/taxonomy/<idSegment>` by URL without waiting for an outcome (the page,
   * a redirect or the error alert).
   */
  async open(idSegment: number | string): Promise<void> {
    await this.page.goto(`${this.config.mfeUrls.authoring}/taxonomy/${idSegment}`, {
      waitUntil: 'domcontentloaded',
    });
  }

  /** Opens the Actions menu; an already open menu stays open, because the toggle would close it. */
  private async openMenu(): Promise<void> {
    if ((await this.menuButton.getAttribute('aria-expanded')) !== 'true') {
      await this.menuButton.click();
    }
    await this.page.locator(this.s.menuExport).waitFor();
  }

  /** Opens the Actions menu and reads the `data-testid` of its items, in DOM order. */
  async menuItemIds(): Promise<string[]> {
    await this.openMenu();
    return menuItemTestIds(this.page.locator(this.s.menuItems));
  }

  /**
   * Chooses "Apply Competencies" in the Actions menu and waits for the Competency
   * Management route.
   */
  async applyCompetencies(): Promise<void> {
    await this.openMenu();
    await this.page.locator(this.s.menuApplyCompetencies).click();
    await waitForCompetencyRoute(this.page);
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
   * Opens the re-import wizard from the Actions menu and waits for its Upload step. A
   * re-import opens on the Export step, which this skips.
   */
  async openReimport(): Promise<void> {
    await this.openMenu();
    await this.page.locator(this.s.menuImport).click();
    await this.page.locator(this.s.wizardNext).click();
    await this.wizard.waitForUpload();
  }

  /**
   * Re-imports `file` through the wizard (export, upload, plan, confirm) and waits for
   * the confirm `PUT tags/import/`. A rejected plan or import throws with its status and
   * body. `atPlan`, when given, runs on the Plan step before the wizard moves on, for the
   * caller to read what the plan shows.
   */
  async reimport(id: number, file: ImportFile, atPlan?: () => Promise<void>): Promise<void> {
    await this.openReimport();
    const plan = await this.wizard.chooseFileForPlan(id, file);
    if (!plan.ok()) {
      throw new Error(`Re-import plan failed: ${plan.status()} ${await plan.text()}`);
    }
    await this.wizard.fileInfo.waitFor();
    await this.wizard.continueToPlan();
    await atPlan?.();
    await this.wizard.continueToConfirm();
    const response = await this.wizard.confirmReimport(id);
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
