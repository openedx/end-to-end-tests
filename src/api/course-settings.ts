import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { STUDIO_JSON_ACCEPT, studioJson, studioOrigin, studioWriteHeaders } from './studio-origin';

/** Schedule & Details, as the authoring MFE reads and writes it. */
export const COURSE_DETAILS_PATH = '/api/contentstore/v1/course_details';

/** Grading policy, as the authoring MFE reads and writes it. */
export const COURSE_GRADING_PATH = '/api/contentstore/v1/course_grading';

/**
 * What Schedule & Details may show and edit on this target: feature flags the MFE
 * reads before rendering the page.
 */
export const COURSE_SETTINGS_PATH = '/api/contentstore/v1/course_settings';

export interface CourseSettingsFlags {
  /**
   * Whether the "Certificates available date" fields render — needs the
   * `certificates.auto_certificate_generation` switch, off on a default install.
   */
  readonly canShowCertificateAvailableDateField: boolean;
  /** Whether the prerequisite-course control renders (`ENABLE_PREREQUISITE_COURSES`). */
  readonly isPrerequisiteCoursesEnabled: boolean;
  readonly enrollmentEndEditable: boolean;
  /** Courses the session may pick as a prerequisite (`possible_pre_requisite_courses`). */
  readonly possiblePrerequisiteCourseKeys: readonly string[];
}

interface RawCourseSettings {
  readonly can_show_certificate_available_date_field?: boolean;
  readonly is_prerequisite_courses_enabled?: boolean;
  readonly enrollment_end_editable?: boolean;
  readonly possible_pre_requisite_courses?: readonly { readonly course_key?: string }[];
}

