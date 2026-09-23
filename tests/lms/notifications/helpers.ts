/**
 * Every notification spec runs in the `studio-author` project: the worker
 * author is the course's instructor and staff (the actor behind notify-all
 * posts, course updates and ORA grades), and the recipients are learners on
 * their own contexts. Gated on `notifications` (default on; ulmo and earlier
 * opt out) and on `studio`, which the worker author needs.
 */
export const NOTIFICATION_TAGS: string[] = ['@studio', '@author', '@notifications'];
