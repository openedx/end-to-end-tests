import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { studioJson, studioOrigin } from './studio-origin';

/** Studio Home's own data: flags, course-creator status, in-flight actions. */
export const STUDIO_HOME_PATH = '/api/contentstore/v1/home';

/**
 * Paginated, searchable course list behind the authoring MFE's Studio Home. Its
 * query parameters are exactly the MFE's search / sort / filter controls.
 */
export const STUDIO_COURSES_PATH = '/api/contentstore/v2/home/courses';

/**
 * The platform's course-creator states. `unrequested` and `pending` are what a
 * fresh account sees on an install with `ENABLE_CREATOR_GROUP` on; `granted`
 * is what every account sees with it off (and what staff see regardless);
 * `disallowed_for_this_site` is a per-site switch.
 */
export type CourseCreatorStatus =
  'unrequested' | 'pending' | 'granted' | 'denied' | 'disallowed_for_this_site';

/** A re-run or import still running on the CMS worker. */
export interface InProcessCourseAction {
  readonly courseKey: string;
  readonly displayName: string;
  readonly isInProgress: boolean;
  readonly isFailed: boolean;
}

export interface StudioHome {
  readonly courseCreatorStatus: CourseCreatorStatus;
  /** Whether the "new organization" option is offered when creating a course. */
  readonly allowToCreateNewOrg: boolean;
  /** Organizations the user may create courses in (empty when unrestricted). */
  readonly allowedOrganizations: readonly string[];
  readonly allowCourseReruns: boolean;
  readonly rerunCreatorStatus: boolean;
  readonly taxonomiesEnabled: boolean;
  readonly librariesEnabled: boolean;
  /** Studio's display name, e.g. `My Open edX - Studio`. */
  readonly studioName: string;
  readonly platformName: string;
  readonly inProcessCourseActions: readonly InProcessCourseAction[];
}

interface RawInProcessCourseAction {
  readonly course_key?: string;
  readonly display_name?: string;
  readonly is_in_progress?: boolean;
  readonly is_failed?: boolean;
}

interface RawStudioHome {
  readonly course_creator_status?: string;
  readonly allow_to_create_new_org?: boolean;
  readonly allowed_organizations?: readonly string[];
  readonly allow_course_reruns?: boolean;
  readonly rerun_creator_status?: boolean;
  readonly taxonomies_enabled?: boolean;
  readonly libraries_enabled?: boolean;
  readonly studio_name?: string;
  readonly platform_name?: string;
  readonly in_process_course_actions?: readonly RawInProcessCourseAction[];
  readonly courses?: readonly RawStudioCourse[];
}

function toAction(raw: RawInProcessCourseAction): InProcessCourseAction {
  return {
    courseKey: raw.course_key ?? '',
    displayName: raw.display_name ?? '',
    isInProgress: raw.is_in_progress ?? false,
    isFailed: raw.is_failed ?? false,
  };
}

/**
 * Reads Studio Home's data for the session. This is where a spec (or the author
 * provisioning flow) learns the session's course-creator status.
 *
 * @throws {ApiError} on a non-200 — a `401` means no Studio session yet; see
 *   `establishStudioSession`.
 */
export async function fetchStudioHome(
  request: APIRequestContext,
  config: AppConfig,
): Promise<StudioHome> {
  const response = await request.get(`${studioOrigin(config)}${STUDIO_HOME_PATH}`);
  const raw = await studioJson<RawStudioHome>(response, 'Reading Studio Home');
  return {
    courseCreatorStatus: (raw.course_creator_status ?? 'unrequested') as CourseCreatorStatus,
    allowToCreateNewOrg: raw.allow_to_create_new_org ?? false,
    allowedOrganizations: raw.allowed_organizations ?? [],
    allowCourseReruns: raw.allow_course_reruns ?? false,
    rerunCreatorStatus: raw.rerun_creator_status ?? false,
    taxonomiesEnabled: raw.taxonomies_enabled ?? false,
    librariesEnabled: raw.libraries_enabled ?? false,
    studioName: raw.studio_name ?? '',
    platformName: raw.platform_name ?? '',
    inProcessCourseActions: (raw.in_process_course_actions ?? []).map(toAction),
  };
}

