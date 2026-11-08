import type { Locator, Page, Response } from '@playwright/test';

import { LIBRARY_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { waitForWrite } from '../wait-for-write';

/**
 * The legacy "Create new library" form (`/libraries-v1/create`), which Studio
 * Home's "New library" opens from the Legacy Libraries tab on `verawood`
 * (`content-libraries-v1-create`; `main` no longer ships it): title,
 * organization (the same autosuggest as the v2 form), library code, and a
 * "Create" submit that posts to Studio's legacy `/library/` handler.
 */
export class CreateLegacyLibraryPage {
  private readonly s = LIBRARY_SELECTORS;
  readonly titleInput: Locator;
  readonly orgInput: Locator;
  readonly numberInput: Locator;
  readonly submitButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
    this.titleInput = page.locator(this.s.createLegacyTitleInput);
    this.orgInput = page.locator(this.s.createOrgInput);
    this.numberInput = page.locator(this.s.createLegacyNumberInput);
    this.submitButton = page.locator(this.s.createSubmitButton);
  }

  async fillForm(library: { title: string; org: string; number: string }): Promise<void> {
    await this.titleInput.fill(library.title);
    await this.orgInput.fill(library.org);
    // Picking the org from the autosuggest (rather than leaving free text) is
    // what makes the field valid where new organizations are not allowed.
    const option = this.page.locator(this.s.createOrgOption(library.org));
    const offered = await option
      .waitFor({ timeout: TIMEOUTS.optionalOverlay })
      .then(() => true)
      .catch(() => false);
    if (offered) {
      await option.click();
    } else {
      await this.orgInput.press('Enter');
    }
    await this.numberInput.fill(library.number);
  }

  /**
   * Submits the form, waiting for the `POST /library/` it causes; the answer's
   * body carries the new `library_key`. The MFE then returns to the Legacy
   * Libraries tab.
   */
  async submit(): Promise<Response> {
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new URL(r.url()).pathname === '/library/',
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.submitButton.click(),
    );
  }
}
