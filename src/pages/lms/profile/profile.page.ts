import type { Locator, Page, Response } from '@playwright/test';

import { PROFILE_SELECTORS, type AppConfig } from '../../../config';

/**
 * The profile's editable fields, by the id the MFE gives each one's control:
 * a select or textarea for the "about" sections, one input per social
 * platform.
 */
export type ProfileField =
  | 'country'
  | 'languageProficiencies'
  | 'levelOfEducation'
  | 'bio'
  | 'social-x'
  | 'social-facebook'
  | 'social-linkedin';

/**
 * A learner's profile page (`frontend-app-profile`). Locators and
 * single-surface actions; each save returns the account write it caused, which
 * the spec reads back through the accounts API.
 */
export class ProfilePage {
  readonly certificateLinks: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.certificateLinks = page.locator(PROFILE_SELECTORS.certificateLink);
  }

  url(username: string): string {
    return `${this.config.baseUrls.apps}/profile/u/${username}`;
  }

  /** Opens a profile and waits for the account read it renders from. */
  async goto(username: string): Promise<void> {
    const loaded = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${this.config.baseUrls.lms}/api/user/v1/accounts/${username}`) &&
        r.request().method() === 'GET',
    );
    await this.page.goto(this.url(username));
    await loaded;
  }

  /** A field's control, once its section is being edited. */
  control(field: ProfileField): Locator {
    return this.page.locator(`form #${field}`);
  }

  /** The form a field is edited in. */
  private editor(field: ProfileField): Locator {
    return this.page.locator(`form:has(#${field})`);
  }

  /**
   * Opens an empty field for editing. The empty-state buttons carry no id and
   * their labels are localized, so each is tried in turn until the form holding
   * the wanted control opens; any other form opened on the way is cancelled.
   */
  async openEmpty(field: ProfileField): Promise<void> {
    const buttons = this.page.locator(PROFILE_SELECTORS.emptyStateButton);
    await buttons.first().waitFor();
    const count = await buttons.count();
    const openForm = this.page.locator('form:has(button[type="submit"])');
    for (let index = 0; index < count; index += 1) {
      await buttons.nth(index).click();
      await openForm.first().waitFor();
      if ((await this.control(field).count()) > 0) return;
      await openForm.first().locator(PROFILE_SELECTORS.cancel).click();
      await openForm.first().waitFor({ state: 'detached' });
    }
    throw new Error(`The profile offers no empty "${field}" field to add.`);
  }

  /** The values a select field offers, leaving out the empty placeholder. */
  async options(field: ProfileField): Promise<readonly string[]> {
    return this.control(field)
      .locator('option')
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).filter((v) => v !== ''),
      );
  }

  /**
   * Saves the form a field is being edited in and waits for the account write
   * it sends (`PATCH /api/user/v1/accounts/<username>`), returning it.
   */
  async save(field: ProfileField): Promise<Response> {
    const written = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${this.config.baseUrls.lms}/api/user/v1/accounts/`) &&
        r.request().method() === 'PATCH',
    );
    const editor = this.editor(field);
    await editor.locator('button[type="submit"]').click();
    const response = await written;
    // The field returns to its view state once the save has landed.
    await editor.waitFor({ state: 'detached' });
    return response;
  }
}
