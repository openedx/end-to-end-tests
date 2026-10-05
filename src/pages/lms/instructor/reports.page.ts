import type { FrameLocator, Locator, Page, Response } from '@playwright/test';

import {
  INSTRUCTOR_REPORTS_SELECTORS,
  INSTRUCTOR_TAB_IDS,
  TIMEOUTS,
  reportsDashboardTab,
  type AppConfig,
} from '../../../config';
import { narrowInstructorReports, type InstructorReports } from '../../../api';
import { ChartDataRecorder, SupersetDashboardBlock } from '../../superset/dashboard.block';
import { InstructorDashboardPage } from './dashboard.page';

/** What an embedded dashboard's first load looked like. */
export interface DashboardEmbedLoad {
  /** The `superset_guest_token` answers the tab received before the embed's first chart data. */
  readonly guestTokenStatuses: readonly number[];
  /**
   * The first chart-data answer from the iframe embedding this dashboard (its
   * filters load first) that is not a gateway error: a 502–504 is the proxy
   * giving up on a busy Superset worker, and the dashboard's other queries still
   * answer, as `replayChartData` allows for too.
   */
  readonly firstChartData: Response;
  /** Whether that chart-data request carried the guest token. */
  readonly usedGuestToken: boolean;
}

/**
 * Aspects' Reports tab (`/instructor-dashboard/<course>/aspects`): one Paragon
 * tab per configured Superset dashboard, each embedding its dashboard in an
 * iframe on Superset's origin (`/embedded/<uuid>`) once selected.
 *
 * The tab's own LMS calls are session-authed, so this page object must run on a
 * page with an LMS session (a cast member, the admin), never on the worker
 * author's JWT-only page. The embed traffic is recorded from the moment the tab
 * opens — the first dashboard starts loading before anything is clicked — and
 * every read returns the requests it saw: the rendered dashboards are Superset's,
 * and localized.
 */
export class ReportsPage extends InstructorDashboardPage {
  protected readonly r = INSTRUCTOR_REPORTS_SELECTORS;
  readonly wrapper: Locator;
  readonly supersetLink: Locator;
  readonly dashboardTabs: Locator;
  readonly embedFrame: Locator;
  private readonly guestTokens: Response[] = [];
  private readonly firstChartData = new Map<string, { response: Response; tokens: number }>();
  private readonly charts = new Map<string, ChartDataRecorder>();
  private readonly record: (response: Response) => void;

  constructor(page: Page, config: AppConfig) {
    super(page, config);
    this.wrapper = page.locator(this.r.wrapper);
    this.supersetLink = page.locator(this.r.supersetLink);
    this.dashboardTabs = page.locator(this.r.dashboardTabs);
    this.embedFrame = page.locator(this.r.embedFrame);
    this.record = (response) => {
      const url = response.url();
      if (url.includes('/aspects/superset_guest_token/')) {
        this.guestTokens.push(response);
        return;
      }
      if (!url.includes('/api/v1/chart/data')) return;
      const uuid = /\/embedded\/([0-9a-f-]{36})/.exec(response.request().frame().url())?.[1];
      if (uuid === undefined) return;
      if (!this.firstChartData.has(uuid) && ![502, 503, 504].includes(response.status())) {
        this.firstChartData.set(uuid, { response, tokens: this.guestTokens.length });
      }
      this.recorder(uuid).record(response);
    };
    page.on('response', this.record);
  }

  /** The recorder of the embed of `uuid`'s chart-data exchanges. */
  private recorder(uuid: string): ChartDataRecorder {
    let recorder = this.charts.get(uuid);
    if (recorder === undefined) {
      recorder = new ChartDataRecorder();
      this.charts.set(uuid, recorder);
    }
    return recorder;
  }

  /** The embedded dashboard of `uuid`, with the chart queries its embed has sent. */
  dashboard(uuid: string): SupersetDashboardBlock {
    return new SupersetDashboardBlock(this.page, this.embed(uuid), this.recorder(uuid));
  }

