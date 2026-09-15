import type { APIRequestContext, APIResponse } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';

/**
 * The LMS instructor API the instructor-dashboard MFE is built on
 * (`/api/instructor/v2/courses/<key>/…`, verawood onward). DRF views that accept
 * the JWT cookie, so in a `studio-author` test the author's `page.request` drives
 * them — no session-auth detour. Permissions are per view: most need course
 * staff/instructor, **report generation needs the course `data_researcher`
 * role** (`CAN_RESEARCH`), which a course's creator does not hold until granted
 * ({@link grantCourseTeamRole}).
 *
 * Two dashboard actions (the enrollment-status check and the extension reset)
 * still go through the legacy `/courses/<key>/instructor/api/*` views; the page
 * objects wait on those URLs directly.
 */
export const INSTRUCTOR_API_V2_PATH = '/api/instructor/v2/courses';

export function instructorApiBase(config: AppConfig, courseKey: string): string {
  return `${config.baseUrls.lms}${INSTRUCTOR_API_V2_PATH}/${courseKey}`;
}

// ---------------------------------------------------------------------------
// Types (the subset of each payload the suite reads)
// ---------------------------------------------------------------------------

/** One dashboard tab as the API lists it; `title` is localized, `tab_id` is not. */
export interface InstructorTab {
  readonly tab_id: string;
  readonly title: string;
  readonly url: string;
  readonly sort_order: number;
}

/** The dashboard model (`GET courses/<key>`). */
export interface InstructorCourse {
  readonly course_id: string;
  readonly username: string;
  readonly display_name: string;
  readonly org: string;
  readonly course_number: string;
  readonly course_run: string;
  readonly start: string | null;
  readonly end: string | null;
  readonly pacing: 'self' | 'instructor';
  readonly has_started: boolean;
  readonly has_ended: boolean;
  readonly total_enrollment: number;
  readonly learner_count: number;
  readonly staff_count: number;
  /** Per enrollment mode plus `total`. */
  readonly enrollment_counts: Readonly<Record<string, number>>;
  readonly num_sections: number;
  readonly grade_cutoffs: string;
  readonly studio_url: string;
  readonly gradebook_url: string;
  readonly studio_grading_url: string;
  readonly permissions: {
    readonly admin: boolean;
    readonly instructor: boolean;
    readonly staff: boolean;
    readonly data_researcher: boolean;
    readonly forum_admin: boolean;
  };
  readonly tabs: readonly InstructorTab[];
}

/** A background task while it runs; finished tasks drop out of the list. */
export interface InstructorTask {
  readonly task_id: string;
  readonly task_type: string;
  readonly task_state: string;
  readonly status: string;
  readonly created: string;
  readonly requester: string;
}

