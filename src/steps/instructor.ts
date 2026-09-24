import type { APIRequestContext } from '@playwright/test';

import type { ProgressPage } from '../pages/lms/course-home/progress.page';
import { submitProblem } from './gating';
import { pollUntil, type PollOutcome } from './poll';
import { TIMEOUTS, type AppConfig } from '../config';
import {
  ApiError,
  fetchCourseProgress,
  fetchInstructorCourse,
  fetchInstructorTask,
  grantCertificateException,
  grantCourseTeamRole,
  listInstructorTasks,
  listReports,
  regenerateCertificates,
  type AuthoredProblem,
  type CourseProgress,
  type InstructorTask,
  type LearnerListResult,
  type ReportDownload,
  type ReportType,
} from '../api';

/**
 * Instructor-dashboard flows that span the instructor's API and the learner's:
 * waiting out the background tasks the dashboard queues, and the multi-step
 * certificate path. Every wait polls under `TIMEOUTS.instructorTask` and
 * **returns what it last observed** instead of throwing, so a spec's failure
 * message can show the readings — a slow Celery worker and a wrong result then
 * look different (the lesson of `PLAT-009`).
 */

/** `tasks/<id>` states after which a task will not change again (measured: `completed`). */
const TERMINAL_TASK_STATES = new Set(['completed', 'failed', 'error', 'revoked']);

/** The outcome of a bounded poll: whether the condition held, and the last readings. */

/** What {@link waitForInstructorTask} observed when it stopped. */
export type TaskWaitOutcome<T> = PollOutcome<{ tasks: readonly InstructorTask[]; reading: T }>;

/**
 * Waits for the dashboard's background work to land: **no task** (of
 * `taskType`, when given) is still listed by `instructor_tasks` **and** the
 * `reading` satisfies `settled`. Both together, because `instructor_tasks`
 * lists only in-flight tasks — a task that finished, or one that never ran,
 * both leave it empty — and because the effect of a task (a grade, a report) is
 * written a moment after the task drops out of the list.
 */
export async function waitForInstructorTask<T>(
  instructor: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  options: {
    readonly taskType?: string;
    readonly reading: () => Promise<T>;
    readonly settled: (reading: T) => boolean;
    readonly timeoutMs?: number;
  },
): Promise<TaskWaitOutcome<T>> {
  return pollUntil(
    async () => ({
      tasks: await listInstructorTasks(instructor, config, courseKey),
      reading: await options.reading(),
    }),
    ({ tasks, reading }) =>
      !tasks.some(
        (task) => options.taskType === undefined || task.task_type === options.taskType,
      ) && options.settled(reading),
    options.timeoutMs ?? TIMEOUTS.instructorTask,
  );
}

/**
 * Waits for a report of `reportType` that was **not in `before`** — the
 * downloads listing taken just before the request — to appear (and for the task
 * list to clear). Diffing against the earlier listing rather than comparing
 * clocks tolerates skew between the runner and the LMS worker and same-minute
 * reports of the same type. `report` is `undefined` when none appeared within
 * the budget; `tasks` and `sameType` then say what the platform showed.
 */
export async function waitForReport(
  instructor: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  reportType: ReportType,
  before: readonly ReportDownload[],
): Promise<{
  report: ReportDownload | undefined;
  tasks: readonly InstructorTask[];
  /** Every download of that type when the wait stopped, for a failure message. */
  sameType: readonly ReportDownload[];
  elapsedMs: number;
}> {
  const known = new Set(before.map((download) => download.report_name));
  const isNew = (download: ReportDownload) => !known.has(download.report_name);
  const outcome = await waitForInstructorTask(instructor, config, courseKey, {
    reading: async () =>
      (await listReports(instructor, config, courseKey)).filter(
        (download) => download.report_type === reportType,
      ),
    settled: (sameType) => sameType.some(isNew),
  });
  const sameType = outcome.last.reading;
  return {
    report: sameType.find(isNew),
    tasks: outcome.last.tasks,
    sameType,
    elapsedMs: outcome.elapsedMs,
  };
}

