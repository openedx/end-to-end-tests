import { AsyncLocalStorage } from 'node:async_hooks';
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

export interface AdminSessionHoldOptions {
  /**
   * The hold lasts for the whole test: a fixture that takes the lock around its
   * `use()` (adminPage, adminApi, …). A request for the lock from this worker
   * while such a hold is open can never be granted before the test ends, so it
   * fails at once instead of waiting.
   */
  readonly forWholeTest?: boolean;
}

export type WithAdminSession = <T>(
  work: () => Promise<T>,
  options?: AdminSessionHoldOptions,
) => Promise<T>;

const SELF_WAIT_MESSAGE =
  'This worker already holds the admin-session lock, so taking it again would wait on ' +
  'itself. A fixture that holds the admin session for the whole test (adminPage, ' +
  'adminApi, …) was set up before one that needs it briefly: list the brief one ' +
  'first in the test signature.';

/**
 * Builds the lock around `lockDir`. The suite uses the one instance below; unit
 * tests build their own on a private directory so a running e2e worker's lock
 * never shows up in their assertions.
 *
 * The lock is not reentrant. Two requests from one worker can never both be
 * granted when the second is made while the first is still held *by its
 * caller*: a nested call inside `work`, or a fixture listed after a whole-test
 * admin fixture. Those fail at once instead of waiting until the stale-lock
 * takeover, long past the test timeout. Concurrent sibling requests (two
 * learners enrolled through `Promise.all`) are different: the first one's
 * `work` finishes on its own, so the second waits its turn as it would for
 * another worker.
 *
 * Nesting is tracked with `AsyncLocalStorage`, which follows `work`'s own async
 * calls but not Playwright's fixture runner: a fixture set up after another
 * fixture's `use()` does not run inside it. Whole-test holds are therefore
 * marked explicitly with `forWholeTest`.
 */
export function createAdminSessionLock(lockDir: string): WithAdminSession {
  const holder = new AsyncLocalStorage<true>();
  let wholeTestHolds = 0;

  async function acquire(): Promise<void> {
    for (;;) {
      try {
        mkdirSync(lockDir, { recursive: false });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          if (Date.now() - statSync(lockDir).mtimeMs > STALE_AFTER_MS) {
            rmSync(lockDir, { recursive: true, force: true });
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

  return async <T>(work: () => Promise<T>, options: AdminSessionHoldOptions = {}): Promise<T> => {
    if (holder.getStore() === true || wholeTestHolds > 0) throw new Error(SELF_WAIT_MESSAGE);
    await acquire();
    if (options.forWholeTest === true) wholeTestHolds += 1;
    try {
      return await holder.run(true, work);
    } finally {
      if (options.forWholeTest === true) wholeTestHolds -= 1;
      rmSync(lockDir, { recursive: true, force: true });
    }
  };
}

/**
 * Runs `work` while holding the admin-session lock. Everything that signs in as
 * the admin — and everything that then relies on that session — belongs inside.
 * Pass `{ forWholeTest: true }` from a fixture that holds it around `use()`.
 */
export const withAdminSession: WithAdminSession = createAdminSessionLock(LOCK_DIR);
