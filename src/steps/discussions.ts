import type { APIRequestContext } from '@playwright/test';

import { listDiscussionTopics } from '../api';
import { TIMEOUTS, type AppConfig } from '../config';
import { pollUntil, type PollOutcome } from './poll';

/**
 * Waits until a discussion topic is offered to one learner. An in-context
 * topic is listed per learner from the blocks that learner can see, so a unit
 * the author has just published reaches a learner's topic list only after the
 * course's block structure is rebuilt (`contentPublish`) — later than the
 * author sees it. Until then the in-unit sidebar's editor falls back to the
 * first topic (measured). Returns the last topic ids read.
 */
export function waitForLearnerTopic(
  learner: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  topicId: string,
  timeoutMs: number = TIMEOUTS.contentPublish,
): Promise<PollOutcome<readonly string[]>> {
  return pollUntil(
    async () => (await listDiscussionTopics(learner, config, courseKey)).map((topic) => topic.id),
    (ids) => ids.includes(topicId),
    timeoutMs,
  );
}