/** `GET tasks/<id>` — only for tasks whose id the caller knows. */
export interface InstructorTaskStatus {
  readonly task_id: string;
  readonly state: string;
  readonly error: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** The report types `reports/<type>/generate` accepts and `reports` lists. */
export type ReportType =
  | 'enrolled_students'
  | 'pending_enrollments'
  | 'pending_activations'
  | 'anonymized_student_ids'
  | 'grade'
  | 'problem_grade'
  | 'problem_responses'
  | 'ora2_summary'
  | 'ora2_data'
  | 'ora2_submission_files'
  | 'issued_certificates';

/** One generated report available for download. */
export interface ReportDownload {
  readonly report_name: string;
  /** Relative to the LMS on a default install; absolute where reports live in object storage. */
  readonly report_url: string;
  readonly date_generated: string;
  /** One of {@link ReportType} on a current install; kept open for types this client does not know. */
  readonly report_type: string;
}

/** DRF pagination envelope the list views share. */
export interface InstructorPage<T> {
  readonly count: number;
  readonly num_pages: number;
  readonly current_page: number;
  readonly next: string | null;
  readonly previous: string | null;
  readonly results: readonly T[];
}

export interface EnrollmentRow {
  readonly username: string;
  readonly full_name: string;
  readonly email: string;
  readonly mode: string;
  readonly is_beta_tester: boolean;
}

/** The state of one identifier before and after an enrollment change. */
export interface EnrollmentState {
  readonly user: boolean;
  readonly enrollment: boolean;
  /** A `CourseEnrollmentAllowed` exists — an unregistered e-mail invited to enroll. */
  readonly allowed: boolean;
  readonly auto_enroll: boolean;
}

export interface EnrollmentModifyResult {
  readonly identifier: string;
  readonly before?: EnrollmentState;
  readonly after?: EnrollmentState;
  readonly error?: string | boolean;
}

export interface BetaTesterModifyResult {
  readonly identifier: string;
  readonly error: boolean;
  readonly user_does_not_exist: boolean;
  readonly is_active: boolean | null;
}

export interface InstructorLearner {
  readonly username: string;
  readonly email: string;
  readonly full_name: string;
  /** The learner's progress page in the learning MFE (by user id). */
  readonly progress_url: string;
  readonly is_enrolled: boolean;
}

/** `GET problems/<key>?email_or_username=` — one learner's state on one problem. */
export interface LearnerProblem {
  readonly id: string;
  readonly name: string;
  readonly breadcrumbs: readonly { display_name: string; usage_key: string | null }[];
  /** `null` once the learner's state has been deleted. */
  readonly current_score: { readonly score: number; readonly total: number } | null;
  readonly attempts: { readonly current: number; readonly total: number | null } | null;
}

/** Answer of a grading action that queues a task (rescore, override). */
export interface QueuedGradingTask {
  readonly task_id: string;
  readonly status_url: string;
}

/** Answer of a synchronous grading action (reset attempts, delete state). */
export interface GradingActionResult {
  readonly success: boolean;
  readonly learner: string;
  readonly problem_location: string;
  readonly message: string;
}

export interface UnitExtension {
  readonly username: string;
  readonly full_name: string;
  readonly email: string;
  readonly unit_title: string;
  readonly unit_location: string;
  readonly extended_due_date: string;
}

/** The `filter` values of `certificates/issued` (the MFE's filter dropdown, un-localized). */
export type IssuedCertificateFilter =
  | 'all'
  | 'received'
  | 'not_received'
  | 'audit_passing'
  | 'audit_not_passing'
  | 'error'
  | 'granted_exceptions'
  | 'invalidated';

export interface IssuedCertificate {
  readonly username: string;
  readonly email: string;
  readonly enrollment_track: string;
  /** `downloadable`, `notpassing`, `unavailable`, `audit_notpassing`, … */
  readonly certificate_status: string;
  /** `"Exception"` for allowlisted learners. */
  readonly special_case: string | null;
  readonly exception_granted: string | null;
  readonly exception_notes: string | null;
  readonly invalidated_by: string | null;
  readonly invalidation_date: string | null;
}

/** Answer of the exception and invalidation writes: who it worked for, who not. */
export interface LearnerListResult {
  readonly success: readonly string[];
  readonly errors: readonly { learner: string; message: string }[];
}

export interface CertificateGenerationHistoryRow {
  readonly task_name: string;
  readonly date: string;
  readonly details: string;
}

/**
 * Course-team roles the v2 API grants (`team/roles`): `staff`, `limited_staff`,
 * `instructor` (shown as "Admin"), `beta`, `data_researcher`, `ccx_coach`, and
 * the forum roles. Open-ended because the list is the target's.
 */
export type CourseTeamRoleV2 = string;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * The platform refuses to queue a second report of a type that is already
 * running (`400 "A report generation task is already running…"`). Typed so a
 * spec can tell a stuck task apart from a wrong request.
 */
export class TaskAlreadyRunningError extends ApiError {
  constructor(what: string, details: { url: string; body: string }) {
    super(`${what} was refused: a task of that type is already running for the course.`, {
      status: 400,
      url: details.url,
      body: details.body,
    });
    this.name = 'TaskAlreadyRunningError';
  }
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

async function readJson<T>(response: APIResponse, what: string): Promise<T> {
  const url = response.url();
  const body = await response.text();
  if (!response.ok()) {
    if (response.status() === 400 && /already running/i.test(body)) {
      throw new TaskAlreadyRunningError(what, { url, body });
    }
    throw new ApiError(`${what} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body,
    });
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiError(`${what} returned a non-JSON body.`, {
      status: response.status(),
      url,
      body: body.slice(0, 500),
      retryable: true,
    });
  }
}

async function get<T>(request: APIRequestContext, url: string, what: string): Promise<T> {
  return readJson<T>(await request.get(url), what);
}

async function write<T>(
  request: APIRequestContext,
  config: AppConfig,
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  what: string,
  data?: unknown,
): Promise<T> {
  const token = await fetchCsrfToken(request, config);
  const response = await request.fetch(url, {
    method,
    data,
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });
  return readJson<T>(response, what);
}

/**
 * A report's `report_url` is relative on a default install (`/media/grades/…`)
 * and absolute where reports live in object storage; both are downloadable as
 * the instructor.
 */
export function resolveReportUrl(config: AppConfig, reportUrl: string): string {
  return /^https?:\/\//.test(reportUrl) ? reportUrl : `${config.baseUrls.lms}${reportUrl}`;
}

// ---------------------------------------------------------------------------
// Dashboard model and tasks
// ---------------------------------------------------------------------------

/** The dashboard model: identifiers, counts, the caller's permissions, the tabs it may see. */
export async function fetchInstructorCourse(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<InstructorCourse> {
  return get(
    request,
    instructorApiBase(config, courseKey),
    `Reading the instructor dashboard model of ${courseKey}`,
  );
}

/**
 * Background tasks **currently running** for the course. Finished tasks are not
 * listed — a task's completion is read as "no longer here" together with the
 * state it was meant to produce (see `waitForInstructorTask` in `src/steps/`).
 */
export async function listInstructorTasks(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly InstructorTask[]> {
  const body = await get<{ tasks: InstructorTask[] }>(
    request,
    `${instructorApiBase(config, courseKey)}/instructor_tasks`,
    `Listing instructor tasks of ${courseKey}`,
  );
  return body.tasks;
}

/** One task by id — only the certificate and grading writes hand an id back. */
export async function fetchInstructorTask(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  taskId: string,
): Promise<InstructorTaskStatus> {
  return get(
    request,
    `${instructorApiBase(config, courseKey)}/tasks/${taskId}`,
    `Reading instructor task ${taskId}`,
  );
}

// ---------------------------------------------------------------------------
// Data downloads
// ---------------------------------------------------------------------------

/** Reports available for download, newest first. */
export async function listReports(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly ReportDownload[]> {
  const body = await get<{ downloads: ReportDownload[] }>(
    request,
    `${instructorApiBase(config, courseKey)}/reports`,
    `Listing report downloads of ${courseKey}`,
  );
  return body.downloads;
}

/** Downloads a listed report as the caller; returns the raw response for content checks. */
export async function downloadReport(
  request: APIRequestContext,
  config: AppConfig,
  report: ReportDownload,
): Promise<APIResponse> {
  const url = resolveReportUrl(config, report.report_url);
  const response = await request.get(url);
  if (!response.ok()) {
    throw new ApiError(
      `Downloading report ${report.report_name} failed (HTTP ${response.status()}).`,
      {
        status: response.status(),
        url,
        body: (await response.text()).slice(0, 500),
      },
    );
  }
  return response;
}

// ---------------------------------------------------------------------------
// Enrollments and beta testers
// ---------------------------------------------------------------------------

export async function listEnrollments(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  query: {
    readonly search?: string;
    readonly isBetaTester?: boolean;
    readonly pageSize?: number;
  } = {},
): Promise<InstructorPage<EnrollmentRow>> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.isBetaTester !== undefined) params.set('is_beta_tester', String(query.isBetaTester));
  params.set('page_size', String(query.pageSize ?? 100));
  return get(
    request,
    `${instructorApiBase(config, courseKey)}/enrollments?${params}`,
    `Listing enrollments of ${courseKey}`,
  );
}

/** One learner's identity and enrollment state in the course. */
export async function fetchInstructorLearner(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  emailOrUsername: string,
): Promise<InstructorLearner> {
  return get(
    request,
    `${instructorApiBase(config, courseKey)}/learners/${encodeURIComponent(emailOrUsername)}`,
    `Reading learner ${emailOrUsername} in ${courseKey}`,
  );
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

/** One learner's score and attempts on one problem — the instructor-side grading oracle. */
export async function fetchLearnerProblem(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  problemUsageKey: string,
  emailOrUsername: string,
): Promise<LearnerProblem> {
  const params = new URLSearchParams({ email_or_username: emailOrUsername });
  return get(
    request,
    `${instructorApiBase(config, courseKey)}/problems/${problemUsageKey}?${params}`,
    `Reading ${emailOrUsername}'s state on ${problemUsageKey}`,
  );
}

function gradingUrl(
  config: AppConfig,
  courseKey: string,
  problemUsageKey: string,
  action: string,
  learner?: string,
): string {
  const params = learner ? `?${new URLSearchParams({ learner })}` : '';
  return `${instructorApiBase(config, courseKey)}/${problemUsageKey}/grading/${action}${params}`;
}

/** Resets attempts — synchronous for one learner, a task for all (`learner` omitted). */
export async function resetAttempts(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  problemUsageKey: string,
  learner?: string,
): Promise<GradingActionResult | QueuedGradingTask> {
  return write(
    request,
    config,
    'POST',
    gradingUrl(config, courseKey, problemUsageKey, 'attempts/reset', learner),
    `Resetting attempts on ${problemUsageKey}${learner ? ` for ${learner}` : ' for all learners'}`,
    {},
  );
}

/** Overrides one learner's score — answered `202` with the task it queued. */
export async function overrideScore(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  problemUsageKey: string,
  learner: string,
  score: number,
): Promise<QueuedGradingTask> {
  return write(
    request,
    config,
    'PUT',
    gradingUrl(config, courseKey, problemUsageKey, 'scores', learner),
    `Overriding ${learner}'s score on ${problemUsageKey} to ${score}`,
    { score },
  );
}

// ---------------------------------------------------------------------------
// Date extensions
// ---------------------------------------------------------------------------

export async function listUnitExtensions(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  query: { readonly emailOrUsername?: string; readonly blockId?: string } = {},
): Promise<InstructorPage<UnitExtension>> {
  const params = new URLSearchParams({ page_size: '100' });
  if (query.emailOrUsername) params.set('email_or_username', query.emailOrUsername);
  if (query.blockId) params.set('block_id', query.blockId);
  return get(
    request,
    `${instructorApiBase(config, courseKey)}/unit_extensions?${params}`,
    `Listing due-date extensions of ${courseKey}`,
  );
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

/** Whether the **platform** allows certificate generation (`CertificateGenerationConfiguration`). */
export async function fetchCertificateGenerationEnabled(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<boolean> {
  const body = await get<{ enabled: boolean }>(
    request,
    `${instructorApiBase(config, courseKey)}/certificates/config`,
    `Reading certificate configuration of ${courseKey}`,
  );
  return body.enabled;
}

/** Turns student-generated certificates on or off for the course. */
export async function setCourseCertificateGeneration(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  enabled: boolean,
): Promise<void> {
  await write(
    request,
    config,
    'POST',
    `${instructorApiBase(config, courseKey)}/certificates/toggle_generation`,
    `${enabled ? 'Enabling' : 'Disabling'} certificate generation for ${courseKey}`,
    { enabled },
  );
}

export async function listIssuedCertificates(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  query: { readonly filter?: IssuedCertificateFilter; readonly search?: string } = {},
): Promise<InstructorPage<IssuedCertificate>> {
  const params = new URLSearchParams({ page_size: '100', filter: query.filter ?? 'all' });
  if (query.search) params.set('search', query.search);
  return get(
    request,
    `${instructorApiBase(config, courseKey)}/certificates/issued?${params}`,
    `Listing issued certificates of ${courseKey}`,
  );
}

/** Adds learners to the certificate allowlist ("Grant Exception"). */
export async function grantCertificateException(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  learners: readonly string[],
  notes: string,
): Promise<LearnerListResult> {
  return write(
    request,
    config,
    'POST',
    `${instructorApiBase(config, courseKey)}/certificates/exceptions`,
    `Granting certificate exceptions to ${learners.join(', ')}`,
    { learners, notes },
  );
}

/**
 * Starts certificate (re)generation. `allowlisted_not_generated` is the
 * dashboard's "generate exception certificates" (BTR TC-00537). The one
 * certificate write that answers with a task id.
 */
export async function regenerateCertificates(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  scope: {
    readonly studentSet?: 'all' | 'allowlisted' | 'allowlisted_not_generated';
    readonly statuses?: readonly string[];
  } = {},
): Promise<{ task_id: string; message: string }> {
  return write(
    request,
    config,
    'POST',
    `${instructorApiBase(config, courseKey)}/certificates/regenerate`,
    `Regenerating certificates (${scope.studentSet ?? 'all'}) in ${courseKey}`,
    {
      ...(scope.studentSet ? { student_set: scope.studentSet } : {}),
      ...(scope.statuses ? { statuses: scope.statuses } : {}),
    },
  );
}

export async function listCertificateGenerationHistory(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<InstructorPage<CertificateGenerationHistoryRow>> {
  return get(
    request,
    `${instructorApiBase(config, courseKey)}/certificates/generation_history?page_size=100`,
    `Listing certificate generation history of ${courseKey}`,
  );
}

// ---------------------------------------------------------------------------
// Course team roles
// ---------------------------------------------------------------------------

/**
 * Grants (`allow`) or revokes (`revoke`) a course-team role. A course instructor
 * may grant itself `data_researcher`, which report generation requires.
 */
export async function grantCourseTeamRole(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  identifiers: readonly string[],
  role: CourseTeamRoleV2,
  action: 'allow' | 'revoke' = 'allow',
): Promise<{ action: string; role: string; results: { identifier: string; error: boolean }[] }> {
  const result = await write<{
    action: string;
    role: string;
    results: { identifier: string; error: boolean }[];
  }>(
    request,
    config,
    'POST',
    `${instructorApiBase(config, courseKey)}/team`,
    `${action === 'allow' ? 'Granting' : 'Revoking'} ${role} for ${identifiers.join(', ')} in ${courseKey}`,
    { identifiers, role, action },
  );
  const failed = result.results.filter((row) => row.error);
  if (failed.length > 0) {
    throw new ApiError(
      `${role} was not ${action === 'allow' ? 'granted to' : 'revoked from'} ${failed.map((row) => row.identifier).join(', ')}.`,
      {
        status: 200,
        url: `${instructorApiBase(config, courseKey)}/team`,
        body: JSON.stringify(result),
      },
    );
  }
  return result;
}
