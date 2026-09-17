import type { Locator, Page, Response } from '@playwright/test';

import { LIBRARIES_V2_PATH } from '../../../api';
import { LIBRARY_SELECTORS, TIMEOUTS, createLibraryPath, type AppConfig } from '../../../config';
import { waitForWrite } from '../wait-for-write';

/**
 * The "Create new library" form (`/library/create`): title, organization
 * (an autosuggest over the orgs the user may create libraries in), library
 * id (slug), and a stateful "Create" submit. Studio Home's "New library" link
 * leads here.
 */
export class CreateLibraryPage {
  private readonly s = LIBRARY_SELECTORS;
  readonly titleInput: Locator;
  readonly orgInput: Locator;
  readonly slugInput: Locator;
  readonly submitButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.titleInput = page.locator(this.s.createTitleInput);
    this.orgInput = page.locator(this.s.createOrgInput);
    this.slugInput = page.locator(this.s.createSlugInput);
    this.submitButton = page.locator(this.s.createSubmitButton);
  }

  async goto(): Promise<void> {
    await this.page.goto(createLibraryPath(this.config));
    await this.titleInput.waitFor();
  }

  async fillForm(library: { title: string; org: string; slug: string }): Promise<void> {
    await this.titleInput.fill(library.title);
    await this.orgInput.fill(library.org);
    // The autosuggest offers the typed org as an option once its dropdown has
    // rendered; picking it (rather than leaving free text) is what makes the
    // field valid. An org outside the user's list never gets an option, and
    // Enter commits the free text — the form then reports it, as the spec expects.
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
    await this.slugInput.fill(library.slug);
  }

  /** Submits the form, waiting for the `POST /api/libraries/v2/`; the MFE then navigates to the library. */
  async submit(): Promise<Response> {
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new URL(r.url()).pathname === LIBRARIES_V2_PATH,
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.submitButton.click(),
    );
  }
}
