import type { Download, Locator, Page } from '@playwright/test';

import { TAXONOMY_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { TAGGING_BASE } from '../../../api';
import { authoringMfeBaseFromHome } from '../authoring-base';

/** A file the import wizard uploads (Playwright's `setInputFiles` payload shape). */
export interface ImportFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

/**
 * The taxonomy list page (`/taxonomies`) — staff only. Drives the new-taxonomy
 * import wizard, the template downloads and navigation into a taxonomy's detail
 * page. The MFE mount is release-varying, so the URL is derived from the admin's
 * Studio-home redirect ({@link authoringMfeBaseFromHome}).
 *
 * Locators and single actions only; the spec asserts against the content-tagging
 * API (the new taxonomy's tags), the download events and the author's drawer.
 */
export class TaxonomyListPage {
  private readonly s = TAXONOMY_SELECTORS;
  readonly importButton: Locator;
  readonly templateToggle: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.importButton = page.locator(this.s.importButton);
    this.templateToggle = page.locator(this.s.templateToggle);
  }

  /**
   * Opens the taxonomy list (`/taxonomies`). A cold load of the route occasionally
   * settles on Studio home before the router registers the tagging routes, so this
   * reloads once if the Import button has not appeared, which the router has by
   * then registered.
   */
  async goto(): Promise<void> {
    const base = await authoringMfeBaseFromHome(this.page, this.config);
    const url = `${base}/taxonomies`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    const appeared = await this.importButton
      .waitFor({ timeout: TIMEOUTS.action })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await this.importButton.waitFor();
    }
  }

  /** A taxonomy's card. */
  card(id: number): Locator {
    return this.page.locator(this.s.card(id));
  }

  /** Opens a taxonomy's detail page by clicking its card. */
  async openTaxonomy(id: number): Promise<void> {
    await this.card(id).click();
    await this.page.waitForURL((url) => url.pathname.includes(`/taxonomy/${id}`));
    await this.page.locator(this.s.menuButton).first().waitFor();
  }

  /**
   * Imports a new taxonomy from `file`, naming it `name`. Opens the wizard, drops
   * the file, advances upload → populate, types the name and imports. Returns the
   * created taxonomy's id from the `POST import/` response.
   */
  async importNewTaxonomy(file: ImportFile, name: string): Promise<number> {
    await this.importButton.click();
    await this.page.locator(this.s.uploadStep).waitFor();
    await this.page.locator(this.s.dropzoneInput).setInputFiles({
      name: file.name,
      mimeType: file.mimeType,
      buffer: file.buffer,
    });
    await this.page.locator(this.s.fileInfo).waitFor();
    // Upload step's advance button (populateData) has no test id: the footer primary.
    await this.page.locator(this.s.wizardPrimaryButton).click();
    await this.page.locator(this.s.populateStep).waitFor();
    await this.page.locator(this.s.populateNameInput).fill(name);
    // The Import button stays disabled until both name and description are set.
    await this.page.locator(this.s.populateDescInput).fill('E2E suite taxonomy');
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes(`${TAGGING_BASE}/taxonomies/import/`) && r.request().method() === 'POST',
        { timeout: TIMEOUTS.taxonomyImport },
      ),
      this.page.locator(this.s.wizardImport).click(),
    ]);
    if (!response.ok()) {
      throw new Error(`Taxonomy import failed: ${response.status()} ${await response.text()}`);
    }
    const body = (await response.json()) as { id: number };
    return body.id;
  }

  /** Downloads an import template, returning the browser download event. */
  async downloadTemplate(format: 'csv' | 'json'): Promise<Download> {
    await this.templateToggle.click();
    const item = this.page.locator(format === 'csv' ? this.s.templateCsv : this.s.templateJson);
    const [download] = await Promise.all([this.page.waitForEvent('download'), item.click()]);
    return download;
  }
}
