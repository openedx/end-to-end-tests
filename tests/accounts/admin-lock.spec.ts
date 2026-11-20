import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test as base, expect } from '@playwright/test';

import { createAdminSessionLock, type WithAdminSession } from '../../src/accounts';

/** Settles with `'timed out'` when `promise` has not settled within `ms`. */
const within = <T>(promise: Promise<T>, ms: number): Promise<T | 'timed out'> =>
  Promise.race([
    promise,
    new Promise<'timed out'>((resolve) => setTimeout(() => resolve('timed out'), ms)),
  ]);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Each test gets its own lock on a private directory, so an e2e worker holding
 * the suite's `.auth/admin-session.lock` during a full local run cannot leak in.
 */
const test = base.extend<{ lock: { withAdminSession: WithAdminSession; dir: string } }>({
  lock: async ({}, use) => {
    const parent = mkdtempSync(path.join(tmpdir(), 'admin-lock-'));
    const dir = path.join(parent, 'admin-session.lock');
    try {
      await use({ withAdminSession: createAdminSessionLock(dir), dir });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  },
});

/**
 * The cross-worker admin lock. A request from inside the hold, or while a
 * fixture holds it for the whole test, can never be granted, so it must fail at
 * once rather than wait out the stale-lock takeover past the test timeout. A
 * concurrent sibling request is granted once the first hold ends.
 */
test.describe('admin session lock', { tag: '@unit' }, () => {
  test('refuses a nested hold from inside the held work', async ({ lock }) => {
    const outcome = await within(
      lock
        .withAdminSession(() => lock.withAdminSession(() => Promise.resolve('inner ran')))
        .catch(messageOf),
      5_000,
    );

    expect(outcome).toMatch(/already holds the admin-session lock/);
    expect(existsSync(lock.dir)).toBe(false);
  });

  test('grants concurrent sibling holds one after the other', async ({ lock }) => {
    const order: string[] = [];
    const hold = (name: string) =>
      lock.withAdminSession(async () => {
        order.push(`${name} in`);
        await new Promise((resolve) => setTimeout(resolve, 50));
        order.push(`${name} out`);
        return name;
      });

    // `b` asks while `a` is held, as the second learner of a `Promise.all` does
    // once the first is already enrolling.
    const later = new Promise((resolve) => setTimeout(resolve, 20)).then(() => hold('b'));
    const outcome = await within(Promise.all([hold('a'), later]), 5_000);

    expect(outcome).toEqual(['a', 'b']);
    expect(order).toEqual(['a in', 'a out', 'b in', 'b out']);
    expect(existsSync(lock.dir)).toBe(false);
  });

  test('grants the lock again once it is released', async ({ lock }) => {
    expect(await lock.withAdminSession(() => Promise.resolve('first'))).toBe('first');
    expect(await lock.withAdminSession(() => Promise.resolve('second'))).toBe('second');
    expect(existsSync(lock.dir)).toBe(false);
  });
});

/**
 * A fixture holding the lock around its `use()` does not run the fixtures set up
 * after it inside its async context, so the nested check alone misses them; the
 * whole-test mark is what refuses them.
 */
const fixtureOrder = test.extend<{ wholeTestAdmin: string; laterBriefAdmin: string }>({
  wholeTestAdmin: async ({ lock }, use) => {
    await lock.withAdminSession(() => use('held'), { forWholeTest: true });
  },
  laterBriefAdmin: async ({ lock, wholeTestAdmin }, use) => {
    void wholeTestAdmin;
    await use(
      await within(
        lock.withAdminSession(() => Promise.resolve('brief ran')).catch(messageOf),
        5_000,
      ),
    );
  },
});

fixtureOrder(
  'refuses a fixture set up after a whole-test admin hold',
  { tag: '@unit' },
  ({ laterBriefAdmin }) => {
    expect(laterBriefAdmin).toMatch(/already holds the admin-session lock/);
  },
);
