import type { APIRequestContext, Page } from '@playwright/test';

import {
  COURSE_COMPARISON_SLUG,
  COURSE_DASHBOARD_SLUG,
  COURSE_DASHBOARD_TAB_PARENTS,
  TIMEOUTS,
  type AppConfig,
  type AspectsChartKey,
} from '../config';
import {
  ApiError,
  fetchGuestToken,
  fetchSupersetUser,
  replayChartData,
  supersetOrigin,
  type ChartResult,
  type InstructorReports,
  type SupersetUser,
} from '../api';
import { SupersetDashboardPage } from '../pages/superset/dashboard.page';
import { SupersetSignInPage } from '../pages/superset/sign-in.page';
import type { ReportsPage } from '../pages/lms/instructor/reports.page';
import type { CapturedChart, SupersetDashboardBlock } from '../pages/superset/dashboard.block';
import { pollUntil } from './poll';

/**
 * Aspects' analytics as their users read them: a course's dashboards in the
 * Reports tab, Superset's sign-in through the LMS, and Course Comparison on the
 * user's own Superset session. Every number comes from replaying a chart-data
 * query the dashboard itself sent, with Superset's cache bypassed
 * (`src/api/superset.ts`); nothing reads chart text or pixels.
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
function chartRows(result: readonly ChartResult[]): readonly Readonly<Record<string, unknown>>[] {
  return result[0]?.data ?? [];
}

/** One of a course's Aspects dashboards, opened in the Reports tab, ready to be read. */
export interface ReportsDashboard {
  readonly block: SupersetDashboardBlock;
  /**
   * Shows a tab (and its parent, for the Course Dashboard's nested tabs) and
   * returns the charts on it, answered. `since` (from {@link filter} or
   * {@link clearFilter}) waits for the answers to that filter change instead.
   */
  chartsOn(tab: string, since?: number): Promise<readonly CapturedChart[]>;
  /** Replays one captured chart with the cache bypassed and returns its rows. */
  read(chart: CapturedChart): Promise<readonly Readonly<Record<string, unknown>>[]>;
  /** Chooses values in a select filter and applies it; returns the marker for `chartsOn`. */
  filter(filterId: string, values: readonly string[]): Promise<number>;
  /** Clears one select filter and applies; returns the marker for `chartsOn`. */
  clearFilter(filterId: string): Promise<number>;
}

/**
 * Opens one of a course's dashboards in the Reports tab, by slug (before its
 * locale suffix), as `viewer` (its `request` holds the viewer's LMS session),
 * and waits until the dashboard knows the course.
 *
 * Aspects' dashboards preselect the course's **name** in their course filter,
 * and the name reaches Superset on a dictionary refresh after the course is
 * created; a dashboard loaded before that sends no chart queries at all. So when
 * the first load's filter options lack the course, this replays the filter until
 * they list it, then loads the tab again.
 */