export async function fetchCourseSettingsFlags(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseSettingsFlags> {
  const response = await request.get(`${studioOrigin(config)}${COURSE_SETTINGS_PATH}/${courseKey}`);
  const raw = await studioJson<RawCourseSettings>(
    response,
    `Reading the Schedule & Details flags of ${courseKey}`,
  );
  return {
    canShowCertificateAvailableDateField: raw.can_show_certificate_available_date_field ?? false,
    isPrerequisiteCoursesEnabled: raw.is_prerequisite_courses_enabled ?? false,
    enrollmentEndEditable: raw.enrollment_end_editable ?? true,
    possiblePrerequisiteCourseKeys: (raw.possible_pre_requisite_courses ?? [])
      .map((course) => course.course_key)
      .filter((key): key is string => typeof key === 'string'),
  };
}

/**
 * Advanced Settings, as the authoring MFE reads and writes them: the `v0` REST
 * endpoint (GET + PATCH). The legacy `/settings/advanced` view is avoided — it
 * serves HTML to a non-XHR caller on older releases (e.g. verawood), which a JSON
 * client cannot parse. Keys are snake_case on this endpoint.
 */
export const ADVANCED_SETTINGS_PATH = '/api/contentstore/v0/advanced_settings';

/**
 * The Schedule & Details fields the suite reads or writes. The platform returns
 * many more; anything not listed passes through untyped on reads and is never
 * written. Dates are ISO-8601 strings in UTC (`2026-01-01T00:00:00Z`) or `null`.
 */
export interface CourseDetails {
  readonly self_paced?: boolean;
  readonly start_date?: string | null;
  readonly end_date?: string | null;
  readonly enrollment_start?: string | null;
  readonly enrollment_end?: string | null;
  readonly certificate_available_date?: string | null;
  readonly certificates_display_behavior?: string;
  /** Estimated effort, free text the platform expects as `H:MM` or hours. */
  readonly effort?: string | null;
  /** YouTube video id of the About-page intro video. */
  readonly intro_video?: string | null;
  readonly course_image_name?: string;
  readonly course_image_asset_path?: string;
  readonly banner_image_name?: string;
  readonly short_description?: string;
  readonly overview?: string;
  readonly title?: string;
  readonly language?: string | null;
  readonly pre_requisite_courses?: readonly string[];
  readonly [field: string]: unknown;
}

export async function fetchCourseDetails(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseDetails> {
  const response = await request.get(`${studioOrigin(config)}${COURSE_DETAILS_PATH}/${courseKey}`);
  return studioJson<CourseDetails>(response, `Reading Schedule & Details of ${courseKey}`);
}

/**
 * Writes Schedule & Details fields. Partial bodies are accepted (measured), so
 * pass only what changes. Returns the full details as saved.
 *
 * One quirk (`PLAT-006`, measured on `main`): a body that carries `self_paced`
 * without `start_date` is answered 200 but leaves the pacing as it was — the
 * platform only toggles pacing while the course has a start it can see in the
 * same request. The MFE always sends the whole object, so it never notices; this
 * client adds the current `start_date` when a caller changes pacing alone, so a
 * partial write behaves like the full one.
 */
export async function updateCourseDetails(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  changes: Partial<CourseDetails>,
): Promise<CourseDetails> {
  // Read the current full object and merge the changes onto it, then send the
  // whole thing — the way the authoring MFE does. A *partial* body is accepted on
  // `main` but returns HTTP 500 on some releases (e.g. `verawood`).
  const current = await fetchCourseDetails(request, config, courseKey);
  const data = { ...current, ...changes };
  const headers = await studioWriteHeaders(request, config);
  const response = await request.put(`${studioOrigin(config)}${COURSE_DETAILS_PATH}/${courseKey}`, {
    data,
    headers,
  });
  return studioJson<CourseDetails>(response, `Updating Schedule & Details of ${courseKey}`);
}

/** One assignment type in the grading policy. */
export interface Grader {
  readonly type: string;
  readonly min_count: number;
  readonly drop_count: number;
  readonly short_label: string;
  /** Percentage of the grade, 0–100. */
  readonly weight: number;
  readonly id?: number;
}

export interface GradingPolicy {
  readonly graders: readonly Grader[];
  /** Letter → minimum fraction, e.g. `{ A: 0.9, B: 0.7, Pass: 0.5 }`. */
  readonly grade_cutoffs: Readonly<Record<string, number>>;
  readonly grace_period: { readonly hours: number; readonly minutes: number } | null;
  readonly minimum_grade_credit: number;
  readonly is_credit_course?: boolean;
}

interface RawGradingRead {
  readonly course_details?: GradingPolicy;
}

/** Reads the grading policy (the MFE wraps it in `course_details`). */
export async function fetchGradingPolicy(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<GradingPolicy> {
  const response = await request.get(`${studioOrigin(config)}${COURSE_GRADING_PATH}/${courseKey}`);
  const raw = await studioJson<RawGradingRead & GradingPolicy>(
    response,
    `Reading the grading policy of ${courseKey}`,
  );
  return raw.course_details ?? raw;
}

/** Replaces the grading policy. Returns the policy as saved. */
export async function updateGradingPolicy(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  policy: GradingPolicy,
): Promise<GradingPolicy> {
  const headers = await studioWriteHeaders(request, config);
  const response = await request.post(
    `${studioOrigin(config)}${COURSE_GRADING_PATH}/${courseKey}`,
    {
      data: policy,
      headers,
    },
  );
  return studioJson<GradingPolicy>(response, `Updating the grading policy of ${courseKey}`);
}

/** One Advanced Setting as Studio reports it. */
export interface AdvancedSetting<T = unknown> {
  readonly value: T;
  readonly display_name: string;
  readonly help: string;
  readonly deprecated: boolean;
}

export type AdvancedSettings = Readonly<Record<string, AdvancedSetting>>;

export async function fetchAdvancedSettings(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<AdvancedSettings> {
  const response = await request.get(
    `${studioOrigin(config)}${ADVANCED_SETTINGS_PATH}/${courseKey}`,
    { headers: STUDIO_JSON_ACCEPT },
  );
  const raw = await studioJson<Record<string, AdvancedSetting>>(
    response,
    `Reading Advanced Settings of ${courseKey}`,
  );
  return raw;
}

/**
 * Writes Advanced Settings: `{ field: { value } }` for each field to change.
 * Values are the JSON the field holds (a string for `display_name`, a boolean
 * for `invitation_only`, …). Returns every setting as saved.
 */
export async function updateAdvancedSettings(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  changes: Readonly<Record<string, unknown>>,
): Promise<AdvancedSettings> {
  const headers = await studioWriteHeaders(request, config);
  const data = Object.fromEntries(
    Object.entries(changes).map(([field, value]) => [field, { value }]),
  );
  const response = await request.patch(
    `${studioOrigin(config)}${ADVANCED_SETTINGS_PATH}/${courseKey}`,
    { data, headers },
  );
  return studioJson<AdvancedSettings>(response, `Updating Advanced Settings of ${courseKey}`);
}
