import type { Locator, Page } from '@playwright/test';

import type { AppConfig } from '../../../config';

/**
 * The header account menu that carries the sign-out affordance, shown once a
 * learner is signed in (learner dashboard / learning MFE header).
 *
 * The menu trigger's accessible name includes the signed-in user's name, which is
 * the most stable way to find it across the legacy header and the MFE header. The
 * sign-out control is a link once the menu is open.
 */
export class AccountMenu {
  readonly signOutLink: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.signOutLink = page.getByRole('link', { name: /sign out/i });
  }

  /** Opens the account dropdown, identified by the signed-in user's name. */
  async open(displayName: string): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(displayName, 'i') }).click();
  }

  /** Opens the menu and clicks Sign out. */
  async signOut(displayName: string): Promise<void> {
    await this.open(displayName);
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
