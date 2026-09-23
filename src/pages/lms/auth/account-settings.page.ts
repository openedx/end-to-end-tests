import type { Locator, Page } from '@playwright/test';

import type { AppConfig } from '../../../config';

/**
 * The learner account settings screen (`frontend-app-account`, `{APPS}/account`).
 * Covers the TC-00001 profile update (editing the full name). Password reset is
 * covered text-free by the authn MFE flow in `password-reset.spec.ts`.
 *
 * Editable fields expose shared `data-testid`s (`editable-field-edit/textbox/
 * save`) with no per-field, language-independent hook, so the full-name field is
 * reached structurally: it is the first editable field in the Account Information
 * section (`#basic-information`), since the username above it is read-only. This
 * avoids depending on the localized "Full name" label.
 */
export class AccountSettingsPage {
  private readonly basicInformation: Locator;
  private readonly sitePreferences: Locator;
  /** The Site language select, present once its field is being edited. */
  readonly siteLanguageSelect: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.basicInformation = page.locator('#basic-information');
    this.sitePreferences = page.locator('#site-preferences');
    this.siteLanguageSelect = page.locator('#field-siteLanguage');
  }

  /** Navigates to the account settings page and waits for it to render. */
  async goto(): Promise<void> {
    // The trailing slash matters: the account MFE is served at `/account/`, and
    // its SPA router renders nothing (just the app shell) if the slash is missing.
    await this.page.goto(`${this.config.baseUrls.apps}/account/`);
    await this.basicInformation.waitFor();
  }

  /** Edits the full-name field and saves the new value. */
  async updateFullName(newName: string): Promise<void> {
    await this.basicInformation.getByTestId('editable-field-edit').first().click();
    await this.page.getByTestId('editable-field-textbox').fill(newName);
    await this.page.getByTestId('editable-field-save').click();
    // The save control disappears once the field returns to its view state.
    await this.page.getByTestId('editable-field-save').waitFor({ state: 'detached' });
  }

  /**
   * Opens the Site language field for editing and returns the language codes it
   * offers, with the one currently in effect. Site language is the first field
   * of the Site Preferences section; its Edit button carries no test id there,
   * so it is reached by position within the section.
   */
  async editSiteLanguage(): Promise<{
    readonly current: string;
    readonly offered: readonly string[];
  }> {
    await this.sitePreferences.locator('.form-group button.btn-link').first().click();
    await this.siteLanguageSelect.waitFor();
    return {
      current: await this.siteLanguageSelect.inputValue(),
      offered: await this.siteLanguageSelect
        .locator('option')
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
    };
  }

  /**
   * Saves a new site language. The MFE stores the preference and then switches
   * the session's language (`POST /i18n/setlang/`); both are waited for.
   */
  async saveSiteLanguage(code: string): Promise<void> {
    const lms = this.config.baseUrls.lms;
    const stored = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${lms}/api/user/v1/preferences/`) && r.request().method() === 'PATCH',
    );
    const switched = this.page.waitForResponse((r) => r.url().startsWith(`${lms}/i18n/setlang/`));
    await this.siteLanguageSelect.selectOption(code);
    await this.sitePreferences.locator('button[type="submit"]').click();
    await Promise.all([stored, switched]);
  }
}
