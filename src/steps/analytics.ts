import type { APIRequestContext } from '@playwright/test';

import {
  COURSE_DASHBOARD_SLUG,
  COURSE_DASHBOARD_TAB_PARENTS,
  TIMEOUTS,
  type AppConfig,
  type AspectsChartKey,
} from '../config';
import {
  ApiError,
  fetchGuestToken,
  replayChartData,
  supersetOrigin,
  type ChartResult,
} from '../api';
import type { ReportsPage } from '../pages/lms/instructor/reports.page';
import type {
  CapturedChart,
  EmbeddedDashboardBlock,
} from '../pages/superset/embedded-dashboard.block';
import { pollUntil } from './poll';

/**
 * Aspects' analytics as a course's staff read them in the Reports tab. Every
 * number comes from replaying a chart-data query the dashboard itself sent,
 * with Superset's cache bypassed (`src/api/superset.ts`); nothing reads chart
 * text or pixels.
 */

/** A pipeline wait's outcome: whether it was met, the last reading, and the distinct readings seen. */
export interface AnalyticsWait<T> {
  readonly met: boolean;
  readonly last: T;
  readonly readings: readonly T[];
  readonly elapsedMs: number;
}

/**
 * Polls an analytics reading until `until` holds or the pipeline budget runs out,
 * and reports what it saw rather than throwing, so a spec's failure names the
 * last value.
 */
export async function waitForAnalytics<T>(
  read: () => Promise<T>,
  until: (reading: T) => boolean,
  timeoutMs: number = TIMEOUTS.analyticsPipeline,
): Promise<AnalyticsWait<T>> {
  const readings: T[] = [];
  const outcome = await pollUntil(
    async () => {
      const reading = await read();
      const seen = JSON.stringify(reading);
      if (!readings.some((r) => JSON.stringify(r) === seen)) readings.push(reading);
      return reading;
    },
    until,
    timeoutMs,
  );
  return { met: outcome.satisfied, last: outcome.last, readings, elapsedMs: outcome.elapsedMs };
}

/**
 * The one captured chart matching `key`, among the charts of the tab it names.
 * Throws, listing what was there, when none or several match: the key table
 * then no longer describes the dashboard.
 */
export function findChart(charts: readonly CapturedChart[], key: AspectsChartKey): CapturedChart {
  const matches = charts.filter(
    (c) =>
      c.query.vizType === key.vizType &&
      JSON.stringify(c.query.metrics[0] ?? []) === JSON.stringify(key.metrics),
  );
  if (matches.length !== 1) {
    const seen = charts.map((c) => `${c.query.vizType} [${(c.query.metrics[0] ?? []).join(', ')}]`);
    throw new Error(
      `Expected one ${key.vizType} chart with metrics [${key.metrics.join(', ')}] on tab ` +
        `${key.tab}, found ${matches.length}. Charts on the tab: ${seen.join('; ')}.`,
    );
  }
  return matches[0]!;
}

/** The first query's rows of a chart-data answer. */
export function chartRows(
  result: readonly ChartResult[],
): readonly Readonly<Record<string, unknown>>[] {
  return result[0]?.data ?? [];
}

/** A course's Aspects Course Dashboard, opened in the Reports tab, ready to be read. */
export interface CourseDashboard {
  readonly block: EmbeddedDashboardBlock;
  /** Shows the key's tab (and its parent) and returns the charts on it, answered. */
  chartsOn(tab: string): Promise<readonly CapturedChart[]>;
  /** Replays one captured chart with the cache bypassed and returns its rows. */
  read(chart: CapturedChart): Promise<readonly Readonly<Record<string, unknown>>[]>;
}

/**
 * Opens a course's Course Dashboard in the Reports tab as `viewer` (its
 * `request` holds the viewer's LMS session) and waits until the dashboard knows
 * the course.
 *
 * Aspects' course filter preselects the course's **name**, which reaches Superset
 * on a dictionary refresh after the course is created; a dashboard loaded before
 * that sends no chart queries at all. So when the first load's filter options
 * lack the course, this replays the filter until they list it, then loads the tab
 * again.
 */
export async function openCourseDashboard(
  reportsPage: ReportsPage,
  viewer: APIRequestContext,
  config: AppConfig,
  course: { readonly courseKey: string; readonly displayName: string },
): Promise<CourseDashboard> {
  const { courseKey, displayName } = course;
  let reports = await reportsPage.openReports(courseKey);
  const origin = supersetOrigin(config, reports);
  const dashboardUuid = () => {
    const dashboard = reports.dashboards.find(
      (d) => d.slug === COURSE_DASHBOARD_SLUG || d.slug.startsWith(`${COURSE_DASHBOARD_SLUG}-`),
    );
    if (dashboard === undefined) {
      throw new Error(
        `The Reports tab offers no Course Dashboard (${COURSE_DASHBOARD_SLUG}); it offers ` +
          `${reports.dashboards.map((d) => d.slug).join(', ') || 'nothing'}.`,
      );
    }
    return dashboard.uuid;
  };

  let token = await fetchGuestToken(viewer, config, courseKey);
  const replay = async (chart: CapturedChart): Promise<readonly ChartResult[]> => {
    try {
      return await replayChartData(viewer, origin, chart.query, { guestToken: token });
    } catch (error) {
      // A guest token lives five minutes; a long wait outlives it.
      if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) {
        throw error;
      }
      token = await fetchGuestToken(viewer, config, courseKey);
      return replayChartData(viewer, origin, chart.query, { guestToken: token });
    }
  };

  let uuid = dashboardUuid();
  await reportsPage.openDashboard(uuid);
  const listsCourse = (rows: readonly Readonly<Record<string, unknown>>[]) =>
    rows.some((row) => row.course_name === displayName);
  const courseFilter = await reportsPage
    .dashboard(uuid)
    .filterQuery('course_name', TIMEOUTS.supersetEmbed);
  if (!listsCourse(chartRows(courseFilter.result))) {
    const known = await waitForAnalytics(
      async () => chartRows(await replay(courseFilter)),
      listsCourse,
    );
    if (!known.met) {
      throw new Error(
        `Superset's course filter never listed "${displayName}" within ` +
          `${TIMEOUTS.analyticsPipeline} ms; it last listed ${JSON.stringify(known.last)}.`,
      );
    }
    reports = await reportsPage.reopenReports(courseKey);
    uuid = dashboardUuid();
    await reportsPage.openDashboard(uuid);
  }

  const block = reportsPage.dashboard(uuid);
  return {
    block,
    async chartsOn(tab) {
      const parent = COURSE_DASHBOARD_TAB_PARENTS[tab];
      if (parent !== undefined) await block.selectTab(parent);
      await block.selectTab(tab);
      return block.visibleChartQueries(TIMEOUTS.supersetEmbed);
    },
    async read(chart) {
      return chartRows(await replay(chart));
    },
  };
}
