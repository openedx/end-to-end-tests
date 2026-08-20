import type { Locator, Page } from '@playwright/test';

import type { AppConfig } from '../../../config';

/**
 * The header account menu that carries the sign-out affordance, shown once a
 * learner is signed in (the MFE header from `@openedx/frontend-component-header`).
 *
 * The menu trigger is a button whose accessible name is "Account menu for
 * {username}" (the `header.label.account.menu.for` message) — matched loosely on
 * "account menu" so it also covers the plain "Account Menu" label. The sign-out
 * item is a link to `${LMS}/logout`; we target it by href so it is robust to the
 * label being "Logout" vs "Sign Out" and to translation.
 */
export class AccountMenu {
  readonly trigger: Locator;
  readonly signOutLink: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.trigger = page.getByRole('button', { name: /account menu/i });
    this.signOutLink = page.locator('a[href*="/logout"]');
  }

  /** Opens the account dropdown. */
  async open(): Promise<void> {
    await this.trigger.click();
  }

  /** Opens the menu and clicks the sign-out link. */
  async signOut(): Promise<void> {
    await this.open();
    await this.signOutLink.click();
  }

  /**
   * Direct sign-out via the LMS logout URL — a resilient fallback for flows that
   * only need the session cleared, not the menu exercised.
   */
  async signOutDirect(): Promise<void> {
    await this.page.goto(`${this.config.baseUrls.lms}/logout`);
  }
}
