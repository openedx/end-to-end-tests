import type { APIRequestContext } from '@playwright/test';

import { ApiError } from './errors';

/**
 * Superset's own API, as Aspects' dashboards use it. Its answers are the
 * analytics oracle: a chart's numbers come from **replaying the chart-data query
 * the dashboard itself sent** (`POST /api/v1/chart/data`), changed only to bypass
 * Superset's result cache (`force`, the dashboard's "Force refresh"). The reading
 * is exactly what the chart would draw, with no chart text or pixels involved.
 *
 * Superset does not refuse a modified query from a guest (measured on 6.1.0), so
 * {@link replayBody} is the guard: it copies the captured body and sets `force`,
 * and nothing else may change it.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A metric or column in a chart query: a SQL name, or an ad-hoc one's label. */
function label(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (isRecord(entry) && typeof entry.label === 'string') return entry.label;
  return JSON.stringify(entry);
}

/** A chart-data request the dashboard sent, and what identifies its chart. */
export interface ChartQuery {
  /** The request body exactly as the dashboard sent it. */
  readonly body: Readonly<Record<string, unknown>>;
  /** Superset's numeric chart id on this install (`form_data.slice_id`). */
  readonly sliceId: number | null;
  /** Superset's numeric dashboard id on this install (`form_data.dashboardId`). */
  readonly dashboardId: number | null;
  readonly vizType: string;
  /** Per query: the metric labels (SQL names, not translated copy). */
  readonly metrics: readonly (readonly string[])[];
  /** Per query: the grouping columns. */
  readonly columns: readonly (readonly string[])[];
}

/** Parses a captured `POST /api/v1/chart/data` body. */
export function parseChartQuery(postData: string): ChartQuery {
  const body: unknown = JSON.parse(postData);
  if (!isRecord(body) || !Array.isArray(body.queries)) {
    throw new ApiError('A captured chart-data request has no queries.', {
      status: 0,
      url: '',
      body: postData.slice(0, 500),
    });
  }
  const formData = isRecord(body.form_data) ? body.form_data : {};
  const queries = body.queries.filter(isRecord);
  return {
    body,
    sliceId: typeof formData.slice_id === 'number' ? formData.slice_id : null,
    dashboardId: typeof formData.dashboardId === 'number' ? formData.dashboardId : null,
    vizType: typeof formData.viz_type === 'string' ? formData.viz_type : '',
    metrics: queries.map((q) => (Array.isArray(q.metrics) ? q.metrics.map(label) : [])),
    columns: queries.map((q) => (Array.isArray(q.columns) ? q.columns.map(label) : [])),
  };
}

/** A native filter's option query (`filter_select`, `filter_time`, …), not a chart. */
export function isFilterQuery(query: ChartQuery): boolean {
  return query.vizType.startsWith('filter_');
}

/** The body a replay sends: the captured one, with only `force` set. */
export function replayBody(query: ChartQuery): Record<string, unknown> {
  return { ...(structuredClone(query.body) as Record<string, unknown>), force: true };
}

/** One query's result rows. */
export interface ChartResult {
  readonly colnames: readonly string[];
  readonly rowcount: number;
  readonly data: readonly Readonly<Record<string, unknown>>[];
}

export function narrowChartData(body: unknown): readonly ChartResult[] {
  if (!isRecord(body) || !Array.isArray(body.result)) {
    throw new ApiError('Superset chart data answered an unexpected shape.', {
      status: 200,
      url: '',
      body: JSON.stringify(body).slice(0, 500),
    });
  }
  return body.result.filter(isRecord).map((r) => ({
    colnames: Array.isArray(r.colnames) ? r.colnames.map(String) : [],
    rowcount: typeof r.rowcount === 'number' ? r.rowcount : 0,
    data: Array.isArray(r.data) ? r.data.filter(isRecord) : [],
  }));
}

/**
 * How a replay is authorized: the embedded dashboard's guest token, or the
 * request context's own Superset session (a dashboard opened in Superset).
 */
export type SupersetAuth = { readonly guestToken: string } | 'session';

/**
 * Replays a captured chart query with Superset's cache bypassed. Throws an
 * {@link ApiError} on any other answer than 200 — a 401 or 403 with a guest token
 * usually means the five-minute token expired, and the caller fetches a new one.
 */
export async function replayChartData(
  request: APIRequestContext,
  supersetOrigin: string,
  query: ChartQuery,
  auth: SupersetAuth,
): Promise<readonly ChartResult[]> {
  const url = `${supersetOrigin}/api/v1/chart/data`;
  const headers: Record<string, string> = { Referer: `${supersetOrigin}/` };
  if (auth !== 'session') headers['X-GuestToken'] = auth.guestToken;
  const response = await request.post(url, { data: replayBody(query), headers });
  const text = await response.text();
  if (response.status() !== 200) {
    throw new ApiError(
      `Replaying Superset chart ${query.sliceId ?? '?'} failed (HTTP ${response.status()}).`,
      { status: response.status(), url, body: text.slice(0, 500) },
    );
  }
  return narrowChartData(JSON.parse(text) as unknown);
}

/** Who the request context is to Superset, by `/api/v1/me/roles/`. */
export interface SupersetUser {
  /** True for an unauthenticated visitor, which a refused SSO leaves behind. */
  readonly anonymous: boolean;
  /** Role names (`Instructor`, `Admin`, …; `Public` for a visitor). */
  readonly roles: readonly string[];
}

export function narrowSupersetUser(body: unknown): SupersetUser {
  const result = isRecord(body) && isRecord(body.result) ? body.result : undefined;
  if (result === undefined) {
    throw new ApiError('Superset /api/v1/me/roles/ answered an unexpected shape.', {
      status: 200,
      url: '',
      body: JSON.stringify(body).slice(0, 500),
    });
  }
  // A visitor's answer carries only `permissions` and `roles`; a signed-in
  // user's also carries its account (`isAnonymous: false`, `username`, …).
  return {
    anonymous: result.isAnonymous !== false,
    roles: isRecord(result.roles) ? Object.keys(result.roles) : [],
  };
}

/** The Superset identity `request` carries (signed in or not). */
export async function fetchSupersetUser(
  request: APIRequestContext,
  supersetOrigin: string,
): Promise<SupersetUser> {
  const url = `${supersetOrigin}/api/v1/me/roles/`;
  const response = await request.get(url);
  const text = await response.text();
  if (response.status() !== 200) {
    throw new ApiError(`Reading the Superset user failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: text.slice(0, 500),
    });
  }
  return narrowSupersetUser(JSON.parse(text) as unknown);
}