/**
 * Polls the learner's own progress reading until `settled` — the learner-side
 * oracle for grade adjustments (`subsections[].problem_scores`) and due-date
 * extensions (`subsections[].due`), which the platform recomputes after the
 * instructor's write lands.
 */
export async function waitForLearnerProgress(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  settled: (progress: CourseProgress) => boolean,
  timeoutMs: number = TIMEOUTS.instructorTask,
): Promise<PollOutcome<CourseProgress>> {
  return pollUntil(() => fetchCourseProgress(learner, config, courseKey), settled, timeoutMs);
}

/**
 * Makes sure the caller holds the course `data_researcher` role, which report
 * generation requires and a course's creator does not get by default. One
 * read, and a grant only when missing — so a seed can call it every run.
 * Returns whether a grant was made.
 */
export async function ensureDataResearcher(
  instructor: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<boolean> {
  const course = await fetchInstructorCourse(instructor, config, courseKey);
  if (course.permissions.data_researcher) return false;
  await grantCourseTeamRole(instructor, config, courseKey, [course.username], 'data_researcher');
  return true;
}

/** Everything {@link mintCertificateByException} observed, for the spec to judge. */
export interface CertificateMintOutcome {
  /** Who the allowlist write succeeded and failed for. */
  readonly exception: LearnerListResult;
  /** The regeneration task, once queued. */
  readonly taskId: string | undefined;
  /** Its final `state` (`completed`, `failed`, …) or `undefined` when never read. */
  readonly taskState: string | undefined;
  /** The learner's own `certificate_data.cert_status` when the wait stopped. */
  readonly certStatus: string | undefined;
  /** Whether the learner's status reached `downloadable` within the budget. */
  readonly downloadable: boolean;
  readonly elapsedMs: number;
}

/**
 * The dashboard's "grant an exception, then generate exception certificates"
 * path (BTR TC-00536/537) through the API: allowlist the learner, queue
 * regeneration for allowlisted learners without a certificate, wait for the
 * task, and poll the learner's own progress reading until the certificate is
 * `downloadable`. Reports every reading rather than throwing, so a spec can
 * say which step did not happen. The course must already allow certificates
 * (platform switch, active certificate, course toggle, a certificate-bearing
 * enrollment) — the `certificateCourse` fixture's job.
 */
export async function mintCertificateByException(
  instructor: APIRequestContext,
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  username: string,
  notes: string,
): Promise<CertificateMintOutcome> {
  const started = Date.now();
  const exception = await grantCertificateException(
    instructor,
    config,
    courseKey,
    [username],
    notes,
  );
  if (!exception.success.includes(username)) {
    return {
      exception,
      taskId: undefined,
      taskState: undefined,
      certStatus: undefined,
      downloadable: false,
      elapsedMs: Date.now() - started,
    };
  }

  const { task_id: taskId } = await regenerateCertificates(instructor, config, courseKey, {
    studentSet: 'allowlisted_not_generated',
  });
  const task = await pollUntil(
    () => fetchInstructorTask(instructor, config, courseKey, taskId),
    (status) => TERMINAL_TASK_STATES.has(status.state),
    TIMEOUTS.instructorTask,
  );
  const progress = await waitForLearnerProgress(
    learner,
    config,
    courseKey,
    (reading) => reading.certificateStatus === 'downloadable',
  );
  return {
    exception,
    taskId,
    taskState: task.last.state,
    certStatus: progress.last.certificateStatus,
    downloadable: progress.satisfied,
    elapsedMs: Date.now() - started,
  };
}

/**
 * Makes a certificate-course learner pass: answers the course's one graded
 * problem correctly, then waits until the progress API reports a passing grade.
 * Returns the last progress reading.
 */
export async function passCertificateCourse(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  problem: AuthoredProblem,
): Promise<PollOutcome<CourseProgress>> {
  await submitProblem(learner, config, courseKey, problem, problem.correct);
  return waitForLearnerProgress(learner, config, courseKey, (p) => p.courseGrade.isPassing);
}

/**
 * Takes a certificate-course learner to an issued certificate the way a
 * learner does: passes the course, requests the certificate from the Progress
 * tab, and waits until the progress API reports it downloadable. Returns the
 * last progress reading — its `certificateWebViewUrl` is the certificate — or,
 * when the learner never reached a passing grade, the last grade reading.
 */
export async function earnCertificate(
  learner: APIRequestContext,
  progressPage: ProgressPage,
  config: AppConfig,
  courseKey: string,
  problem: AuthoredProblem,
): Promise<PollOutcome<CourseProgress>> {
  const passed = await passCertificateCourse(learner, config, courseKey, problem);
  // A learner who is not passing is offered no certificate to request.
  if (!passed.satisfied) return passed;
  await progressPage.goto(courseKey);
  const requested = await progressPage.requestCertificate();
  if (!requested.ok()) {
    throw new ApiError(`Requesting the certificate failed (HTTP ${requested.status()}).`, {
      status: requested.status(),
      url: requested.url(),
      body: await requested.text(),
    });
  }
  return waitForLearnerProgress(
    learner,
    config,
    courseKey,
    (p) => p.certificateStatus === 'downloadable' && p.certificateWebViewUrl !== undefined,
  );
}

/** Who reads the instructor dashboard, by course role. */
export type InstructorViewer = 'instructor' | 'staff' | 'limitedStaff' | 'staffDiscussionAdmin';

/** What a course offers that adds dashboard tabs, as the test set it up. */
export interface InstructorTabConditions {
  /** The viewer holds `data_researcher` on the course (Data Downloads). */
  readonly dataResearcher: boolean;
  /** The course holds an ORA (Open Responses). */
  readonly hasOra: boolean;
  /** Course e-mail is on for the course (Bulk Email, in the communications MFE). */
  readonly emailEnabled: boolean;
  /** Special exams are on for the platform and the course (Special Exams). */
  readonly specialExams: boolean;
  /** Aspects is installed (its Reports tab, `aspects`). */
  readonly aspects: boolean;
}

/** The tab ids a viewer must be offered, and those the platform may add. */
export interface ExpectedInstructorTabs {
  readonly required: readonly string[];
  /**
   * Tabs no API or capability predicts for this viewer, each with its reason;
   * offered or not, neither is a failure. Any tab outside `required` and these
   * is.
   */
  readonly tolerated: Readonly<Record<string, string>>;
}

/**
 * The instructor dashboard's tab rules (`lms/djangoapps/instructor/views/
 * serializers_v2.py`, `get_tabs`, identical on `verawood` apart from settings
 * reads), restated for one viewer and the conditions the test set up — what
 * TC-00514 compares the dashboard's `tabs[]` and nav with:
 *
 * - course staff (limited staff included): Course Info, Enrollments, Grading,
 *   Cohorts; Open Responses with an ORA, Bulk Email with course e-mail on,
 *   Special Exams where they are enabled;
 * - Course Team: the instructor, or staff who are also Discussion Admins;
 * - Date Extensions: the instructor; Data Downloads: a data researcher;
 * - Certificates: global staff, or the instructor where the platform setting
 *   `ENABLE_CERTIFICATES_INSTRUCTOR_MANAGE` is on — which nothing exposes, so
 *   it is tolerated for the instructor and never offered to staff;
 * - plugin tabs: Aspects' Reports (`aspects`) where it is installed.
 */
export function expectedInstructorTabs(
  viewer: InstructorViewer,
  conditions: InstructorTabConditions,
): ExpectedInstructorTabs {
  const instructor = viewer === 'instructor';
  const tabs: [string, boolean][] = [
    ['course_info', true],
    ['enrollments', true],
    ['course_team', instructor || viewer === 'staffDiscussionAdmin'],
    ['grading', true],
    ['date_extensions', instructor],
    ['data_downloads', conditions.dataResearcher],
    ['open_responses', conditions.hasOra],
    ['cohorts', true],
    ['bulk_email', conditions.emailEnabled],
    ['special_exams', conditions.specialExams],
    ['aspects', conditions.aspects],
  ];
  return {
    required: tabs.filter(([, offered]) => offered).map(([id]) => id),
    tolerated: instructor
      ? {
          certificates:
            'offered to a course instructor only where ENABLE_CERTIFICATES_INSTRUCTOR_MANAGE is on',
        }
      : {},
  };
}
