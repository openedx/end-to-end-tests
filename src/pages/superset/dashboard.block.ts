import { errors, type Locator, type Page, type Response } from '@playwright/test';

import {
  SUPERSET_SELECTORS,
  supersetDashboardTab,
  supersetNativeFilter,
  supersetSelectOption,
  supersetSelectedValue,
  TIMEOUTS,
} from '../../config';
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
 * The chart-data exchanges of one dashboard, as the page object watching it
 * records them. An answer's body is read after its response event, so a wait for
 * more ({@link next}) wakes when the next exchange is **stored**, and never
 * misses one whose body was still being read. A request whose body cannot be
 * parsed fails the next read of {@link charts}.
 */
export class ChartDataRecorder {
  private readonly list: CapturedChart[] = [];
  private waiters: (() => void)[] = [];
  private failure: Error | undefined;

  /** Records one chart-data response, once its answer has been read. */
  record(response: Response): void {
    void captureChartData(response)
      .then(
        (captured) => {
          if (captured !== undefined) this.list.push(captured);
        },
        (error: unknown) => {
          this.failure ??= error instanceof Error ? error : new Error(String(error));
        },
      )
      .finally(() => {
        const waiters = this.waiters;
        this.waiters = [];
        for (const wake of waiters) wake();
      });
  }

  /** The exchanges stored so far, oldest first. */
  get charts(): readonly CapturedChart[] {
    if (this.failure !== undefined) throw this.failure;
    return this.list;
  }

  /** Forgets what an earlier load recorded. */
  clear(): void {
    this.list.length = 0;
    this.failure = undefined;
  }

  /** Resolves once the next exchange is stored, or when `timeout` runs out. */
  next(timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeout);
      this.waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

/**
 * One Superset dashboard as a page renders it: embedded in the Reports tab, or on
 * Superset's own dashboard page. Its chart-data traffic is recorded by the page
 * object that owns the page, so the block only drives the dashboard and says
 * which of the recorded queries belong to the charts on screen.
 */
export class SupersetDashboardBlock {
  constructor(
    private readonly page: Page,
    readonly root: DashboardRoot,
    private readonly recorder: ChartDataRecorder,
  ) {}

  private captured(): readonly CapturedChart[] {
    return this.recorder.charts;
  }

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

  /** How many chart-data answers have been captured so far: a marker for {@link visibleChartQueries}. */
  capturedCount(): number {
    return this.captured().length;
  }

  /**
   * Chooses values in a select filter by typing each (the test's own data, a
   * course name or run) and picking its option, then applies the filters.
   * Returns the capture marker taken before applying, so the charts' answers to
   * the new filter can be told from the old ones.
   */
  async applySelectFilter(filterId: string, values: readonly string[]): Promise<number> {
    await this.expandFilterBar();
    const control = this.root.locator(supersetNativeFilter(filterId));
    for (const value of values) await this.chooseOption(control, value);
    await this.closeSelect(control);
    const marker = this.capturedCount();
    await this.root.locator(SUPERSET_SELECTORS.filterApply).click();
    return marker;
  }

  /**
   * Clears one select filter with its own clear control and applies, leaving the
   * others (a dashboard's preselected course filter among them) as they are.
   * Returns the capture marker taken before applying.
   */
  async clearSelectFilter(filterId: string): Promise<number> {
    await this.expandFilterBar();
    const control = this.root.locator(supersetNativeFilter(filterId));
    await control.hover();
    await control.locator(SUPERSET_SELECTORS.selectClear).click();
    await this.closeSelect(control);
    const marker = this.capturedCount();
    await this.root.locator(SUPERSET_SELECTORS.filterApply).click();
    return marker;
  }

  /**
   * Types `value` into a select filter and picks its option, until the control
   * shows it as chosen. A filter that searches its options as you type (the
   * Username filter) re-renders its dropdown under the pointer, so a pick can
   * land on a detached option; it is then typed and picked again.
   */
  private async chooseOption(control: Locator, value: string): Promise<void> {
    const option = this.root
      .locator(`${SUPERSET_SELECTORS.openSelectDropdown} ${supersetSelectOption(value)}`)
      .first();
    const chosen = control.locator(supersetSelectedValue(value)).first();
    for (let attempt = 1; ; attempt++) {
      // A pick that timed out may still have landed; picking again would undo it.
      if (await chosen.isVisible()) return;
      await control.click();
      await control.locator('input').first().fill(value);
      try {
        await option.click({ timeout: TIMEOUTS.optionalOverlay });
        await chosen.waitFor({ timeout: TIMEOUTS.optionalOverlay });
        return;
      } catch (error) {
        if (!(error instanceof errors.TimeoutError) || attempt === 3) throw error;
      }
    }
  }

  /**
   * Closes a select filter's dropdown, which otherwise lies over the filter
   * bar's Apply button. Escape closes it on 6.1; on 6.0 it can stay open, and
   * leaving the search input closes it there.
   */
  private async closeSelect(control: Locator): Promise<void> {
    const open = this.root.locator(SUPERSET_SELECTORS.openSelectDropdown).first();
    await this.page.keyboard.press('Escape');
    try {
      await open.waitFor({ state: 'hidden', timeout: TIMEOUTS.optionalOverlay });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      await control.locator('input').first().blur();
      await open.waitFor({ state: 'hidden', timeout: TIMEOUTS.optionalOverlay });
    }
  }

  /** Opens the filter bar where it starts collapsed (an embedded dashboard's does). */
  private async expandFilterBar(): Promise<void> {
    const expand = this.root.locator(`${SUPERSET_SELECTORS.filterBarExpand}:visible`);
    const apply = this.root.locator(`${SUPERSET_SELECTORS.filterApply}:visible`);
    // The bar renders collapsed (an expand control) or open (its Apply button).
    await expand.or(apply).first().waitFor();
    if (await expand.count()) await expand.first().click();
    await apply.first().waitFor();
  }

  /** Waits for the dashboard's next recorded chart-data answer, or for the budget to run out. */
  private nextChartData(timeout: number): Promise<void> {
    return this.recorder.next(timeout);
  }

  /**
   * The chart queries of every chart on screen, newest answer per chart, once
   * each of them has been answered. Charts load only while their tab is shown,
   * so select the tab first. `since` (a {@link capturedCount} taken earlier)
   * counts only answers captured after it, such as those to a filter change.
   * Throws, naming the charts still unanswered, when the budget runs out.
   */
  async visibleChartQueries(timeout: number, since = 0): Promise<readonly CapturedChart[]> {
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
      for (const c of this.captured().slice(since)) {
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
