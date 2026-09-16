import type { Locator, Page } from '@playwright/test';

import { STUDIO_FILES_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { authoringCourseBaseUrl } from '../authoring-base';

/** A file the "Add files" control uploads (Playwright `setInputFiles` payload). */
export interface UploadFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

/** A sort option in the "Sort and filter" modal (its radio value). */
export type FilesSort =
  | 'displayName,asc'
  | 'displayName,desc'
  | 'dateAdded,asc'
  | 'dateAdded,desc'
  | 'fileSize,asc'
  | 'fileSize,desc';

/**
 * The Studio Files page — the course asset library (a Paragon DataTable with card
 * and list views). Search, sort and filter run client-side over the loaded set,
 * so the spec asserts on the rendered card/row count (keyed by asset id) and on
 * the assets API; this object only drives the controls. Sort and filter share one
 * "Sort and filter" modal whose radios/checkboxes carry stable values.
 */
export class FilesPage {
  private readonly s = STUDIO_FILES_SELECTORS;
  private base?: string;
  readonly dataTable: Locator;
  readonly dropzone: Locator;
  readonly searchInput: Locator;
  readonly cards: Locator;
  readonly rows: Locator;
  readonly selectAllCheckbox: Locator;
  readonly rowCheckboxes: Locator;
  readonly uploadInput: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.dataTable = page.locator(this.s.dataTable);
    this.dropzone = page.locator(this.s.dropzone);
    this.searchInput = page.locator(this.s.searchInput);
    this.cards = page.locator(this.s.cards);
    this.rows = page.locator(this.s.rows);
    this.selectAllCheckbox = page.locator(this.s.selectAllCheckbox);
    this.rowCheckboxes = page.locator(this.s.rowCheckbox);
    this.uploadInput = page.locator(this.s.uploadInput);
  }

  /** Opens the Files page and waits for the table or the empty-state dropzone. */
  async goto(courseKey: string): Promise<void> {
    this.base ??= await authoringCourseBaseUrl(this.page, this.config, courseKey);
    await this.page.goto(`${this.base}/assets`, { waitUntil: 'domcontentloaded' });
    await this.page
      .locator(`${this.s.dataTable}, ${this.s.dropzone}`)
      .first()
      .waitFor({ timeout: TIMEOUTS.navigation });
  }

  /** One asset's card / its 3-dot menu button / its list row, by asset id. */
  card(assetId: string): Locator {
    return this.page.locator(this.s.card(assetId));
  }

  itemMenuButton(assetId: string): Locator {
    return this.page.locator(this.s.itemMenu(assetId));
  }

  rowFor(assetId: string): Locator {
    return this.page.locator(this.s.rowFor(assetId));
  }

  /** Types into the name search (client-side filter). */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
  }

  /** Clears the name search. */
  async clearSearch(): Promise<void> {
    await this.searchInput.fill('');
  }

  /** Switches to card or list view (idempotent). */
  async setView(view: 'card' | 'list'): Promise<void> {
    const button = this.page.locator(
      view === 'card' ? this.s.viewCardButton : this.s.viewListButton,
    );
    if (!(await button.evaluate((el, cls) => el.classList.contains(cls), this.s.viewActiveClass))) {
      await button.click();
    }
  }

  /** Uploads one or more files through the hidden "Add files" input. */
  async upload(files: readonly UploadFile[]): Promise<void> {
    await this.uploadInput.setInputFiles(
      files.map((f) => ({ name: f.name, mimeType: f.mimeType, buffer: f.buffer })),
    );
  }

  /** Opens the "Sort and filter" modal. */
  private async openSortFilter(): Promise<void> {
    await this.page.locator(this.s.sortFilterButton).click();
    await this.page.locator(this.s.modalApply).waitFor();
  }

  /** Sorts by one of the modal's options and applies. */
  async sortBy(sort: FilesSort): Promise<void> {
    await this.openSortFilter();
    // The radio is hidden inside a clickable selectable-box (role=button).
    await this.page.locator(this.s.sortRadio(sort)).click();
    await this.page.locator(this.s.modalApply).click();
  }

  /** Applies one file-type / status filter (`image`, `document`, `locked`, …) and applies. */
  async filterBy(value: string): Promise<void> {
    await this.openSortFilter();
    await this.page.locator(this.s.filterCheckbox(value)).check();
    await this.page.locator(this.s.modalApply).click();
  }

  /** Clears all sort/filter selections in the modal. */
  async clearFilters(): Promise<void> {
    await this.openSortFilter();
    await this.page.locator(this.s.modalClearAll).click();
    await this.page.locator(this.s.modalApply).click();
  }

  /** Checks the header "select all" box (force: the box sits behind a styled label). */
  async selectAll(): Promise<void> {
    await this.selectAllCheckbox.click({ force: true });
  }

  /** Opens an asset's 3-dot menu (card or list row). */
  async openItemMenu(assetId: string): Promise<void> {
    await this.itemMenuButton(assetId).click();
  }

  /** Opens an asset's menu and clicks its Delete item (the one testid'd action). */
  async deleteViaMenu(assetId: string): Promise<void> {
    await this.openItemMenu(assetId);
    await this.page.locator(this.s.menuItem('open-delete-confirmation-button')).click();
  }
}
