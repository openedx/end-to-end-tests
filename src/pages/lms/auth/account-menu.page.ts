import type { Locator, Page } from '@playwright/test';

import { ACCOUNT_MENU_SELECTORS, type AppConfig } from '../../../config';

/**
 * The header account menu that carries the sign-out affordance, shown once a
 * learner is signed in.
 *
 * Both anchors are structural (see `ACCOUNT_MENU_SELECTORS`): the trigger by the
 * `id` the shell gives it, the sign-out item by its `/logout` href. Neither
 * depends on displayed text — which matters here, because the trigger's
 * accessible name is the learner's **display name**, not their username, so the
 * caller has nothing language-independent to match on.
 */
export class AccountMenu {
  readonly menuTrigger: Locator;
  readonly signOutLink: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.menuTrigger = page.locator(ACCOUNT_MENU_SELECTORS.menuTrigger);
    this.signOutLink = page.locator(ACCOUNT_MENU_SELECTORS.signOutLink);
  }

  /** Opens the account dropdown. */
  async open(): Promise<void> {
    await this.menuTrigger.click();
    await this.signOutLink.waitFor();
  }

  /** Opens the menu and clicks the sign-out link. */
  async signOut(): Promise<void> {
    await this.open();
    await this.signOutLink.click();
  }
}
