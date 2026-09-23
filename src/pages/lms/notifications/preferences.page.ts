import type { Locator, Page, Response } from '@playwright/test';

import { NOTIFICATION_PREFERENCES_SELECTORS, type AppConfig } from '../../../config';
import type { NotificationApp } from '../../../api';
import { waitForWrite } from '../../studio/wait-for-write';

const PREFERENCES_PATH = '/api/notifications/v3/configurations/';

/**
 * The notification preference centre: the `#notifications` section of the
 * account MFE's settings page (`{APPS}/account/#notifications`), which the tray
 * gear and the notification e-mail's "Notification settings" link also open.
 *
 * Each switch writes one preference (`PUT v3/configurations/`); the toggle waits
 * for that write and returns it, and the spec reads the preference back from the
 * API. The rows offered are role-dependent (TC-00473), which is why
 * {@link webToggles} counts what rendered rather than assuming a set.
 */
export class NotificationPreferencesPage {
  private readonly s = NOTIFICATION_PREFERENCES_SELECTORS;

  readonly section: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.section = page.locator(this.s.section);
  }

  url(): string {
    return `${this.config.baseUrls.apps}/account/#notifications`;
  }

  /**
   * Opens the section as a fresh page load and waits for its switches. From
   * `/account/` itself, navigating to `#notifications` is only a hash change:
   * nothing reloads, and anything left open (the notifications tray) would eat
   * the next click. So a same-path navigation reloads.
   */
  async goto(): Promise<void> {
    const onAccountPage =
      this.page.url().startsWith(`${this.config.baseUrls.apps}/account/`) &&
      new URL(this.page.url()).pathname === '/account/';
    await this.page.goto(this.url());
    if (onAccountPage) {
      await this.page.reload();
    }
    await this.section.locator(this.s.anyWebToggle).first().waitFor();
  }

  /** One app's group of rows. */
  app(app: NotificationApp): Locator {
    return this.section.locator(this.s.app(app));
  }

  /** The switch for one notification type and channel. */
  toggle(type: string, channel: 'web' | 'email'): Locator {
    return this.section.locator(this.s.toggle(type, channel));
  }

  /** Every web switch in an app's group — one per preference offered. */
  webToggles(app: NotificationApp): Locator {
    return this.app(app).locator(this.s.anyWebToggle);
  }

  /** Flips one switch, waiting for the preference write it sends. */
  async flip(type: string, channel: 'web' | 'email'): Promise<Response> {
    return waitForWrite(this.page, { method: 'PUT', urlIncludes: PREFERENCES_PATH }, () =>
      this.toggle(type, channel).click(),
    );
  }
}
