import { randomUUID } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';
import { lmsGet, lmsWrite } from './lms-json';

/**
 * The course forum through the LMS discussion API (`/api/discussion/`), backed
 * by `openedx-forum` on the `openedx` provider — the actions other actors take
 * so a recipient's notifications have something to report, and the readings
 * that decide the forum cases.
 *
 * Writes that change a thread or comment are `PATCH` with a merge-patch body;
 * course keys in query strings are URL-encoded (a raw `+` is refused with 400).
 */
const base = (config: AppConfig) => `${config.baseUrls.lms}/api/discussion`;

/** A course's discussion settings, and the caller's roles in its forum. */
export interface DiscussionCourse {
  readonly id: string;
  /** `openedx` for the forum this suite covers; `legacy` on the old provider. */
  readonly provider: string;
  readonly is_posting_enabled: boolean;
  readonly enable_in_context: boolean;
  /** Whether the caller may post with "Notify all learners". */
  readonly is_notify_all_learners_enabled: boolean;
  /** Forum roles, e.g. `["Student"]`, `["Moderator"]`. */
  readonly user_roles: readonly string[];
  readonly has_moderation_privileges: boolean;
  readonly is_course_staff: boolean;
}

export async function fetchDiscussionCourse(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<DiscussionCourse> {
  return lmsGet(
    request,
    `${base(config)}/v1/courses/${courseKey}`,
    `Reading the discussion settings of ${courseKey}`,
  );
}

/** One topic: `course` (General), a custom one, or one per in-context unit. */
export interface DiscussionTopic {
  readonly id: string;
  /** The unit's usage key for an in-context topic, else `null`. */
  readonly usage_key: string | null;
  readonly name: string;
  readonly thread_counts: { readonly discussion: number; readonly question: number };
}

export async function listDiscussionTopics(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly DiscussionTopic[]> {
  return lmsGet(
    request,
    `${base(config)}/v2/course_topics/${courseKey}`,
    `Listing discussion topics of ${courseKey}`,
  );
}

/** The course-wide topic every course has. */
export const GENERAL_TOPIC_ID = 'course';

/**
 * A post title (or other forum text) unique to one test — the test's own data,
 * so specs may match it in a notification or a mail.
 */
export function uniquePostTitle(kind: string): string {
  return `E2E ${kind} ${randomUUID().slice(0, 8)}`;
}

export interface DiscussionThread {
  readonly id: string;
  readonly course_id: string;
  readonly topic_id: string;
  readonly type: 'discussion' | 'question';
  readonly title: string;
  readonly raw_body: string;
  readonly author: string;
  readonly following: boolean;
  readonly voted: boolean;
  readonly vote_count: number;
  readonly abuse_flagged: boolean;
  readonly comment_count: number;
}

/**
 * Posts a thread. `following` defaults to **true**, as the discussions MFE's
 * editor does: the platform notifies a thread's author of responses only while
 * the author follows it, and the API's own default is false (measured).
 * `notifyAllLearners` is honoured for course staff, instructors and forum
 * moderators (`is_notify_all_learners_enabled`).
 */
export async function createThread(
  request: APIRequestContext,
  config: AppConfig,
  thread: {
    readonly courseKey: string;
    readonly topicId: string;
    readonly type: 'discussion' | 'question';
    readonly title: string;
    readonly body: string;
    readonly following?: boolean;
    readonly notifyAllLearners?: boolean;
  },
): Promise<DiscussionThread> {
  return lmsWrite(
    request,
    config,
    'POST',
    `${base(config)}/v1/threads/`,
    `Posting "${thread.title}"`,
    {
      data: {
        course_id: thread.courseKey,
        topic_id: thread.topicId,
        type: thread.type,
        title: thread.title,
        raw_body: thread.body,
        following: thread.following ?? true,
        ...(thread.notifyAllLearners ? { notify_all_learners: true } : {}),
      },
    },
  );
}

/** Edits, follows, votes on or reports (`abuse_flagged`) a thread. */
export async function updateThread(
  request: APIRequestContext,
  config: AppConfig,
  threadId: string,
  patch: Partial<
    Pick<DiscussionThread, 'title' | 'raw_body' | 'following' | 'voted' | 'abuse_flagged'>
  >,
): Promise<DiscussionThread> {
  return lmsWrite(
    request,
    config,
    'PATCH',
    `${base(config)}/v1/threads/${threadId}/`,
    `Updating thread ${threadId}`,
    { data: patch, mergePatch: true },
  );
}

/**
 * Deletes a thread. Not idempotent: deleting one that is already gone answers
 * 500, not 404 (`DISC-002`), so callers delete each thread once.
 */
export async function deleteThread(
  request: APIRequestContext,
  config: AppConfig,
  threadId: string,
): Promise<void> {
  await lmsWrite(
    request,
    config,
    'DELETE',
    `${base(config)}/v1/threads/${threadId}/`,
    `Deleting thread ${threadId}`,
  );
}

/** Lists a course's threads, optionally by search text, author or follow state. */
export async function listThreads(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  filter: {
    readonly textSearch?: string;
    readonly author?: string;
    readonly following?: boolean;
    readonly topicId?: string;
  } = {},
): Promise<readonly DiscussionThread[]> {
  const query = new URLSearchParams({ course_id: courseKey, page_size: '100' });
  if (filter.textSearch) query.set('text_search', filter.textSearch);
  if (filter.author) query.set('author', filter.author);
  if (filter.following !== undefined) query.set('following', String(filter.following));
  if (filter.topicId) query.set('topic_id', filter.topicId);
  const page = await lmsGet<{ readonly results: readonly DiscussionThread[] }>(
    request,
    `${base(config)}/v1/threads/?${query}`,
    `Listing threads of ${courseKey}`,
  );
  return page.results;
}

export interface DiscussionComment {
  readonly id: string;
  readonly thread_id: string;
  /** The response a comment answers; `null` for a response itself. */
  readonly parent_id: string | null;
  readonly raw_body: string;
  readonly author: string;
  readonly endorsed: boolean;
  readonly abuse_flagged: boolean;
}

/** Responds to a thread, or — with `parentId` — comments on a response. */
export async function createComment(
  request: APIRequestContext,
  config: AppConfig,
  comment: { readonly threadId: string; readonly body: string; readonly parentId?: string },
): Promise<DiscussionComment> {
  return lmsWrite(
    request,
    config,
    'POST',
    `${base(config)}/v1/comments/`,
    `Commenting on thread ${comment.threadId}`,
    {
      data: {
        thread_id: comment.threadId,
        raw_body: comment.body,
        ...(comment.parentId ? { parent_id: comment.parentId } : {}),
      },
    },
  );
}

/** Edits, endorses (moderators) or reports a response or comment. */
export async function updateComment(
  request: APIRequestContext,
  config: AppConfig,
  commentId: string,
  patch: Partial<Pick<DiscussionComment, 'raw_body' | 'endorsed' | 'abuse_flagged'>>,
): Promise<DiscussionComment> {
  return lmsWrite(
    request,
    config,
    'PATCH',
    `${base(config)}/v1/comments/${commentId}/`,
    `Updating comment ${commentId}`,
    { data: patch, mergePatch: true },
  );
}

/**
 * Divides a course's discussions by cohort (`division_scheme: cohort`, inline
 * topics included) through the LMS's legacy discussion-settings view
 * (`PATCH /courses/<key>/discussions/settings`) — the Group Moderator role's
 * precondition. The view is session-authed and course-staff only, and its REST
 * twin is global-staff only, so `session` is an LMS Django session (the admin
 * through `adminLms`). Returns the division scheme the view reports after.
 */
export async function divideDiscussionsByCohort(
  session: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<string> {
  const url = `${config.baseUrls.lms}/courses/${courseKey}/discussions/settings`;
  const token = await fetchCsrfToken(session, config);
  // Not followed: a stale session is redirected to the login page, and a
  // followed PATCH lands there as a 405 rather than saying so.
  const response = await session.fetch(url, {
    method: 'PATCH',
    maxRedirects: 0,
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
    data: { division_scheme: 'cohort', always_divide_inline_discussions: true },
  });
  if (response.status() >= 300 && response.status() < 400) {
    throw new ApiError(`Dividing the discussions of ${courseKey} was redirected to sign-in.`, {
      status: response.status(),
      url,
      body: '',
    });
  }
  if (!response.ok()) {
    throw new ApiError(
      `Dividing the discussions of ${courseKey} failed (HTTP ${response.status()}).`,
      {
        status: response.status(),
        url,
        body: (await response.text()).slice(0, 500),
      },
    );
  }
  const settings = (await response.json()) as { readonly division_scheme?: string };
  return settings.division_scheme ?? '';
}
