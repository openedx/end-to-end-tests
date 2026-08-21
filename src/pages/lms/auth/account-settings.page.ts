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

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.basicInformation = page.locator('#basic-information');
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
}
