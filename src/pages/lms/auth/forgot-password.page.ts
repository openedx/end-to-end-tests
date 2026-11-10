import type { Locator, Page, Response } from '@playwright/test';

import { TIMEOUTS, type AppConfig } from '../../../config';
import { waitForWrite } from '../../studio/wait-for-write';

/**
 * The authn MFE forgot-password screen (`frontend-app-authn` `/reset` route),
 * which posts to `POST /api/user/v1/account/password_reset/`. Locators and
 * single-surface actions only.
 *
 * The submit control's visible label is a generic, translated "Submit" that also
 * blanks out while the request is pending, so it is matched by its stable element
 * id rather than by accessible name. The confirmation and validation messages
 * both render in the MFE's `#validation-errors` alert.
 */
export class ForgotPasswordPage {
  readonly email: Locator;
  readonly submitButton: Locator;
  /** Success confirmation alert (Paragon success variant), matched by class not text. */
  readonly confirmation: Locator;
  /** Validation/error alert (Paragon danger variant), matched by class not text. */
  readonly error: Locator;
  /** The confirmation's "contact technical support" link. */
  readonly supportLink: Locator;
  /** The reset form a reset link opens: its new-password fields. */
  readonly newPasswordFields: Locator;
  /** That form's "Reset my password" — matched by its stable element id. */
  readonly newPasswordSubmit: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.email = page.locator('input[name="email"]');
    this.submitButton = page.locator('#submit-forget-password');
    // The alert's success/danger variant class is a language-independent signal of
    // the outcome, so we never assert on its localized message text.
    this.confirmation = page.locator('#validation-errors.alert-success');
    this.error = page.locator('#validation-errors.alert-danger');
    this.supportLink = this.confirmation.locator('a[href]');
    this.newPasswordFields = page.locator('form input[type="password"]');
    this.newPasswordSubmit = page.locator('#submit-new-password');
  }

  /** Navigates to the reset screen (the authn MFE `/reset` route). */
  async goto(): Promise<void> {
    await this.page.goto(`${this.config.baseUrls.apps}/authn/reset`);
    await this.email.waitFor();
  }

  /** Fills the email and submits the reset request. */
  async requestReset(email: string): Promise<void> {
    await this.email.fill(email);
    await this.submitButton.click();
  }

  /**
   * Opens the reset link a reset mail carries and waits for the authn MFE's
   * new-password form it leads to.
   */
  async openResetLink(url: string): Promise<void> {
    await this.page.goto(url);
    await this.newPasswordFields.first().waitFor();
  }

  /**
   * On the reset form, enters `password` as the new password and its
   * confirmation, and submits — waiting for the `POST /password/reset/<token>/`
   * it fires. Returns that response; the spec judges the outcome by signing in.
   */
  async setNewPassword(password: string): Promise<Response> {
    await this.page.locator('input[name="newPassword"]').fill(password);
    await this.page.locator('input[name="confirmPassword"]').fill(password);
    return waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/password/reset/', timeout: TIMEOUTS.navigation },
      () => this.newPasswordSubmit.click(),
    );
  }
}
