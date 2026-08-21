import type { Locator, Page } from '@playwright/test';

import type { AppConfig } from '../../../config';

/** Escapes a string for safe use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The header account menu that carries the sign-out affordance, shown once a
 * learner is signed in (the MFE header from `@openedx/frontend-component-header`).
 *
 * The menu trigger's accessible name is the localized "Account menu for
 * {username}", so we match on the **username** — data the test owns, present in
 * the name in every language — rather than the surrounding localized copy. The
 * sign-out item is targeted by its `/logout` href, immune to label/translation.
 */
export class AccountMenu {
  readonly signOutLink: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.signOutLink = page.locator('a[href*="/logout"]');
  }

  /** Opens the account dropdown, identified by the signed-in user's username. */
  async open(username: string): Promise<void> {
    const byUsername = new RegExp(escapeRegExp(username), 'i');
    await this.page.getByRole('button', { name: byUsername }).click();
  }

  /** Opens the menu and clicks the sign-out link. */
  async signOut(username: string): Promise<void> {
    await this.open(username);
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
