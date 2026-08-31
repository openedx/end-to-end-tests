import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { COURSE_DETAIL_PATH } from './course-detail';

/**
 * Raised when `COURSE_KEY` names a course the target does not serve to the
 * learner under test. Distinct from {@link ApiError} so a misconfigured
 * environment never reads as a product failure (ADR-0002, "fail fast with a
 * clear message").
 */
export class CoursePreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoursePreflightError';
  }
}

/**
 * How an operator gets content onto their installation. Deliberately phrased as
 * "any import mechanism works", with the Tutor recipe as one example: the suite
 * states what it needs rather than encoding one operator's seeding step, which
 * would tie it to one deployment (ADR-0002, "runnable by any provider").
 */
const SEEDING_HINT =
  'The course is a prerequisite of the environment, not something the suite creates. ' +
  'Import it with whatever mechanism your installation uses — on Tutor, ' +
  '`tutor local do importdemocourse` — then set COURSE_KEY to the imported key ' +
  '(e.g. COURSE_KEY=course-v1:OpenedX+DemoX+DemoCourse).';

/**
 * Course-completion preflight: confirm the configured course exists and is
 * visible before any spec enrolls in it or navigates to it.
 *
 * Uses the Course Detail API rather than the Blocks API the outline client uses:
 * blocks are readable only once the learner is enrolled (an unenrolled user gets
 * a 403), so a blocks-based check could not run before enrollment — which is the
 * point at which a missing course must be reported.
 *
 * @throws {CoursePreflightError} when the course is missing or inaccessible.
 */
export async function assertCourseAccessible(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<void> {
  const url = `${config.baseUrls.lms}${COURSE_DETAIL_PATH}/${encodeURIComponent(courseKey)}`;
  const response = await request.get(url);

  if (response.ok()) {
    return;
  }

  const detail = (await response.text()).slice(0, 300);
  const diagnosis =
    response.status() === 404 || response.status() === 400
      ? `No course "${courseKey}" is served by ${config.baseUrls.lms}.`
      : `The course "${courseKey}" is not readable (HTTP ${response.status()}). ` +
        'It may be unpublished, not yet started, or restricted.';

  throw new CoursePreflightError(
    `Course preflight failed. ${diagnosis} ${SEEDING_HINT} Target response: ${detail}`,
  );
}

/**
 * Reason to skip when no course is configured, or `undefined` when one is.
 *
 * An installation that has not opted into course-completion coverage should run
 * the rest of the suite cleanly, so an undeclared `COURSE_KEY` skips rather than
 * fails (plan §3.4 item 3) — the opposite of a *declared but broken* key, which
 * is a configuration error and must fail loudly.
 */
export function courseKeySkipReason(config: AppConfig): string | undefined {
  return config.courseKey === undefined
    ? 'COURSE_KEY is not set, so course-completion coverage is skipped. ' + SEEDING_HINT
    : undefined;
}
