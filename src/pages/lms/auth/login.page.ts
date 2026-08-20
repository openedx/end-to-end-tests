import type { Locator, Page } from '@playwright/test';

import type { AppConfig } from '../../../config';

/**
 * The authn MFE `/login` screen (`frontend-app-authn`). Locators and single-
 * surface actions only — specs own the assertions. The deprecated Django login
 * page is out of scope.
 *
 * Form controls are located by their stable `name`/role: the authn MFE keeps
 * these constant across releases, whereas its Paragon CSS classes (e.g.
 * `.pgn__form-text-invalid`) are presentational and off-limits per the ADR
 * locator priority.
 */
export class LoginPage {
  readonly emailOrUsername: Locator;
  readonly password: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.emailOrUsername = page.locator('input[name="emailOrUsername"]');
    this.password = page.locator('input[name="password"]');
    this.submitButton = page.getByRole('button', { name: /sign in/i });
    this.errorAlert = page.getByRole('alert');
  }

  /** Navigates to the login screen. `${LMS}/login` redirects to the authn MFE. */
  async goto(): Promise<void> {
    await this.page.goto(`${this.config.baseUrls.lms}/login`);
    await this.emailOrUsername.waitFor();
  }

  /** Fills and submits the sign-in form (no navigation wait — see the step). */
  async signIn(emailOrUsername: string, password: string): Promise<void> {
    await this.emailOrUsername.fill(emailOrUsername);
    await this.password.fill(password);
    await this.submitButton.click();
  }
}
