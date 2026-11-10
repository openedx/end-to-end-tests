import type { Download, Locator, Page, Response } from '@playwright/test';

import { FILES_ROW_MENU, STUDIO_FILES_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { authoringCourseBaseUrl } from '../authoring-base';
import { waitForWrite } from '../wait-for-write';

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

  /**
   * Clicks "Agree" on the first outstanding upload-agreement banner, waiting for
   * the `agreement_record` write it fires. Returns that response; the spec
   * judges acceptance by the `agreement_record` API and the banners left.
   */
  async acceptFirstAgreement(): Promise<Response> {
    const banner = this.page.locator(STUDIO_FILES_SELECTORS.agreementAlert).first();
    return waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/agreement_record/', timeout: TIMEOUTS.studioSettingsSave },
      () => banner.locator(STUDIO_FILES_SELECTORS.agreementAgreeButton).click(),
    );
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

  /** One asset's card / its 3-dot menu button, by asset id. */
  card(assetId: string): Locator {
    return this.page.locator(this.s.card(assetId));
  }

  itemMenuButton(assetId: string): Locator {
    return this.page.locator(this.s.itemMenu(assetId));
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

  /**
   * Checks the header "select all" box (force: the box sits behind a styled label)
   * and waits until every row reads selected. The table can re-render once more
   * just after its rows first show, dropping a selection made in that window (the
   * bulk Actions then stay disabled), so the box is re-checked until it holds.
   */
  async selectAll(): Promise<void> {
    const unselectedRow = this.page.locator(`${this.s.rowCheckbox}:not(:checked)`).first();
    const deadline = Date.now() + TIMEOUTS.action;
    const holds = () =>
      unselectedRow
        .waitFor({ state: 'detached', timeout: TIMEOUTS.optionalOverlay })
        .then(() => true)
        .catch(() => false);
    // `setChecked` throws when a click does not change the box; that is the case
    // being retried, so the final wait below reports it instead.
    const check = () =>
      this.selectAllCheckbox.setChecked(true, { force: true }).catch(() => undefined);
    await check();
    while (!(await holds())) {
      if (Date.now() > deadline) break;
      await check();
    }
    // One last wait so a failure names the unselected rows, not the bulk menu.
    await unselectedRow.waitFor({ state: 'detached', timeout: TIMEOUTS.optionalOverlay });
  }

  /** Opens an asset's 3-dot menu (card or list row). */
  async openItemMenu(assetId: string): Promise<void> {
    await this.itemMenuButton(assetId).click();
  }

  /** A link of the currently open dropdown menu, by index. */
  private openMenuLink(index: number): Locator {
    return this.page.locator(this.s.openMenuLink).nth(index);
  }

  /** Whether an asset's menu offers the two "Copy … URL" items (they are the first two). */
  async menuOffersCopyLinks(assetId: string): Promise<boolean> {
    await this.openItemMenu(assetId);
    const studio = await this.openMenuLink(FILES_ROW_MENU.copyStudioUrl).isVisible();
    const web = await this.openMenuLink(FILES_ROW_MENU.copyWebUrl).isVisible();
    await this.page.keyboard.press('Escape');
    return studio && web;
  }

  /** Toggles an asset's lock from its menu, waiting for the `PUT /assets/<id>` write. */
  async toggleLock(assetId: string): Promise<void> {
    await this.openItemMenu(assetId);
    await waitForWrite(
      this.page,
      { method: 'PUT', urlIncludes: '/assets/', timeout: TIMEOUTS.contentWrite },
      () => this.openMenuLink(FILES_ROW_MENU.lock).click(),
    );
  }

  /** Downloads an asset from its menu, returning the download event. */
  async download(assetId: string): Promise<Download> {
    await this.openItemMenu(assetId);
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.openMenuLink(FILES_ROW_MENU.download).click(),
    ]);
    return download;
  }

  /** Opens an asset's Info panel and waits for it to render. */
  async openInfo(assetId: string): Promise<void> {
    await this.openItemMenu(assetId);
    await this.openMenuLink(FILES_ROW_MENU.info).click();
    await this.page.locator(this.s.infoUrlDisplay).first().waitFor();
  }

  /** Opens an asset's menu → Delete, then confirms or cancels the dialog. */
  async openDeleteDialog(assetId: string): Promise<void> {
    await this.openItemMenu(assetId);
    await this.page.locator(this.s.deleteMenuItem).click();
    await this.page.locator(this.s.deleteModal).waitFor();
  }

  async confirmDelete(): Promise<void> {
    await waitForWrite(
      this.page,
      { method: 'DELETE', urlIncludes: '/assets/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(this.s.deleteConfirmButton).click(),
    );
  }

  async cancelDelete(): Promise<void> {
    await this.page.locator(this.s.deleteCancelButton).click();
    await this.page.locator(this.s.deleteModal).waitFor({ state: 'hidden' });
  }

  /** Opens the bulk "Actions" menu (needs at least one row selected). */
  async openBulkActions(): Promise<void> {
    await this.page.locator(this.s.actionsToggle).click();
  }

  /** Bulk-downloads the selected rows, returning the download event. */
  async bulkDownload(): Promise<Download> {
    await this.openBulkActions();
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.openMenuLink(0).click(),
    ]);
    return download;
  }

  /** Opens the bulk delete confirmation for the selected rows. */
  async openBulkDeleteDialog(): Promise<void> {
    await this.openBulkActions();
    await this.page.locator(this.s.deleteMenuItem).click();
    await this.page.locator(this.s.deleteModal).waitFor();
  }

  /** Confirms a delete dialog (bulk), waiting for a `DELETE /assets/` write. */
  async confirmBulkDelete(): Promise<void> {
    await waitForWrite(
      this.page,
      { method: 'DELETE', urlIncludes: '/assets/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(this.s.deleteConfirmButton).click(),
    );
  }
}
