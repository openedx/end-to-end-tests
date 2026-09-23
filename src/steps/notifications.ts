import type { APIRequestContext } from '@playwright/test';

import { listNotifications, type NotificationApp, type PlatformNotification } from '../api';
import { TIMEOUTS, type AppConfig } from '../config';
import { pollUntil } from './poll';

/** Decides whether a notification row is the one a case is waiting for. */
export type NotificationMatch = (row: PlatformNotification) => boolean;

/**
 * A forum notification of `type` about one thread. Keyed on `content_url`, not
 * `content_context.thread_id`: when a post merges into an older unseen row the
 * row keeps the older post's `thread_id` but its link moves to the newest post
 * (measured), so the link is what names the thread a row is about now.
 */
export function aboutThread(type: string, threadId: string): NotificationMatch {
  return (row) => row.notification_type === type && row.content_url.endsWith(`/posts/${threadId}`);
}

/** What a notification wait saw: the matching row, if any, and every row read. */
export interface NotificationWait {
  readonly found: PlatformNotification | undefined;
  readonly rows: readonly PlatformNotification[];
  readonly elapsedMs: number;
}

/** Enough rows that another test's late fan-out cannot push this one off the page. */
const WAIT_PAGE_SIZE = 50;

/**
 * Polls the recipient's own notifications until one satisfies `match`, under
 * `TIMEOUTS.notificationDelivery` by default. Never throws on timeout: the spec
 * asserts on `found`, and a failure message can show the rows that did arrive.
 */
export async function waitForNotification(
  recipient: APIRequestContext,
  config: AppConfig,
  match: NotificationMatch,
  options: { readonly app?: NotificationApp; readonly timeoutMs?: number } = {},
): Promise<NotificationWait> {
  const outcome = await pollUntil(
    async () =>
      (await listNotifications(recipient, config, { app: options.app, pageSize: WAIT_PAGE_SIZE }))
        .results,
    (rows) => rows.some(match),
    options.timeoutMs ?? TIMEOUTS.notificationDelivery,
  );
  return { found: outcome.last.find(match), rows: outcome.last, elapsedMs: outcome.elapsedMs };
}

/** What an absence check saw. */
export interface AbsenceCheck {
  /** Whether the sentinel received it — without that, absence proves nothing. */
  readonly delivered: boolean;
  /** The subject's rows that match; empty is the case's assertion. */
  readonly subjectRows: readonly PlatformNotification[];
}

/**
 * "This recipient gets nothing" cannot be shown by waiting a fixed time, so a
 * **sentinel** — a recipient who should receive the same notification — is
 * waited on first. Once it has arrived there, delivery has run, and the
 * subject's list is read once. The spec asserts `delivered` and an empty
 * `subjectRows`.
 */
export async function checkNotificationAbsent(
  subject: APIRequestContext,
  sentinel: APIRequestContext,
  config: AppConfig,
  match: NotificationMatch,
  options: { readonly app?: NotificationApp; readonly timeoutMs?: number } = {},
): Promise<AbsenceCheck> {
  const delivered =
    (await waitForNotification(sentinel, config, match, options)).found !== undefined;
  const rows = (
    await listNotifications(subject, config, { app: options.app, pageSize: WAIT_PAGE_SIZE })
  ).results;
  return { delivered, subjectRows: rows.filter(match) };
}
