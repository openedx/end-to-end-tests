import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';

/**
 * Public Course Detail API. Readable without enrollment or staff rights. Also
 * the LMS-side reading for Studio's Schedule & Details and Advanced Settings:
 * what an author saved in Studio is what this reports a moment later.
 */
export const COURSE_DETAIL_PATH = '/api/courses/v1/courses';

/**
 * The course's own identifiers and title, straight from the platform.
 *
 * Specs need the identifiers to *drive* the UI — a catalog search has to be given
 * something to search for. Taking them from the API rather than from a constant
 * keeps the suite installation-agnostic (the demo course is titled differently on
 * different installs) and keeps the search term test-owned data rather than
 * displayed copy, which the no-displayed-text rule forbids reading back.
 */
export interface CourseDetail {
  readonly id: string;
  /** Display name, e.g. `Open edX Demo Course`. Localized in principle. */
  readonly name: string;
  /** Course number, e.g. `DemoX`. An identifier, so never translated. */
  readonly number: string;
  /** Organization short code, e.g. `OpenedX`. */
  readonly org: string;
  /** Course start, ISO-8601 UTC, or `null`. */
  readonly start: string | null;
  readonly end: string | null;
  readonly enrollmentStart: string | null;
  readonly enrollmentEnd: string | null;
  /** `self` or `instructor`. */
  readonly pacing: string;
  /** Estimated effort as authored in Schedule & Details, or `null`. */
  readonly effort: string | null;
  /** Whether the course is hidden from the catalog (`catalog_visibility` not `both`). */
  readonly hidden: boolean;
  readonly invitationOnly: boolean;
  /** About-page intro video URL, when one is set. */
  readonly courseVideoUri: string | null;
  /** Course card image URL. */
  readonly courseImageUri: string | null;
}

interface RawCourseDetail {
  readonly id?: string;
  readonly name?: string;
  readonly number?: string;
  readonly org?: string;
  readonly start?: string | null;
  readonly end?: string | null;
  readonly enrollment_start?: string | null;
  readonly enrollment_end?: string | null;
  readonly pacing?: string;
  readonly effort?: string | null;
  readonly hidden?: boolean;
  readonly invitation_only?: boolean;
  readonly media?: {
    readonly course_video?: { readonly uri?: string | null };
    readonly course_image?: { readonly uri?: string | null };
  };
}

/**
 * Reads course metadata for `courseKey`.
 *
 * @throws {ApiError} when the course is not served by the target.
 */
export async function fetchCourseDetail(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseDetail> {
  const url = `${config.baseUrls.lms}${COURSE_DETAIL_PATH}/${encodeURIComponent(courseKey)}`;
  const response = await request.get(url);

  if (!response.ok()) {
    throw new ApiError(
      `Could not read course detail for "${courseKey}" (HTTP ${response.status()}).`,
      {
        status: response.status(),
        url,
        body: await response.text(),
      },
    );
  }

  const body = (await response.json()) as RawCourseDetail;
  if (typeof body.id !== 'string' || typeof body.number !== 'string') {
    throw new ApiError(`Course Detail API returned an unexpected shape for "${courseKey}".`, {
      status: response.status(),
      url,
      body: JSON.stringify(body).slice(0, 500),
    });
  }

  return {
    id: body.id,
    name: body.name ?? '',
    number: body.number,
    org: body.org ?? '',
    start: body.start ?? null,
    end: body.end ?? null,
    enrollmentStart: body.enrollment_start ?? null,
    enrollmentEnd: body.enrollment_end ?? null,
    pacing: body.pacing ?? '',
    effort: body.effort ?? null,
    hidden: body.hidden ?? false,
    invitationOnly: body.invitation_only ?? false,
    courseVideoUri: body.media?.course_video?.uri ?? null,
    courseImageUri: body.media?.course_image?.uri ?? null,
  };
}
