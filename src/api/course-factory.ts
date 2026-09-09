import type { APIRequestContext } from '@playwright/test';

import { TIMEOUTS, type AppConfig } from '../config';
import { ApiError } from './errors';
import { fetchStudioHome } from './studio-home';
import { studioOrigin, studioWriteHeaders } from './studio-origin';

/**
 * The course-creation endpoint Studio Home itself posts to. Also performs
 * re-runs when the body carries `source_course_key`.
 */
export const CREATE_COURSE_PATH = '/course/';

/** Organization used for suite-created courses when `ORG` is not configured. */
export const DEFAULT_COURSE_ORG = 'E2E';

/** Prefix every suite-created course number carries, so operators can find them. */
export const COURSE_NUMBER_PREFIX = 'E2E';

/** Everything needed to create a course and to name it afterwards. */
export interface CourseIdentity {
  readonly org: string;
  readonly number: string;
  readonly run: string;
  readonly displayName: string;
  /** The key the platform will assign: `course-v1:{org}+{number}+{run}`. */
  readonly courseKey: string;
}

export function courseKeyFor(org: string, number: string, run: string): string {
  return `course-v1:${org}+${number}+${run}`;
}

/**
 * Builds the identity for a suite-created course.
 *
 * Studio's uniqueness rule is **organization + course number** — the run does not
 * disambiguate (measured: a second run of the same org+number is refused) — so
 * the per-run uniqueness lives in the number: the run id shared by every worker
 * plus a `slot` that separates courses created within the run (a worker index,
 * or a label for a spec that creates its own). The display name carries the run
 * id too, giving list-search specs data the suite itself supplied to match on.
 *
 * Course keys admit letters, digits, `_`, `-` and `.`; `slot` and `label` are
 * sanitized to that alphabet.
 */
export function newCourseIdentity(
  config: AppConfig,
  runId: string,
  slot: string | number,
  label?: string,
): CourseIdentity {
  const safeSlot = String(slot).replace(/[^\w.-]/g, '');
  const org = config.org ?? DEFAULT_COURSE_ORG;
  const number = `${COURSE_NUMBER_PREFIX}${runId}${safeSlot}`.toUpperCase();
  const run = 'e2e';
  const displayName = `E2E ${label ?? 'course'} ${runId} ${safeSlot}`.trim();
  return { org, number, run, displayName, courseKey: courseKeyFor(org, number, run) };
}

interface CreateCourseResponse {
  readonly url?: string;
  readonly course_key?: string;
  readonly destination_course_key?: string;
  readonly ErrMsg?: string;
  readonly error?: string;
}

/**
 * Raised when Studio refuses to create a course because the org+number already
 * exists. Distinct so `ensureCourse` can recover by looking the course up.
 */
export class CourseExistsError extends ApiError {
  constructor(identity: CourseIdentity, details: { status: number; url: string; body: string }) {
    super(
      `Studio already has a course numbered "${identity.org}+${identity.number}" (${identity.courseKey}).`,
      details,
    );
    this.name = 'CourseExistsError';
  }
}

