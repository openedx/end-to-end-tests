import type { Locator, Page, Response } from '@playwright/test';

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
/**
 * The drop-down fields a spec edits: the section each sits in, its position
 * among that section's Edit buttons, and the `name` its control carries once
 * open ("Year of birth" under Account Information, "Education" under Profile
 * Information).
 */
const ACCOUNT_SELECT_FIELDS = {
  yearOfBirth: { section: 'basic-information', position: 2, name: 'year_of_birth' },
  levelOfEducation: { section: 'profile-information', position: 0, name: 'level_of_education' },
} as const;

export type AccountSelectField = keyof typeof ACCOUNT_SELECT_FIELDS;

export class AccountSettingsPage {
  private readonly basicInformation: Locator;
  private readonly sitePreferences: Locator;
  /** The Site language select, present once its field is being edited. */
  readonly siteLanguageSelect: Locator;
  /** "Reset Password" in the Account Information section: its one stateful button. */
  readonly resetPasswordButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.basicInformation = page.locator('#basic-information');
    this.sitePreferences = page.locator('#site-preferences');
    this.siteLanguageSelect = page.locator('#field-siteLanguage');
    this.resetPasswordButton = this.basicInformation.locator('button.pgn__stateful-btn');
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
   * Saves a new site language. The app stores the preference and then switches
   * the session's language — the frontend-platform MFE through
   * `POST /i18n/setlang/`, the frontend-base app through
   * `PATCH /lang_pref/update_language`; both writes are waited for.
   */
  async saveSiteLanguage(code: string): Promise<void> {
    const lms = this.config.baseUrls.lms;
    const stored = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${lms}/api/user/v1/preferences/`) && r.request().method() === 'PATCH',
    );
    const switched = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${lms}/i18n/setlang/`) ||
        r.url().startsWith(`${lms}/lang_pref/update_language`),
    );
    await this.siteLanguageSelect.selectOption(code);
    await this.sitePreferences.locator('button[type="submit"]').click();
    await Promise.all([stored, switched]);
  }

  /**
   * Presses "Reset Password" (the label is localized) and returns the
   * platform's answer to the reset request the page sends for the signed-in
   * account's e-mail address.
   */
  async requestPasswordReset(): Promise<Response> {
    const sent = this.page.waitForResponse(
      (r) => r.url().includes('/password_reset/') && r.request().method() === 'POST',
    );
    await this.resetPasswordButton.click();
    return sent;
  }

  /**
   * Opens one of the page's drop-down fields for editing and returns its
   * `select`. A field's Edit button carries no id or test id, so it is reached
   * by its position among its section's Edit buttons; the opened control's id
   * (`field-<name>`) then confirms it is the field asked for.
   */
  async editSelectField(field: AccountSelectField): Promise<Locator> {
    const { section, position, name } = ACCOUNT_SELECT_FIELDS[field];
    await this.page.locator(`#${section} .form-group button.ml-3.btn-link`).nth(position).click();
    const control = this.page.locator(`select#field-${name}`);
    await control.waitFor();
    return control;
  }

  /** Chooses `value` in a drop-down field and saves it, returning the account `PATCH`. */
  async saveSelectField(field: AccountSelectField, value: string): Promise<Response> {
    const control = await this.editSelectField(field);
    await control.selectOption(value);
    const saved = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${this.config.baseUrls.lms}/api/user/v1/accounts/`) &&
        r.request().method() === 'PATCH',
    );
    await this.page
      .locator(`#${ACCOUNT_SELECT_FIELDS[field].section} button[type="submit"]`)
      .click();
    const response = await saved;
    await control.waitFor({ state: 'detached' });
    return response;
  }
}
