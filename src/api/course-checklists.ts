import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson, studioOrigin } from './studio-origin';

/**
 * Data behind the Launch checklist (validation) and Best-practices checklist
 * (quality) in the authoring MFE. Both live under the courses API path but are
 * served by the **Studio** origin — the same path on the LMS is 404.
 */
export const COURSE_VALIDATION_PATH = '/api/courses/v1/validation';
export const COURSE_QUALITY_PATH = '/api/courses/v1/quality';

/** Launch-checklist facts. Field names follow the platform's payload. */
export interface CourseValidation {
  readonly is_self_paced: boolean;
  readonly dates: { readonly has_start_date: boolean; readonly has_end_date: boolean };
  readonly assignments: {
    readonly total_number: number;
    readonly total_visible: number;
    readonly assignments_with_dates_before_start: readonly unknown[];
    readonly assignments_with_dates_after_end: readonly unknown[];
  };
  readonly grades: { readonly has_grading_policy: boolean; readonly sum_of_weights: number };
  readonly certificates: {
    readonly is_activated: boolean;
    readonly has_certificate: boolean;
    readonly is_enabled: boolean;
  };
  readonly updates: { readonly has_update: boolean };
  readonly proctoring?: Readonly<Record<string, boolean>>;
}

/** Best-practices facts. Field names follow the platform's payload. */
export interface CourseQuality {
  readonly is_self_paced: boolean;
  readonly sections: {
    readonly total_number: number;
    readonly total_visible: number;
    readonly number_with_highlights: number;
    readonly highlights_active_for_course: boolean;
    readonly highlights_enabled: boolean;
  };
  readonly subsections: {
    readonly total_visible: number;
    readonly num_with_one_block_type: number;
  };
  readonly units: { readonly total_visible: number };
  readonly videos: { readonly total_number: number; readonly num_mobile_encoded: number };
}

export async function fetchCourseValidation(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseValidation> {
  const response = await request.get(
    `${studioOrigin(config)}${COURSE_VALIDATION_PATH}/${courseKey}/?all=true&graded_only=true`,
  );
  return studioJson<CourseValidation>(response, `Reading the launch checklist of ${courseKey}`);
}

export async function fetchCourseQuality(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseQuality> {
  const response = await request.get(
    `${studioOrigin(config)}${COURSE_QUALITY_PATH}/${courseKey}/?all=true`,
  );
  return studioJson<CourseQuality>(
    response,
    `Reading the best-practices checklist of ${courseKey}`,
  );
}