async function postCourse(
  request: APIRequestContext,
  config: AppConfig,
  data: Record<string, string>,
  identity: CourseIdentity,
  what: string,
): Promise<CreateCourseResponse> {
  const url = `${studioOrigin(config)}${CREATE_COURSE_PATH}`;
  const headers = await studioWriteHeaders(request, config);
  const response = await request.post(url, { data, headers });
  const text = await response.text();

  if (response.status() === 403) {
    throw new ApiError(
      `${what} was refused (HTTP 403): the session lacks course-creator status for ` +
        `org "${identity.org}", or course creation is disabled on the target.`,
      { status: 403, url, body: text },
    );
  }
  if (!response.ok()) {
    throw new ApiError(`${what} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: text,
    });
  }

  let body: CreateCourseResponse;
  try {
    body = JSON.parse(text) as CreateCourseResponse;
  } catch {
    // A 2xx with a non-JSON body is what the CMS returns when it is overloaded by
    // concurrent course creation (an error/HTML page slips through). It is
    // transient, so mark it retryable for `ensureCourse`.
    throw new ApiError(`${what} did not return JSON.`, {
      status: response.status(),
      url,
      body: text.slice(0, 500),
      retryable: true,
    });
  }

  // The legacy view reports a duplicate as HTTP 200 with an error body, so
  // success is "the body names a course", never `response.ok()`.
  if (body.ErrMsg !== undefined) {
    if (/already a course defined/i.test(body.ErrMsg)) {
      throw new CourseExistsError(identity, { status: 200, url, body: text });
    }
    throw new ApiError(`${what} was refused: ${body.ErrMsg}`, { status: 200, url, body: text });
  }
  return body;
}

/**
 * Creates a course through the same API Studio Home uses.
 *
 * @returns the course key the platform assigned (equal to `identity.courseKey`).
 * @throws {CourseExistsError} when the org+number is taken.
 * @throws {ApiError} when the session may not create courses, or on any other
 *   refusal, with the platform's message.
 */
export async function createCourse(
  request: APIRequestContext,
  config: AppConfig,
  identity: CourseIdentity,
): Promise<string> {
  const body = await postCourse(
    request,
    config,
    {
      org: identity.org,
      number: identity.number,
      run: identity.run,
      display_name: identity.displayName,
    },
    identity,
    `Creating course ${identity.courseKey}`,
  );
  if (typeof body.course_key !== 'string') {
    throw new ApiError('Studio created the course but returned no course_key.', {
      status: 200,
      url: `${studioOrigin(config)}${CREATE_COURSE_PATH}`,
      body: JSON.stringify(body),
    });
  }
  return body.course_key;
}

/**
 * Whether `courseKey` exists in Studio, read synchronously from the modulestore
 * via the course-details endpoint. Preferred over the Studio Home list for
 * existence checks: the list reads the course overview, which a background task
 * refreshes after creation, so a course can be missing from it for a moment
 * (seen with several workers creating courses at once) while this read is
 * already 200.
 *
 * A 403 means the course exists but the session may not edit it — for a suite
 * identity that is a collision with another user's course, reported as such.
 */
export async function courseExists(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<boolean> {
  const url = `${studioOrigin(config)}/api/contentstore/v1/course_details/${courseKey}`;
  const response = await request.get(url);
  if (response.ok()) return true;
  if (response.status() === 404) return false;
  if (response.status() === 403) {
    throw new ApiError(
      `${courseKey} exists but this session may not edit it. Another user owns a course ` +
        'with this suite identity; choose a different ORG or clean up stale E2E courses.',
      { status: 403, url, body: await response.text() },
    );
  }
  throw new ApiError(`Checking whether ${courseKey} exists failed (HTTP ${response.status()}).`, {
    status: response.status(),
    url,
    body: await response.text(),
  });
}

/**
 * How many times `ensureCourse` re-checks and retries after a server error from
 * course creation, and the pause between attempts. See `STUDIO-001` below.
 */
const ENSURE_COURSE_RETRIES = 3;
const ENSURE_COURSE_RETRY_MS = 1_500;

/**
 * Idempotent course provisioning: returns the existing course for this identity
 * when the session already has one, otherwise creates it. This is what keeps the
 * per-run course count down — a retried worker, or two fixtures asking for the
 * same slot, land on one course. There is no course-deletion API, so every
 * course that is *not* created is one an operator never has to clean up.
 *
 * Recovers from two races:
 * - {@link CourseExistsError}: someone else created this identity between the
 *   lookup and the create — look it up again.
 * - `STUDIO-001` (see `.private/findings.md`): two courses created concurrently
 *   under an organization that does not exist yet make the platform race on the
 *   org's get-or-create, and one caller gets a `500 IntegrityError` before any
 *   course is written. The org exists once the other caller succeeds, so a short
 *   pause, a re-check and a retry recover; anything else is re-thrown.
 */
export async function ensureCourse(
  request: APIRequestContext,
  config: AppConfig,
  identity: CourseIdentity,
): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    if (await courseExists(request, config, identity.courseKey)) {
      return identity.courseKey;
    }
    try {
      return await createCourse(request, config, identity);
    } catch (error) {
      if (error instanceof CourseExistsError) {
        // Lost a race with another creator of the same identity (same key), or
        // the org+number is taken by a course with a different run.
        if (await courseExists(request, config, identity.courseKey)) return identity.courseKey;
        throw error;
      }
      // Retry a transient creation failure: a 5xx, or a 2xx whose body was not
      // JSON — both are what an overloaded CMS returns when many workers create
      // courses at once. A jittered delay keeps the retries from re-colliding.
      const transient = error instanceof ApiError && (error.status >= 500 || error.retryable);
      if (!transient || attempt >= ENSURE_COURSE_RETRIES) {
        throw error;
      }
      const jitter = Math.floor(Math.random() * ENSURE_COURSE_RETRY_MS);
      await new Promise((resolve) => setTimeout(resolve, ENSURE_COURSE_RETRY_MS + jitter));
    }
  }
}

/**
 * Starts a re-run of `sourceCourseKey` into a new run. The copy is a Celery task
 * on the CMS worker; use {@link waitForRerun} before touching the destination.
 *
 * @returns the destination course key.
 */
export async function rerunCourse(
  request: APIRequestContext,
  config: AppConfig,
  sourceCourseKey: string,
  destination: CourseIdentity,
): Promise<string> {
  const body = await postCourse(
    request,
    config,
    {
      source_course_key: sourceCourseKey,
      org: destination.org,
      number: destination.number,
      run: destination.run,
      display_name: destination.displayName,
    },
    destination,
    `Re-running ${sourceCourseKey} as ${destination.courseKey}`,
  );
  if (typeof body.destination_course_key !== 'string') {
    throw new ApiError('Studio accepted the re-run but returned no destination_course_key.', {
      status: 200,
      url: `${studioOrigin(config)}${CREATE_COURSE_PATH}`,
      body: JSON.stringify(body),
    });
  }
  return body.destination_course_key;
}

/**
 * Waits until a re-run has left Studio Home's in-process list, polling the home
 * API under `TIMEOUTS.courseRerun`.
 *
 * @throws {ApiError} when the platform reports the re-run failed, or the budget
 *   runs out.
 */
export async function waitForRerun(
  request: APIRequestContext,
  config: AppConfig,
  destinationCourseKey: string,
  timeoutMs: number = TIMEOUTS.courseRerun,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const pollMs = 1_000;
  for (;;) {
    const home = await fetchStudioHome(request, config);
    const action = home.inProcessCourseActions.find((a) => a.courseKey === destinationCourseKey);
    if (action === undefined) return;
    if (action.isFailed) {
      throw new ApiError(`The re-run into ${destinationCourseKey} failed on the CMS worker.`, {
        status: 200,
        url: `${studioOrigin(config)}/api/contentstore/v1/home`,
        body: JSON.stringify(action),
      });
    }
    if (Date.now() + pollMs > deadline) {
      throw new ApiError(
        `The re-run into ${destinationCourseKey} was still in progress after ${timeoutMs} ms.`,
        { status: 200, url: '', body: JSON.stringify(action) },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
