import type { Locator, Page, Response } from '@playwright/test';

import { TAXONOMY_SELECTORS, TIMEOUTS } from '../../../config';
import { TAGGING_BASE, type ImportableTaxonomyType } from '../../../api';

/** A file the import wizard uploads (Playwright's `setInputFiles` payload shape). */
export interface ImportFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

/**
 * The new-taxonomy import wizard (a Paragon `Stepper` in a `ModalDialog`), which the
 * taxonomy list page and the Competency Management page both open from their own
 * button. This object drives the steps inside the dialog; opening it is the owning
 * page's action.
 *
 * The object holds locators and single actions only. The wizard closes on success and
 * on failure alike, so {@link submitImport} hands back the `POST import/` response and
 * the spec decides what the outcome was.
 */
export class ImportWizardBlock {
  private readonly s = TAXONOMY_SELECTORS;
  readonly dialog: Locator;
  readonly uploadStep: Locator;
  readonly populateStep: Locator;
  readonly planStep: Locator;
  readonly confirmStep: Locator;
  readonly dropzone: Locator;
  /** The dropzone once it has rejected a dropped file. */
  readonly rejectedDropzone: Locator;
  /** The block that replaces the dropzone once a file is accepted. */
  readonly fileInfo: Locator;
  /** The footer's primary button: "Continue" on the Upload step. */
  readonly primaryButton: Locator;
  readonly importButton: Locator;
  /** The footer's Continue button (the plan step's), found by its test id. */
  readonly continueButton: Locator;
  readonly typeSelect: Locator;
  readonly typeOptions: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.locator(this.s.dialog);
    this.uploadStep = this.dialog.locator(this.s.uploadStep);
    this.populateStep = this.dialog.locator(this.s.populateStep);
    this.planStep = this.dialog.locator(this.s.planStep);
    this.confirmStep = this.dialog.locator(this.s.confirmStep);
    this.dropzone = this.dialog.locator(this.s.dropzone);
    this.rejectedDropzone = this.dialog.locator(this.s.dropzoneRejected);
    this.fileInfo = this.dialog.locator(this.s.fileInfo);
    // Built from the page: the selector starts with `.pgn__modal`, which is the dialog
    // element itself and so does not match as a descendant of it.
    this.primaryButton = page.locator(this.s.wizardPrimaryButton);
    this.importButton = this.dialog.locator(this.s.wizardImport);
    this.continueButton = this.dialog.locator(this.s.wizardContinue);
    this.typeSelect = this.dialog.locator(this.s.typeSelect);
    this.typeOptions = this.typeSelect.locator('option');
    this.nameInput = this.dialog.locator(this.s.populateNameInput);
    this.descriptionInput = this.dialog.locator(this.s.populateDescInput);
  }

  /** Waits for the wizard to show its Upload step, where a new import opens. */
  async waitForUpload(): Promise<void> {
    await this.uploadStep.waitFor();
  }

  /**
   * Hands `file` to the Upload step's dropzone without advancing. It does not wait for
   * an outcome: an accepted file shows {@link fileInfo}, a rejected one
   * {@link rejectedDropzone}, and the spec asserts the one it expects.
   */
  async chooseFile(file: ImportFile): Promise<void> {
    await this.dialog.locator(this.s.dropzoneInput).setInputFiles({
      name: file.name,
      mimeType: file.mimeType,
      buffer: file.buffer,
    });
  }

  /** Clicks Continue on the Upload step and waits for the Populate step. */
  async continueToPopulate(): Promise<void> {
    // The Upload step's Continue button has no test id, so it is found as the footer's
    // primary button.
    await this.primaryButton.click();
    await this.populateStep.waitFor();
  }

  /**
   * Chooses `file` on the Upload step, waits for it to be accepted and advances to the
   * Populate step.
   */
  async uploadToPopulate(file: ImportFile): Promise<void> {
    await this.chooseFile(file);
    await this.fileInfo.waitFor();
    await this.continueToPopulate();
  }

  /**
   * Fills the populate step: name, description and, when given, the Taxonomy Type
   * (chosen after the description, the order the fields appear in).
   */
  async fillPopulate(
    name: string,
    options: { readonly description?: string; readonly type?: ImportableTaxonomyType } = {},
  ): Promise<void> {
    await this.nameInput.fill(name);
    // The Import button stays disabled until both name and description are set.
    await this.descriptionInput.fill(options.description ?? 'E2E suite taxonomy');
    if (options.type !== undefined) await this.chooseType(options.type);
  }

  /** Picks the Taxonomy Type on the populate step; the last choice is what the import sends. */
  async chooseType(type: ImportableTaxonomyType): Promise<void> {
    await this.typeSelect.selectOption(type);
  }

  /**
   * Clicks Import on the populate step and returns the `POST import/` response
   * whatever its status; the caller decides whether a failure throws.
   */
  async submitImport(): Promise<Response> {
    const [response] = await Promise.all([this.waitForImportResponse(), this.importButton.click()]);
    return response;
  }

  /**
   * Clicks Import while the button is disabled. The button is disabled with
   * `aria-disabled` only. Playwright's `click` treats such a button as not enabled and
   * waits for it to become enabled, so the click event is dispatched to the button
   * directly. The app swallows it.
   */
  async clickDisabledImport(): Promise<void> {
    await this.importButton.dispatchEvent('click');
  }

  /**
   * Double-clicks Import on the populate step and returns the first `POST import/`
   * response. The guard against a second submission is the thing under test, so the
   * caller counts the requests itself.
   */
  async doubleClickImport(): Promise<Response> {
    const [response] = await Promise.all([
      this.waitForImportResponse(),
      this.importButton.dblclick(),
    ]);
    return response;
  }

  /** Clicks the footer's Cancel button and waits for the wizard to close. */
  async cancel(): Promise<void> {
    await this.dialog.locator(this.s.wizardCancel).click();
    await this.dialog.waitFor({ state: 'detached' });
  }

  /** Clicks the modal's corner close button and waits for the wizard to close. */
  async close(): Promise<void> {
    await this.dialog.locator(this.s.wizardClose).click();
    await this.dialog.waitFor({ state: 'detached' });
  }

  /**
   * Starts recording the `POST import/` requests the page sends, as `METHOD /path`
   * lines. The returned array fills as requests are sent. The recorder only observes:
   * nothing is routed or delayed (ADR-0003). Call it before the interaction under test.
   */
  recordImportRequests(): string[] {
    const sent: string[] = [];
    this.page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (request.method() === 'POST' && pathname.endsWith(`${TAGGING_BASE}/taxonomies/import/`)) {
        sent.push(`${request.method()} ${pathname}`);
      }
    });
    return sent;
  }

  private waitForImportResponse(): Promise<Response> {
    return this.page.waitForResponse(
      (r) =>
        r.url().includes(`${TAGGING_BASE}/taxonomies/import/`) && r.request().method() === 'POST',
      { timeout: TIMEOUTS.taxonomyImport },
    );
  }
}
