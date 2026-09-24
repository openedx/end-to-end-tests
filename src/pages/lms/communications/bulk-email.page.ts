import type { Page, Response } from '@playwright/test';

import { COMMUNICATIONS_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';

/** Who a course e-mail goes to, by the form's (and the API's) recipient group. */
export type BulkEmailRecipient = 'myself' | 'staff' | 'learners';

/**
 * The communications MFE's bulk e-mail form. It is course staff's, and it
 * reads LMS session-authed views, so it is driven from an account with its own
 * LMS session — never the worker author's JWT-only browser.
 */
export class BulkEmailPage {
  private readonly s = COMMUNICATIONS_SELECTORS;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
  }

  /** Opens the form at the URL the dashboard's Bulk Email tab links to. */
  async goto(url: string): Promise<void> {
    await this.page.goto(url);
    await this.page.locator(this.s.subject).waitFor({ timeout: TIMEOUTS.navigation });
  }

  /**
   * Addresses, writes and sends a course e-mail, confirming the "Caution"
   * dialog; returns the `send_email` response the send causes.
   */
  async send(email: {
    readonly to: readonly BulkEmailRecipient[];
    readonly subject: string;
    readonly body: string;
  }): Promise<Response> {
    for (const group of email.to) await this.page.locator(this.s.recipient(group)).check();
    await this.page.locator(this.s.subject).fill(email.subject);
    await this.page.frameLocator(this.s.messageFrame).locator('body').fill(email.body);
    await this.page.locator(this.s.send).click();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/instructor/api/send_email'),
        { timeout: TIMEOUTS.navigation },
      ),
      this.page.locator(this.s.confirm).click(),
    ]);
    return response;
  }
}
