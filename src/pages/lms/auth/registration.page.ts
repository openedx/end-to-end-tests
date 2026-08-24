import type { Locator, Page } from '@playwright/test';

import type { AppConfig } from '../../../config';
import type { LearnerIdentity } from '../../../api';

/**
 * The authn MFE `/register` screen (`frontend-app-authn`). Locators and single-
 * surface actions only; the deprecated Django registration page is out of scope.
 *
 * Controls are located by their stable `name`/role rather than Paragon CSS
 * classes (ADR locator priority).
 */
export class RegistrationPage {
  readonly name: Locator;
  readonly username: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly submitButton: Locator;
  /** Per-field validation messages the MFE renders in an alert region. */
  readonly errorAlert: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.name = page.locator('input[name="name"]');
    this.username = page.locator('input[name="username"]');
    this.email = page.locator('input[name="email"]');
    this.password = page.locator('input[name="password"]');
    // Stable `name` attribute rather than the localized "Create an account" label.
    this.submitButton = page.locator('button[name="register-user"]');
    this.errorAlert = page.getByRole('alert');
  }

  /** Navigates to the registration screen. `${LMS}/register` redirects to the MFE. */
  async goto(): Promise<void> {
    await this.page.goto(`${this.config.baseUrls.lms}/register`);
    await this.name.waitFor();
  }

  /** Fills every field from an identity. Does not submit. */
  async fillForm(identity: LearnerIdentity): Promise<void> {
    await this.name.fill(identity.name);
    await this.username.fill(identity.username);
    await this.email.fill(identity.email);
    await this.password.fill(identity.password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Fills the whole form from an identity and submits it. */
  async register(identity: LearnerIdentity): Promise<void> {
    await this.fillForm(identity);
    await this.submit();
  }
}