  /**
   * Stops recording. The page may outlive the test (a cast member's is
   * worker-scoped), so the fixture that made this object detaches it.
   */
  detach(): void {
    this.page.off('response', this.record);
  }

  /**
   * Opens the Reports tab and returns the dashboard config the tab read
   * (`superset_instructor_dashboard`), the answer that proves Aspects is really
   * installed. Waits for the tab's content to render.
   */
  async openReports(courseKey: string): Promise<InstructorReports> {
    const configResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes(`/aspects/superset_instructor_dashboard/${courseKey}`) &&
        response.request().method() === 'GET',
      { timeout: TIMEOUTS.navigation },
    );
    await this.goto(courseKey, INSTRUCTOR_TAB_IDS.aspects);
    const response = await configResponse;
    await this.wrapper.waitFor();
    return narrowInstructorReports(await response.json());
  }

  /** The Superset link's target, or `undefined` where the deployment hides the link. */
  async supersetLinkHref(): Promise<string | undefined> {
    if ((await this.supersetLink.count()) === 0) return undefined;
    return (await this.supersetLink.getAttribute('href')) ?? undefined;
  }

  /**
   * Opens the Reports tab afresh, forgetting what the previous load captured: a
   * dashboard's filters are fetched once per load, so a new reading of them needs
   * a new load.
   */
  async reopenReports(courseKey: string): Promise<InstructorReports> {
    this.guestTokens.length = 0;
    this.firstChartData.clear();
    // Cleared, not dropped: a dashboard block taken before the reload reads on.
    for (const recorder of this.charts.values()) recorder.clear();
    return this.openReports(courseKey);
  }

  /**
   * Follows "View dashboards in Superset", which opens Superset in a new tab,
   * and returns that tab.
   */
  async openSupersetLink(): Promise<Page> {
    const [popup] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: TIMEOUTS.navigation }),
      this.supersetLink.click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    return popup;
  }

  /** The dashboard uuids the rendered tabs are keyed by, in order. */
  async dashboardTabUuids(): Promise<readonly string[]> {
    await this.dashboardTabs.first().waitFor();
    return this.dashboardTabs.evaluateAll((tabs) =>
      tabs.map((tab) => tab.getAttribute('data-rb-event-key') ?? ''),
    );
  }

  /** The tab of one dashboard. */
  dashboardTab(uuid: string): Locator {
    return this.page.locator(reportsDashboardTab(uuid));
  }

  /** The iframe embedding one dashboard (each selected tab keeps its own). */
  embed(uuid: string): FrameLocator {
    return this.page.frameLocator(`${this.r.embedFrame}[src*="/embedded/${uuid}"]`);
  }

  /**
   * Selects a dashboard's tab (already selected is fine) and waits until the
   * iframe embedding it has received its first chart data.
   */
  async openDashboard(uuid: string): Promise<DashboardEmbedLoad> {
    const tab = this.dashboardTab(uuid);
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    await this.embed(uuid).owner().waitFor({ timeout: TIMEOUTS.supersetEmbed });
    const deadline = Date.now() + TIMEOUTS.supersetEmbed;
    let seen = this.firstChartData.get(uuid);
    while (seen === undefined && Date.now() < deadline) {
      await this.page
        .waitForResponse((response) => response.url().includes('/api/v1/chart/data'), {
          timeout: Math.max(1, deadline - Date.now()),
        })
        .catch(() => undefined);
      seen = this.firstChartData.get(uuid);
    }
    if (seen === undefined) {
      throw new Error(`The embedded dashboard ${uuid} sent no chart-data request.`);
    }
    const headers = await seen.response.request().allHeaders();
    return {
      guestTokenStatuses: this.guestTokens.slice(0, seen.tokens).map((r) => r.status()),
      firstChartData: seen.response,
      usedGuestToken: typeof headers['x-guesttoken'] === 'string',
    };
  }
}
