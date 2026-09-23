import { randomUUID } from 'node:crypto';

import type { AppConfig } from '../../../src/config';

/**
 * Every notification spec runs in the `studio-author` project: the worker
 * author is the course's instructor and staff (the actor behind notify-all
 * posts, course updates and ORA grades), and the recipients are learners on
 * their own contexts. Gated on `notifications` (default on; ulmo and earlier
 * opt out) and on `studio`, which the worker author needs.
 */
export const NOTIFICATION_TAGS: string[] = ['@studio', '@author', '@notifications'];

/** A post title unique to this test — the test's own data, safe to match. */
export function uniqueTitle(kind: string): string {
  return `E2E ${kind} ${randomUUID().slice(0, 8)}`;
}

/**
 * Where the notification specs open the tray: the learner dashboard, whose
 * header every learner sees first (TC-00476 walks the other surfaces).
 */
export function trayHostUrl(config: AppConfig): string {
  return `${config.baseUrls.apps}/learner-dashboard/`;
}