export async function openReportsDashboard(
  reportsPage: ReportsPage,
  viewer: APIRequestContext,
  config: AppConfig,
  course: { readonly courseKey: string; readonly displayName: string },
  slug: string,
): Promise<ReportsDashboard> {
  const { courseKey, displayName } = course;
  // Afresh, so a second call (a reload, to refresh the filter bar) reads only
  // its own load's queries.
  let reports = await reportsPage.reopenReports(courseKey);
  const origin = supersetOrigin(config, reports);
  const dashboardUuid = () => {
    const dashboard = reports.dashboards.find(
      (d) => d.slug === slug || d.slug.startsWith(`${slug}-`),
    );
    if (dashboard === undefined) {
      throw new Error(
        `The Reports tab offers no ${slug} dashboard; it offers ` +
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
    async chartsOn(tab, since = 0) {
      const parent = COURSE_DASHBOARD_TAB_PARENTS[tab];
      if (parent !== undefined) await block.selectTab(parent);
      await block.selectTab(tab);
      return block.visibleChartQueries(TIMEOUTS.supersetEmbed, since);
    },
    async read(chart) {
      return chartRows(await replay(chart));
    },
    filter(filterId, values) {
      return block.applySelectFilter(filterId, values);
    },
    clearFilter(filterId) {
      return block.clearSelectFilter(filterId);
    },
  };
}

/** A course's Course Dashboard in the Reports tab ({@link openReportsDashboard}). */
export function openCourseDashboard(
  reportsPage: ReportsPage,
  viewer: APIRequestContext,
  config: AppConfig,
  course: { readonly courseKey: string; readonly displayName: string },
): Promise<ReportsDashboard> {
  return openReportsDashboard(reportsPage, viewer, config, course, COURSE_DASHBOARD_SLUG);
}

/**
 * Signs `page`'s user in to Superset through the LMS, from wherever the page is
 * (Superset's URL, the tab the Reports link opened), and returns who Superset
 * then says the user is. A refused user comes back as an anonymous visitor.
 */
export async function signInToSuperset(page: Page, origin: string): Promise<SupersetUser> {
  await new SupersetSignInPage(page, origin).signIn();
  return fetchSupersetUser(page.request, origin);
}

/**
 * The locale suffix Aspects gives its dashboards for this viewer (`-en`), read
 * from the Course Dashboard's slug in the Reports config.
 */
export function dashboardLocaleSuffix(reports: InstructorReports): string {
  const slug = reports.dashboards.find((d) => d.slug.startsWith(COURSE_DASHBOARD_SLUG))?.slug;
  return slug === undefined ? '' : slug.slice(COURSE_DASHBOARD_SLUG.length);
}

/** Course Comparison, opened on a signed-in Superset session. */
export interface CourseComparison {
  readonly dashboardPage: SupersetDashboardPage;
  readonly block: SupersetDashboardBlock;
  /** The course names its Course Name filter offers this user (row-level security applied). */
  courseNames(): Promise<readonly string[]>;
  /**
   * Shows a tab and returns its charts, answered. `since` (from {@link filter})
   * waits for the answers to a filter change instead.
   */
  chartsOn(tab: string, since?: number): Promise<readonly CapturedChart[]>;
  /** Replays one captured chart on the Superset session, cache bypassed, and returns its rows. */
  read(chart: CapturedChart): Promise<readonly Readonly<Record<string, unknown>>[]>;
  /** Chooses values in a select filter and applies it; returns the marker for `chartsOn`. */
  filter(filterId: string, values: readonly string[]): Promise<number>;
}

/**
 * Opens Course Comparison on `page`'s Superset session (sign in first) and waits
 * until it offers every course in `mustList`.
 *
 * Its filters and charts are fetched once per load, and a course reaches
 * Superset's course names on a dictionary refresh after it is created. So when
 * the first load's Course Name filter lacks a course, this replays the filter
 * until it lists it, then loads the page again. Readings replay the dashboard's
 * own queries on the session, with the cache bypassed: exactly what row-level
 * security lets the user see.
 */
export async function openCourseComparison(
  page: Page,
  origin: string,
  localeSuffix: string,
  mustList: readonly string[] = [],
): Promise<CourseComparison> {
  const dashboardPage = new SupersetDashboardPage(page, origin);
  const slug = `${COURSE_COMPARISON_SLUG}${localeSuffix}`;
  const replay = (chart: CapturedChart) =>
    replayChartData(page.request, origin, chart.query, 'session');
  const names = (rows: readonly Readonly<Record<string, unknown>>[]) =>
    rows.map((row) => row.course_name).filter((n): n is string => typeof n === 'string');
  const listsAll = (listed: readonly string[]) => mustList.every((name) => listed.includes(name));

  // The Organization filter preselects its first option and the charts wait for
  // it, so the page is ready only when it offers an organization too.
  const ready = (reading: { readonly courses: readonly string[]; readonly orgs: number }) =>
    listsAll(reading.courses) && reading.orgs > 0;
  const loaded = async () => {
    const block = dashboardPage.dashboard();
    return {
      courses: await block.filterQuery('course_name', TIMEOUTS.supersetEmbed),
      orgs: await block.filterQuery('org', TIMEOUTS.supersetEmbed),
    };
  };

  await dashboardPage.goto(slug);
  let filters = await loaded();
  if (
    !ready({
      courses: names(chartRows(filters.courses.result)),
      orgs: chartRows(filters.orgs.result).length,
    })
  ) {
    const { courses, orgs } = filters;
    const known = await waitForAnalytics(
      async () => ({
        courses: names(chartRows(await replay(courses))),
        orgs: chartRows(await replay(orgs)).length,
      }),
      ready,
    );
    if (!known.met) {
      throw new Error(
        `Course Comparison never offered ${JSON.stringify(mustList)} and an organization; it last ` +
          `offered ${JSON.stringify(known.last)}.`,
      );
    }
    await dashboardPage.goto(slug);
    filters = await loaded();
  }
  const filter = filters.courses;

  const block = dashboardPage.dashboard();
  return {
    dashboardPage,
    block,
    async courseNames() {
      return names(chartRows(await replay(filter)));
    },
    async chartsOn(tab, since = 0) {
      await block.selectTab(tab);
      return block.visibleChartQueries(TIMEOUTS.supersetEmbed, since);
    },
    async read(chart) {
      return chartRows(await replay(chart));
    },
    filter(filterId, values) {
      return block.applySelectFilter(filterId, values);
    },
  };
}
