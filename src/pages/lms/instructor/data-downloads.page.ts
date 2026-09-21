import type { Locator, Response } from '@playwright/test';

import {
  INSTRUCTOR_REPORT_ROWS,
  INSTRUCTOR_TAB_IDS,
  type InstructorReportType,
} from '../../../config';
import { InstructorDashboardPage } from './dashboard.page';

/**
 * The Data Downloads tab: the "Generate …" buttons grouped in Paragon tabs, and
 * the "Available Reports" table. {@link generate} locates a button by the
 * measured (tab, row) position for the report type and returns the
 * `reports/<type>/generate` response — the URL is what proves the right button
 * was pressed.
 */
export class InstructorDataDownloadsPage extends InstructorDashboardPage {
  async gotoTab(courseKey: string): Promise<void> {
    await this.goto(courseKey, INSTRUCTOR_TAB_IDS.dataDownloads);
    await this.main.locator(this.s.generateReportsHeading).waitFor();
  }

  /** Switches the report-group tab by its non-localized key. */
  async selectReportTab(tabKey: string): Promise<void> {
    const tab = this.main.locator(this.s.reportTab(tabKey));
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    await this.main.locator(this.s.activeReportPanel).waitFor();
  }

  /** The "Generate …" button for a report type, on its (activated) tab. */
  private async generateButton(reportType: InstructorReportType): Promise<Locator> {
    const { tab, row } = INSTRUCTOR_REPORT_ROWS[reportType];
    await this.selectReportTab(tab);
    return this.main.locator(this.s.activeReportPanel).locator(this.s.reportRowButton).nth(row);
  }

  /**
   * Presses the report's Generate button and returns the
   * `POST …/reports/<reportType>/generate` response. `problem_responses` needs a
   * problem location typed first.
   */
  async generate(
    reportType: InstructorReportType,
    options: { readonly problemLocation?: string } = {},
  ): Promise<Response> {
    const button = await this.generateButton(reportType);
    if (options.problemLocation !== undefined) {
      await this.main.locator(this.s.problemResponsesInput).fill(options.problemLocation);
    }
    return this.waitForApi({ method: 'POST', urlIncludes: `/reports/${reportType}/generate` }, () =>
      button.click(),
    );
  }

  /** The download link-button of the row naming a report. */
  downloadButtonFor(reportName: string): Locator {
    return this.rowFor(reportName).locator(this.s.reportDownloadButton);
  }
}
