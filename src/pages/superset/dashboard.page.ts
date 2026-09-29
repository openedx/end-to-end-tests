import type { Page, Response } from '@playwright/test';

import { TIMEOUTS } from '../../config';
import { SupersetDashboardBlock, captureChartData, type CapturedChart } from './dashboard.block';

/**
 * A Superset dashboard on Superset's own pages (`/superset/dashboard/<slug>/`),
 * read on the context's Superset session: Course Comparison, which is not
 * embeddable, and the dashboards its links lead to. The chart-data traffic is
 * recorded from construction and read through {@link dashboard}.
 */
export class SupersetDashboardPage {
  private readonly charts: CapturedChart[] = [];
  private readonly record: (response: Response) => void;

  constructor(
    private readonly page: Page,
    private readonly origin: string,
  ) {
    this.record = (response) => {
      if (!response.url().startsWith(`${origin}/api/v1/chart/data`)) return;
      if (response.request().frame() !== page.mainFrame()) return;
      void captureChartData(response).then((captured) => {
        if (captured !== undefined) this.charts.push(captured);
      });
    };
    page.on('response', this.record);
  }

  /** Stops recording (the page may outlive the test). */
  detach(): void {
    this.page.off('response', this.record);
  }

  /**
   * Opens the dashboard with this slug (a localized copy carries its locale:
   * `course-comparison-en`), forgetting what an earlier load captured, and waits
   * for its first chart-data answer.
   */
  async goto(slug: string): Promise<void> {
    this.charts.length = 0;
    const firstChartData = this.page.waitForResponse(
      (response) => response.url().startsWith(`${this.origin}/api/v1/chart/data`),
      { timeout: TIMEOUTS.supersetEmbed },
    );
    await this.page.goto(`${this.origin}/superset/dashboard/${slug}/`);
    await firstChartData;
  }

  /** The dashboard, with the chart queries this load has sent. */
  dashboard(): SupersetDashboardBlock {
    return new SupersetDashboardBlock(this.page, this.page, () => this.charts);
  }
}
