import type { Locator, Page, Response } from '@playwright/test';

import { SUPERSET_SELECTORS, supersetDashboardTab } from '../../config';
import {
  isFilterQuery,
  narrowChartData,
  parseChartQuery,
  type ChartQuery,
  type ChartResult,
} from '../../api';

/** A chart-data request a Superset dashboard sent, with the answer it got. */
export interface CapturedChart {
  readonly query: ChartQuery;
  readonly status: number;
  readonly result: readonly ChartResult[];
}

/** Where a dashboard renders: an embed's iframe (`FrameLocator`) or Superset's own page. */
export interface DashboardRoot {
  locator(selector: string): Locator;
}

/**
 * A chart-data exchange as the page object that watches a dashboard records it:
 * the query the dashboard sent and the rows it got back. `undefined` for a
 * request with no body.
 */
export async function captureChartData(response: Response): Promise<CapturedChart | undefined> {
  const postData = response.request().postData();
  if (postData === null) return undefined;
  let result: CapturedChart['result'] = [];
  try {
    result = narrowChartData(await response.json());
  } catch {
    // An error answer carries no rows; its status says what happened.
  }
  return { query: parseChartQuery(postData), status: response.status(), result };
}

/**
 * One Superset dashboard as a page renders it: embedded in the Reports tab, or on
 * Superset's own dashboard page. Its chart-data traffic is recorded by the page
 * object that owns the page and read here through `captured`, so the block only
 * drives the dashboard and says which of the captured queries belong to the
 * charts on screen.
 */
export class SupersetDashboardBlock {
  constructor(
    private readonly page: Page,
    readonly root: DashboardRoot,
    private readonly captured: () => readonly CapturedChart[],
  ) {}

  /** Shows a dashboard tab by its asset layout id, and waits for it to be selected. */
  async selectTab(tabId: string): Promise<void> {
    const tab = this.root.locator(supersetDashboardTab(tabId)).first();
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    await this.root
      .locator(`${supersetDashboardTab(tabId)}[aria-selected="true"]`)
      .first()
      .waitFor();
  }

  /**
   * The option query of the native filter on `column` (`course_name`, …), once
   * answered. Filters load one after another after the first, so it may still be
   * on its way when the embed has answered something else.
   */
  async filterQuery(column: string, timeout: number): Promise<CapturedChart> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = this.captured().find(
        (c) => isFilterQuery(c.query) && c.query.columns[0]?.[0] === column,
      );
      if (found !== undefined) return found;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`The dashboard sent no filter query on "${column}".`);
      }
      await this.nextChartData(remaining);
    }
  }

  /** Waits for the page's next chart-data answer, or for the budget to run out. */
  private async nextChartData(timeout: number): Promise<void> {
    await this.page
      .waitForResponse((r) => r.url().includes('/api/v1/chart/data'), { timeout })
      .catch(() => undefined);
  }

  /**
   * The chart queries of every chart on screen, newest answer per chart, once
   * each of them has been answered. Charts load only while their tab is shown,
   * so select the tab first. Throws, naming the charts still unanswered, when
   * the budget runs out.
   */
  async visibleChartQueries(timeout: number): Promise<readonly CapturedChart[]> {
    const holders = this.root.locator(`${SUPERSET_SELECTORS.chartHolder}:visible`);
    await holders.first().waitFor({ timeout });
    const deadline = Date.now() + timeout;
    for (;;) {
      const ids = (
        await holders.evaluateAll((els) =>
          els.map((el) => el.getAttribute('data-test-chart-id') ?? ''),
        )
      ).map(Number);
      const answered = new Map<number, CapturedChart>();
      for (const c of this.captured()) {
        if (c.query.sliceId !== null) answered.set(c.query.sliceId, c);
      }
      const missing = ids.filter((id) => !answered.has(id));
      if (missing.length === 0) return ids.map((id) => answered.get(id)!);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `Superset charts ${missing.join(', ')} sent no answered chart-data request.`,
        );
      }
      await this.nextChartData(remaining);
    }
  }
}
