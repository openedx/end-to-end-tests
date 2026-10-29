import type { Download, Locator, Page } from '@playwright/test';

import { TAXONOMY_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { TAGGING_BASE, type ImportableTaxonomyType } from '../../../api';
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

  /** Every taxonomy card on the list page. */
  get cards(): Locator {
    return this.page.locator(this.s.cardAny);
  }

  /** A taxonomy's card on the list page, by id. */
  card(id: number): Locator {
    return this.page.locator(this.s.card(id));
  }

  /** The icons of the given type on one taxonomy's card. */
  cardTypeIcon(id: number, type: ImportableTaxonomyType): Locator {
    return this.card(id).locator(this.s.typeIcon(type));
  }

  /** Every type icon inside one taxonomy's card (a card holds exactly one). */
  cardTypeIcons(id: number): Locator {
    return this.card(id).locator(this.s.anyTypeIcon);
  }

  /**
   * Reads every card on the page in one browser call: its `data-testid` and how
   * many type icons it holds. One read, so cards that another test adds or
   * deletes meanwhile cannot make the card list and the icon counts disagree.
   */
  async cardIconCounts(): Promise<{ card: string; icons: number }[]> {
    return this.cards.evaluateAll(
      (cards, iconSelector) =>
        cards.map((card) => ({
          card: card.getAttribute('data-testid') ?? '',
          icons: card.querySelectorAll(iconSelector).length,
        })),
      this.s.anyTypeIcon,
    );
  }

  /** The populate step's Taxonomy Type `<select>`; the spec reads its value and options. */
  get typeSelect(): Locator {
    return this.page.locator(this.s.typeSelect);
  }

  /** The populate step's Taxonomy Type `<option>` elements. */
  get typeOptions(): Locator {
    return this.typeSelect.locator('option');
  }

  /** The populate step's name input. */
  private get populateNameInput(): Locator {
    return this.page.locator(this.s.populateNameInput);
  }

  /** The populate step's description textarea. */
  private get populateDescInput(): Locator {
    return this.page.locator(this.s.populateDescInput);
  }

  /**
   * Opens the import wizard, drops `file` and advances upload → populate. Leaves
   * the wizard on the populate step.
   */
  async openImportToPopulate(file: ImportFile): Promise<void> {
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
  }

  /**
   * Fills the populate step: name, description and, when given, the Taxonomy Type
   * (chosen after the description, the order the fields appear in).
   */
  async fillPopulate(
    name: string,
    options: { readonly description?: string; readonly type?: ImportableTaxonomyType } = {},
  ): Promise<void> {
    await this.populateNameInput.fill(name);
    // The Import button stays disabled until both name and description are set.
    await this.populateDescInput.fill(options.description ?? 'E2E suite taxonomy');
    if (options.type !== undefined) await this.chooseType(options.type);
  }

  /** Picks the Taxonomy Type on the populate step; the last choice is what the import sends. */
  async chooseType(type: ImportableTaxonomyType): Promise<void> {
    await this.typeSelect.selectOption(type);
  }

  /**
   * Clicks Import on the populate step and returns the created taxonomy's id from
   * the `POST import/` response.
   */
  async submitImport(): Promise<number> {
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

  /**
   * Imports a new taxonomy from `file`, naming it `name` and, when `type` is
   * given, choosing that Taxonomy Type. Returns the created taxonomy's id from the
   * `POST import/` response.
   */
  async importNewTaxonomy(
    file: ImportFile,
    name: string,
    type?: ImportableTaxonomyType,
  ): Promise<number> {
    await this.openImportToPopulate(file);
    await this.fillPopulate(name, { type });
    return this.submitImport();
  }

  /** Downloads an import template, returning the browser download event. */
  async downloadTemplate(format: 'csv' | 'json'): Promise<Download> {
    await this.templateToggle.click();
    const item = this.page.locator(format === 'csv' ? this.s.templateCsv : this.s.templateJson);
    const [download] = await Promise.all([this.page.waitForEvent('download'), item.click()]);
    return download;
  }
}
