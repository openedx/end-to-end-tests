import { mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test, expect } from '@playwright/test';

import {
  NamedLockTimeoutError,
  withExclusiveLock,
  withSharedLock,
  type NamedLockOptions,
} from '../../src/fixtures/named-lock';

/**
 * Unit coverage for the cross-worker reader/writer lock the certificate switch
 * cases share. Everything runs in one process against a temporary directory;
 * the lock's only cross-process primitive is `mkdir`, which behaves the same.
 */
test.describe('named reader/writer lock', { tag: '@unit' }, () => {
  let root: string;
  const opts = (extra: Partial<NamedLockOptions> = {}): NamedLockOptions => ({
    root,
    waitMs: 2_000,
    retryMs: 5,
    heartbeatMs: 20,
    staleAfterMs: 500,
    ...extra,
  });
  const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  /** Work that finishes at once. */
  const at = (effect: () => void) => (): Promise<void> => {
    effect();
    return Promise.resolve();
  };

  test.beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'e2e-lock-'));
  });

  test.afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('lets readers overlap', async () => {
    let inside = 0;
    let most = 0;
    const reader = () =>
      withSharedLock('switch', opts(), async () => {
        inside += 1;
        most = Math.max(most, inside);
        await tick(50);
        inside -= 1;
      });
    await Promise.all([reader(), reader(), reader()]);
    expect(most).toBe(3);
  });

  test('makes the writer wait for readers already inside, and readers wait for the writer', async () => {
    const events: string[] = [];
    const reader = withSharedLock('switch', opts(), async () => {
      events.push('reader in');
      await tick(80);
      events.push('reader out');
    });
    await tick(10);
    const writer = withExclusiveLock('switch', opts(), async () => {
      events.push('writer in');
      await tick(80);
      events.push('writer out');
    });
    await tick(10);
    const lateReader = withSharedLock(
      'switch',
      opts(),
      at(() => events.push('late reader in')),
    );
    await Promise.all([reader, writer, lateReader]);
    expect(events).toEqual([
      'reader in',
      'reader out',
      'writer in',
      'writer out',
      'late reader in',
    ]);
  });

  test('keeps a long holder alive with its heartbeat', async () => {
    let writerIn = false;
    const reader = withSharedLock('switch', opts({ staleAfterMs: 100 }), async () => {
      await tick(400); // four stale windows, heartbeating every 20 ms
    });
    await tick(10);
    const writer = withExclusiveLock(
      'switch',
      opts({ staleAfterMs: 100 }),
      at(() => (writerIn = true)),
    );
    await tick(300);
    expect(writerIn).toBe(false);
    await Promise.all([reader, writer]);
    expect(writerIn).toBe(true);
  });

  test('takes over from a holder that stopped heartbeating', async () => {
    const dead = path.join(root, 'switch', 'readers', 'crashed-worker');
    mkdirSync(dead, { recursive: true });
    const past = new Date(Date.now() - 10_000);
    utimesSync(dead, past, past);

    let ran = false;
    await withExclusiveLock(
      'switch',
      opts(),
      at(() => (ran = true)),
    );
    expect(ran).toBe(true);
  });

  test('gives up after the wait budget and names the holder', async () => {
    const holding = withExclusiveLock('switch', opts(), () => tick(300));
    await tick(10);
    await expect(
      withSharedLock(
        'switch',
        opts({ waitMs: 50 }),
        at(() => {}),
      ),
    ).rejects.toThrow(NamedLockTimeoutError);
    await expect(
      withSharedLock(
        'switch',
        opts({ waitMs: 50 }),
        at(() => {}),
      ),
    ).rejects.toThrow(/held by: writer/);
    await holding;
  });

  test('releases on failure', async () => {
    await expect(
      withExclusiveLock('switch', opts(), () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    let ran = false;
    await withSharedLock(
      'switch',
      opts({ waitMs: 50 }),
      at(() => (ran = true)),
    );
    expect(ran).toBe(true);
  });
});
