import type { Locator, Page, Response } from '@playwright/test';

import { PROGRESS_SELECTORS, progressTabLink, type AppConfig } from '../../../config';

/**
 * The course Progress tab. Locators and navigation only — the grade numbers
 * themselves come from the progress API, which the specs assert against.
 */
export class ProgressPage {
  readonly totalGrade: Locator;
  readonly tables: Locator;
  readonly tableFooter: Locator;
  readonly certificateStatus: Locator;
  readonly certificateAction: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.totalGrade = page.locator(PROGRESS_SELECTORS.totalGrade);
    this.tables = page.locator(PROGRESS_SELECTORS.table);
    this.tableFooter = page.locator(PROGRESS_SELECTORS.tableFooter);
    this.certificateStatus = page.locator(PROGRESS_SELECTORS.certificateStatus);
    this.certificateAction = page.locator(PROGRESS_SELECTORS.certificateAction);
  }

  url(courseKey: string): string {
    return `${this.config.baseUrls.apps}/learning/course/${courseKey}/progress`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.totalGrade.waitFor();
  }

  /** Reaches the Progress tab from the course's tab bar, as a learner does. */
  async gotoViaCourseTab(courseKey: string): Promise<void> {
    await this.page.locator(progressTabLink(courseKey)).first().click();
    await this.page.waitForURL((url) => url.pathname.endsWith('/progress'));
    await this.totalGrade.waitFor();
  }

  /** Rows in one of the grade tables, by table index. */
  rows(tableIndex: number): Locator {
    return this.tables.nth(tableIndex).locator(PROGRESS_SELECTORS.tableRow);
  }

  /**
   * The weighted total the page displays, as a number.
   *
   * Digits are extracted rather than the string compared: the *value* is the
   * platform's own numeric state (and is checked against the API), while its
   * formatting — separators, percent placement — varies by locale, so matching the
   * rendered text would be matching localized copy.
   */
  async displayedTotalPercent(): Promise<number | undefined> {
    const text = (await this.totalGrade.textContent()) ?? '';
    const digits = text.replace(/[^\d]/g, '');
    return digits === '' ? undefined : Number(digits);
  }

  /**
   * The state the certificate block shows (`requestable`, `downloadable`, …),
   * read from its element id. Waits for the block, so a page without one
   * times out rather than answering `undefined`.
   */
  async certificateCase(): Promise<string | undefined> {
    await this.certificateStatus.waitFor();
    const id = await this.page.locator(PROGRESS_SELECTORS.certificateStatusCase).getAttribute('id');
    return id?.replace(/_certificate_status$/, '');
  }

  /**
   * Presses "Request certificate" and waits for the request it sends
   * (`POST /courses/<key>/generate_user_cert`), returning that response.
   */
  async requestCertificate(): Promise<Response> {
    const sent = this.page.waitForResponse(
      (r) => r.url().includes('/generate_user_cert') && r.request().method() === 'POST',
    );
    await this.certificateAction.click();
    return sent;
  }
}
