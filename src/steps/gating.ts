import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import {
  ApiError,
  CSRF_HEADER,
  fetchCsrfToken,
  primeCoursewareForLearner,
  type AuthoredProblem,
  type ProblemAnswer,
} from '../api';

/** What the LMS `problem_check` handler reported for one submission. */
interface ProblemCheckResult {
  /** The platform's grade string (`"correct"` / `"incorrect"`), or `undefined`. */
  readonly success: string | undefined;
  readonly status: number;
  readonly url: string;
  readonly body: string;
}

/**
 * Submits `answer` to an authored problem as `learner` through the LMS's
 * `problem_check` handler — the same call the courseware makes on Submit — and
 * returns the platform's grade.
 *
 * The input name the platform expects is `input_<problem-hash>_<suffix>`, where
 * the hash is the `block@…` segment of the problem's usage key (measured), so it
 * is built from the key rather than scraped from the rendered HTML. A single-value
 * answer (multiple choice, numerical, text) sends one field; a multi-select
 * (checkboxes) sends the same field name repeated, which `URLSearchParams`
 * preserves.
 */
async function postProblemCheck(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  problem: AuthoredProblem,
  answer: ProblemAnswer,
): Promise<ProblemCheckResult> {
  const hash = /block@([^/+]+)$/.exec(problem.usageKey)?.[1];
  if (hash === undefined) {
    throw new ApiError(`Could not read the block hash from "${problem.usageKey}".`, {
      status: 0,
      url: '',
      body: '',
    });
  }
  const inputName = `input_${hash}_${answer.inputSuffix}`;
  const token = await fetchCsrfToken(learner, config);
  const url =
    `${config.baseUrls.lms}/courses/${courseKey}/xblock/${problem.usageKey}` +
    `/handler/xmodule_handler/problem_check`;
  const form = new URLSearchParams();
  for (const value of answer.values) form.append(inputName, value);
  const response = await learner.post(url, {
    data: form.toString(),
    headers: {
      [CSRF_HEADER]: token,
      Referer: config.baseUrls.lms,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  const parsed = (await response.json().catch(() => ({}))) as { success?: string };
  return { success: parsed.success, status: response.status(), url, body: JSON.stringify(parsed) };
}

/**
 * Answers an authored problem correctly as `learner`, so a subsection that gates
 * on a minimum score in the problem's subsection unlocks. The unit is rendered
 * first to settle the learner's AnonymousUserId row (the same race
 * {@link primeCoursewareForLearner} guards on the outline).
 *
 * @throws {ApiError} when the platform does not report the answer correct.
 */
export async function satisfyPrerequisiteByScore(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  problem: AuthoredProblem,
  sequentialId: string,
): Promise<void> {
  await primeCoursewareForLearner(learner, config, sequentialId);

  const result = await postProblemCheck(learner, config, courseKey, problem, problem.correct);
  if (result.success !== 'correct') {
    throw new ApiError(
      `The prerequisite problem was not graded correct (got ${JSON.stringify(result.success)}).`,
      { status: result.status, url: result.url, body: result.body },
    );
  }
}

/**
 * Submits `answer` to an authored problem as `learner` and returns the platform's
 * grade string (`"correct"` / `"incorrect"`). Used to check that each common
 * problem type grades a right answer right and a wrong one wrong.
 */
export async function submitProblem(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  problem: AuthoredProblem,
  answer: ProblemAnswer,
): Promise<string | undefined> {
  return (await postProblemCheck(learner, config, courseKey, problem, answer)).success;
}
