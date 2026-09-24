import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { lmsWrite } from './lms-json';

/**
 * A block's own XBlock handlers in the LMS
 * (`POST /courses/<course>/xblock/<usage>/handler/<name>`) — what a learner's
 * poll, survey, word cloud or conditional reads its state from. They are
 * session-authed with CSRF, so `request` is the learner's own context. Each
 * reader narrows the handler's JSON to what a spec asserts: the platform's
 * record of what this learner submitted, never the rendered copy.
 */
export function xblockHandlerUrl(
  config: AppConfig,
  courseKey: string,
  usageKey: string,
  handler: string,
): string {
  return `${config.baseUrls.lms}/courses/${courseKey}/xblock/${usageKey}/handler/${handler}`;
}

async function callHandler(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  usageKey: string,
  handler: string,
): Promise<unknown> {
  return lmsWrite<unknown>(
    request,
    config,
    'POST',
    xblockHandlerUrl(config, courseKey, usageKey, handler),
    `Calling ${handler} on ${usageKey}`,
    { data: {} },
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function shapeError(what: string, body: unknown): ApiError {
  return new ApiError(`${what} answered an unexpected shape.`, {
    status: 200,
    url: '',
    body: JSON.stringify(body).slice(0, 500),
  });
}

/** One answer's vote count in a poll. */
export interface PollTally {
  readonly key: string;
  readonly count: number;
}

/** A poll's results (xblock-poll `get_results`): the question and each answer's count. */
export interface PollResults {
  readonly question: string;
  readonly total: number;
  readonly tally: readonly PollTally[];
}

export function narrowPollResults(body: unknown): PollResults {
  if (!isRecord(body) || !Array.isArray(body.tally) || typeof body.total !== 'number') {
    throw shapeError('The poll results', body);
  }
  return {
    question: typeof body.question === 'string' ? body.question : '',
    total: body.total,
    tally: body.tally.filter(isRecord).map((row) => ({
      key: String(row.key),
      count: Number(row.count),
    })),
  };
}

/** A poll's results as `learner` reads them. */
export async function fetchPollResults(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  usageKey: string,
): Promise<PollResults> {
  return narrowPollResults(await callHandler(learner, config, courseKey, usageKey, 'get_results'));
}

/** One survey question's counts per answer key. */
export interface SurveyQuestionTally {
  readonly key: string;
  readonly answers: readonly PollTally[];
}

export function narrowSurveyResults(body: unknown): readonly SurveyQuestionTally[] {
  if (!isRecord(body) || !Array.isArray(body.tally)) throw shapeError('The survey results', body);
  return body.tally.filter(isRecord).map((question) => ({
    key: String(question.key),
    answers: (Array.isArray(question.answers) ? question.answers : [])
      .filter(isRecord)
      .map((answer) => ({ key: String(answer.key), count: Number(answer.count) })),
  }));
}

/** A survey's per-question results (xblock-poll `get_results` on a survey). */
export async function fetchSurveyResults(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  usageKey: string,
): Promise<readonly SurveyQuestionTally[]> {
  return narrowSurveyResults(
    await callHandler(learner, config, courseKey, usageKey, 'get_results'),
  );
}

/** What a learner has put into a word cloud (`handle_get_state`). */
export interface WordCloudState {
  readonly submitted: boolean;
  /** The learner's own words and how many times the cloud holds each. */
  readonly studentWords: Readonly<Record<string, number>>;
  readonly totalCount: number;
}

export function narrowWordCloudState(body: unknown): WordCloudState {
  if (!isRecord(body) || body.status !== 'success') throw shapeError('The word cloud state', body);
  const words = isRecord(body.student_words) ? body.student_words : {};
  return {
    submitted: body.submitted === true,
    studentWords: Object.fromEntries(Object.entries(words).map(([w, n]) => [w, Number(n)])),
    totalCount: Number(body.total_count ?? 0),
  };
}

export async function fetchWordCloudState(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  usageKey: string,
): Promise<WordCloudState> {
  return narrowWordCloudState(
    await callHandler(learner, config, courseKey, usageKey, 'handle_get_state'),
  );
}

/**
 * What a conditional block serves `learner` (`conditional_get`): while its
 * condition is unmet, only the "complete this first" message; once met, its
 * children's rendered fragments.
 */
export interface ConditionalContent {
  readonly met: boolean;
  readonly fragments: readonly string[];
}

export function narrowConditionalContent(body: unknown): ConditionalContent {
  if (!isRecord(body) || !Array.isArray(body.fragments)) {
    throw shapeError('The conditional block', body);
  }
  return {
    met: body.message !== true,
    fragments: body.fragments
      .filter(isRecord)
      .map((fragment) => (typeof fragment.content === 'string' ? fragment.content : '')),
  };
}

export async function fetchConditionalContent(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  usageKey: string,
): Promise<ConditionalContent> {
  return narrowConditionalContent(
    await callHandler(learner, config, courseKey, usageKey, 'xmodule_handler/conditional_get'),
  );
}
