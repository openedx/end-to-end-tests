import { mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * A cross-worker mutex around use of the configured admin account.
 *
 * The platform's `PREVENT_CONCURRENT_LOGINS` (on by default) ends a user's other
 * sessions every time that user signs in. Provisioned accounts are unique per
 * worker, so they never trip it — but there is one admin, and several workers
 * may need it at once: to grant course-creator status (a Django-admin form, which
 * takes only a session, not the JWT), or to drive Studio as a superuser in a
 * browser. Left unserialised, one worker's admin sign-in silently logs another's
 * out mid-flight. Holding this lock from sign-in to the last request that needs
 * the session keeps the sessions from overlapping.
 *
 * The lock is a directory created atomically with `mkdir`, which is what makes it
 * safe across the worker processes on one machine. It lives under `.auth/`, which
 * global setup clears, so a lock a crashed run left behind never outlives the run;
 * within a run, a holder that is gone for longer than {@link STALE_AFTER_MS} is
 * presumed dead and its lock is taken over.
 */
const LOCK_DIR = path.join('.auth', 'admin-session.lock');

/** How long a holder may keep the lock before a waiter may take it over. */
const STALE_AFTER_MS = 180_000;

/** How often a waiter re-checks the lock. */
const RETRY_EVERY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquire(): Promise<void> {
  for (;;) {
    try {
      mkdirSync(LOCK_DIR, { recursive: false });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(LOCK_DIR).mtimeMs > STALE_AFTER_MS) {
          rmSync(LOCK_DIR, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Released between the failed mkdir and the stat: try again at once.
        continue;
      }
      await sleep(RETRY_EVERY_MS);
    }
  }
}

function release(): void {
  rmSync(LOCK_DIR, { recursive: true, force: true });
}

/**
 * Runs `work` while holding the admin-session lock. Everything that signs in as
 * the admin — and everything that then relies on that session — belongs inside.
 */
export async function withAdminSession<T>(work: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await work();
  } finally {
    release();
  }
}
