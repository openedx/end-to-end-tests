import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';

/** Course Home API the learning MFE's Progress tab reads. */
export const COURSE_PROGRESS_PATH = '/api/course_home/progress';

/**
 * Per-course completion and grade state, as served to the learning MFE.
 *
 * **This is the suite's authoritative assertion for course completion**: every
 * field below is numeric or an enum, so assertions on it are immune both to site
 * language and to MFE markup churn — exactly what ADR-0002 asks for. UI assertions
 * are reserved for cases where the rendering itself is under test.
 */
export interface CourseProgress {
  readonly completionSummary: {
    readonly completeCount: number;
    readonly incompleteCount: number;
    readonly lockedCount: number;
  };
  readonly courseGrade: {
    /** Fraction in 0..1. */
    readonly percent: number;
    readonly isPassing: boolean;
    /** Letter grade, or `null` before one is earned. */
    readonly letterGrade: string | null;
  };
  /**
   * Passing threshold as a fraction, read from the course's own grading policy,
   * so the suite never hard-codes 0.5.
   */
  readonly passingThreshold: number | undefined;
  /** Certificate status enum (e.g. `audit_passing`, `downloadable`), not copy. */
  readonly certificateStatus: string | undefined;
  readonly certificateDownloadUrl: string | null | undefined;
  /** Untouched payload, for assertions the typed view does not cover yet. */
  readonly raw: unknown;
}

interface RawProgress {
  completion_summary?: {
    complete_count?: number;
    incomplete_count?: number;
    locked_count?: number;
  };
  course_grade?: { percent?: number; is_passing?: boolean; letter_grade?: string | null };
  grading_policy?: { grade_range?: Record<string, number> };
  certificate_data?: { cert_status?: string; download_url?: string | null };
}

/** Total units the API accounts for — the denominator for "course complete". */
export function totalUnits(progress: CourseProgress): number {
  const { completeCount, incompleteCount, lockedCount } = progress.completionSummary;
  return completeCount + incompleteCount + lockedCount;
}

/**
 * Reads completion and grade state for `courseKey` as the caller's session.
 *
 * @throws {ApiError} when the course is not accessible to the session, or the
 * response is not the expected shape.
 */
export async function fetchCourseProgress(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseProgress> {
  const url = `${config.baseUrls.lms}${COURSE_PROGRESS_PATH}/${encodeURIComponent(courseKey)}`;
  const response = await request.get(url);

  if (!response.ok()) {
    throw new ApiError(
      `Could not read course progress for "${courseKey}" (HTTP ${response.status()}).`,
      { status: response.status(), url, body: await response.text() },
    );
  }

  const body = (await response.json()) as RawProgress;
  const summary = body.completion_summary;
  if (!summary || typeof summary.complete_count !== 'number') {
    throw new ApiError(`Progress API returned no completion summary for "${courseKey}".`, {
      status: response.status(),
      url,
      body: JSON.stringify(body).slice(0, 500),
    });
  }

  return {
    completionSummary: {
      completeCount: summary.complete_count,
      incompleteCount: summary.incomplete_count ?? 0,
      lockedCount: summary.locked_count ?? 0,
    },
    courseGrade: {
      percent: body.course_grade?.percent ?? 0,
      isPassing: body.course_grade?.is_passing ?? false,
      letterGrade: body.course_grade?.letter_grade ?? null,
    },
    // `grade_range` maps letter grade to its minimum fraction; the lowest bound is
    // the pass mark whatever the course calls its grades.
    passingThreshold: minimumGradeBound(body.grading_policy?.grade_range),
    certificateStatus: body.certificate_data?.cert_status,
    certificateDownloadUrl: body.certificate_data?.download_url,
    raw: body,
  };
}

function minimumGradeBound(gradeRange: Record<string, number> | undefined): number | undefined {
  const bounds = Object.values(gradeRange ?? {}).filter((value) => typeof value === 'number');
  return bounds.length > 0 ? Math.min(...bounds) : undefined;
}
