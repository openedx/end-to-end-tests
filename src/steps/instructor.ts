import type { APIRequestContext } from '@playwright/test';

import { TIMEOUTS, type AppConfig } from '../config';
import {
  fetchCourseProgress,
  fetchInstructorCourse,
  fetchInstructorTask,
  fetchLearnerProblem,
  grantCertificateException,
  grantCourseTeamRole,
  listInstructorTasks,
  listReports,
  regenerateCertificates,
  type CourseProgress,
  type InstructorTask,
  type LearnerListResult,
  type LearnerProblem,
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

const POLL_INTERVAL_MS = 1_000;

/** The outcome of a bounded poll: whether the condition held, and the last readings. */
export interface PollOutcome<T> {
  readonly satisfied: boolean;
  readonly last: T;
  readonly elapsedMs: number;
}

async function pollUntil<T>(
  read: () => Promise<T>,
  satisfied: (reading: T) => boolean,
  timeoutMs: number,
): Promise<PollOutcome<T>> {
  const started = Date.now();
  let last = await read();
  while (!satisfied(last) && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    last = await read();
  }
  return { satisfied: satisfied(last), last, elapsedMs: Date.now() - started };
}

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
 * Waits for a report queued at or after `since` to appear in the downloads
 * list (and for the task list to clear). `report` is `undefined` when it did
 * not within the budget; `tasks` then says whether it was still running.
 */
export async function waitForReport(
  instructor: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  reportType: ReportType,
  since: Date,
): Promise<{
  report: ReportDownload | undefined;
  tasks: readonly InstructorTask[];
  /** Every download of that type when the wait stopped, for a failure message. */
  sameType: readonly ReportDownload[];
  elapsedMs: number;
}> {
  // `date_generated` is minute-resolution, so allow the minute `since` fell in.
  const floor = Math.floor(since.getTime() / 60_000) * 60_000;
  const isNew = (download: ReportDownload) => Date.parse(download.date_generated) >= floor;
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

/** Polls the instructor's view of one learner's problem state until `settled`. */
export async function waitForLearnerProblem(
  instructor: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  problemUsageKey: string,
  username: string,
  settled: (problem: LearnerProblem) => boolean,
  timeoutMs: number = TIMEOUTS.instructorTask,
): Promise<PollOutcome<LearnerProblem>> {
  return pollUntil(
    () => fetchLearnerProblem(instructor, config, courseKey, problemUsageKey, username),
    settled,
    timeoutMs,
  );
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
    (status) =>
      status.state !== 'pending' && status.state !== 'in_progress' && status.state !== 'PROGRESS',
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