/** One course as Studio Home lists it. */
export interface StudioCourseSummary {
  readonly courseKey: string;
  readonly displayName: string;
  readonly org: string;
  readonly number: string;
  readonly run: string;
  /** LMS "View Live" target. */
  readonly lmsLink: string;
  /** Whether the course is current (`false` once its end date has passed). */
  readonly isActive: boolean;
}

interface RawStudioCourse {
  readonly course_key?: string;
  readonly display_name?: string;
  readonly org?: string;
  readonly number?: string;
  readonly run?: string;
  readonly lms_link?: string;
  readonly is_active?: boolean;
}

interface RawStudioCoursesPage {
  readonly count?: number;
  readonly num_pages?: number;
  readonly results?: {
    readonly courses?: readonly RawStudioCourse[];
    readonly in_process_course_actions?: readonly RawInProcessCourseAction[];
  };
}

/** The MFE's list controls, as query parameters. */
export interface StudioCourseListQuery {
  /** Substring match on display name, org, number or run. */
  readonly search?: string;
  /** Sort key; prefix `-` for descending, e.g. `-display_name`. */
  readonly order?: string;
  readonly activeOnly?: boolean;
  readonly archivedOnly?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface StudioCourseList {
  /** Total matching courses across all pages. */
  readonly count: number;
  readonly numPages: number;
  readonly courses: readonly StudioCourseSummary[];
  readonly inProcessCourseActions: readonly InProcessCourseAction[];
}

function toSummary(raw: RawStudioCourse): StudioCourseSummary {
  return {
    courseKey: raw.course_key ?? '',
    displayName: raw.display_name ?? '',
    org: raw.org ?? '',
    number: raw.number ?? '',
    run: raw.run ?? '',
    lmsLink: raw.lms_link ?? '',
    isActive: raw.is_active ?? true,
  };
}

/**
 * Lists the session's courses the way Studio Home does, with the same search /
 * sort / filter parameters, so a spec can compare what the MFE renders with the
 * same query in a single `expect.poll`.
 *
 * Releases before the paginated v2 endpoint answer `404`; then the (unpaginated)
 * `courses` array of {@link STUDIO_HOME_PATH} is filtered here so callers see one
 * shape. Only `search` is honoured on that fallback.
 *
 * @throws {ApiError} on any other failure.
 */
export async function listStudioCourses(
  request: APIRequestContext,
  config: AppConfig,
  query: StudioCourseListQuery = {},
): Promise<StudioCourseList> {
  const origin = studioOrigin(config);
  const params = new URLSearchParams();
  if (query.search !== undefined) params.set('search', query.search);
  if (query.order !== undefined) params.set('order', query.order);
  if (query.activeOnly) params.set('active_only', 'true');
  if (query.archivedOnly) params.set('archived_only', 'true');
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('page_size', String(query.pageSize));
  const suffix = params.size > 0 ? `?${params.toString()}` : '';

  const response = await request.get(`${origin}${STUDIO_COURSES_PATH}${suffix}`);

  if (response.status() === 404) {
    // Older release without the v2 endpoint: fall back to the v1 home payload.
    const home = await request.get(`${origin}${STUDIO_HOME_PATH}`);
    const raw = await studioJson<RawStudioHome>(home, 'Reading Studio Home');
    const needle = query.search?.toLowerCase();
    const courses = (raw.courses ?? [])
      .map(toSummary)
      .filter(
        (course) =>
          needle === undefined ||
          [course.displayName, course.org, course.number, course.run].some((field) =>
            field.toLowerCase().includes(needle),
          ),
      );
    return {
      count: courses.length,
      numPages: 1,
      courses,
      inProcessCourseActions: (raw.in_process_course_actions ?? []).map(toAction),
    };
  }

  const raw = await studioJson<RawStudioCoursesPage>(response, 'Listing Studio courses');
  if (raw.results === undefined) {
    throw new ApiError('Studio course list returned an unexpected shape.', {
      status: response.status(),
      url: response.url(),
      body: JSON.stringify(raw).slice(0, 500),
    });
  }
  return {
    count: raw.count ?? 0,
    numPages: raw.num_pages ?? 1,
    courses: (raw.results.courses ?? []).map(toSummary),
    inProcessCourseActions: (raw.results.in_process_course_actions ?? []).map(toAction),
  };
}
