import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { lmsGet } from './lms-json';

/**
 * Aspects' LMS views (platform-plugin-aspects, `/aspects/…`): what the
 * instructor dashboard's Reports tab and Studio's in-context metrics ask the LMS
 * for before they embed a Superset dashboard. They accept a **session** only
 * (`SessionAuthentication`), so `request` is the reader's own signed-in context,
 * never a JWT-only one.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function shapeError(what: string, body: unknown): ApiError {
  return new ApiError(`${what} answered an unexpected shape.`, {
    status: 200,
    url: '',
    body: JSON.stringify(body).slice(0, 500),
  });
}

/** One dashboard the Reports tab embeds. `uuid` is the localized embed uuid. */
export interface AspectsDashboard {
  readonly name: string;
  readonly slug: string;
  readonly uuid: string;
}

/** The Reports tab's configuration for one course. */
export interface InstructorReports {
  readonly dashboards: readonly AspectsDashboard[];
  /** Superset's URL as the platform advertises it (the Reports tab's link). */
  readonly supersetUrl: string;
  readonly guestTokenUrl: string;
  readonly showDashboardLink: boolean;
}

export function narrowInstructorReports(body: unknown): InstructorReports {
  if (
    !isRecord(body) ||
    !Array.isArray(body.superset_dashboards) ||
    typeof body.superset_url !== 'string' ||
    typeof body.superset_guest_token_url !== 'string'
  ) {
    throw shapeError('The Aspects instructor dashboard config', body);
  }
  return {
    dashboards: body.superset_dashboards.filter(isRecord).map((d) => ({
      name: String(d.name),
      slug: String(d.slug),
      uuid: String(d.uuid),
    })),
    supersetUrl: body.superset_url,
    guestTokenUrl: body.superset_guest_token_url,
    showDashboardLink: body.show_dashboard_link === true,
  };
}

/** The Reports tab's dashboards for `courseKey`, as the course-staff reader sees them. */
export async function fetchInstructorReports(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<InstructorReports> {
  return narrowInstructorReports(
    await lmsGet<unknown>(
      request,
      `${config.baseUrls.lms}/aspects/superset_instructor_dashboard/${courseKey}/`,
      `Reading the Aspects Reports config for ${courseKey}`,
    ),
  );
}

export function narrowGuestToken(body: unknown): string {
  if (!isRecord(body) || typeof body.guestToken !== 'string' || body.guestToken === '') {
    throw shapeError('The Superset guest token', body);
  }
  return body.guestToken;
}

/**
 * A Superset guest token for `courseKey`'s dashboards, row-level-secured to the
 * course. Superset expires it after five minutes, so a long poll fetches a new
 * one rather than keeping the first.
 */
export async function fetchGuestToken(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<string> {
  return narrowGuestToken(
    await lmsGet<unknown>(
      request,
      `${config.baseUrls.lms}/aspects/superset_guest_token/${courseKey}`,
      `Minting a Superset guest token for ${courseKey}`,
    ),
  );
}

/** The in-context dashboard Studio embeds for a course or one of its blocks. */
export interface InContextDashboard {
  /** The localized embed uuid of the block type's dashboard. */
  readonly dashboardId: string;
  readonly supersetUrl: string;
  /** Rison-encoded native filters per course run. */
  readonly nativeFilters: Readonly<Record<string, string>>;
  readonly defaultCourseRun: string;
}

export function narrowInContextDashboard(body: unknown): InContextDashboard {
  if (
    !isRecord(body) ||
    typeof body.dashboardId !== 'string' ||
    typeof body.supersetUrl !== 'string' ||
    !isRecord(body.courseRuns)
  ) {
    throw shapeError('The Aspects in-context dashboard config', body);
  }
  const nativeFilters: Record<string, string> = {};
  for (const [run, value] of Object.entries(body.courseRuns)) {
    if (isRecord(value) && typeof value.native_filters === 'string') {
      nativeFilters[run] = value.native_filters;
    }
  }
  return {
    dashboardId: body.dashboardId,
    supersetUrl: body.supersetUrl,
    nativeFilters,
    defaultCourseRun: typeof body.defaultCourseRun === 'string' ? body.defaultCourseRun : '',
  };
}

/** The in-context dashboard for a course key or a block's usage key. */
export async function fetchInContextDashboard(
  request: APIRequestContext,
  config: AppConfig,
  key: string,
): Promise<InContextDashboard> {
  return narrowInContextDashboard(
    await lmsGet<unknown>(
      request,
      `${config.baseUrls.lms}/aspects/superset_in_context_dashboard/${key}`,
      `Reading the Aspects in-context dashboard for ${key}`,
    ),
  );
}
