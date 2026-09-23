import { mkdirSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * A cross-worker **reader/writer** lock, for platform-wide state one case must
 * change while others depend on it staying put.
 *
 * The motivating case is the `certificates.auto_certificate_generation` waffle
 * switch: it is global, so turning it on for TC-00114 would turn another
 * worker's "Request certificate" case (TC-00032) into an automatic grant
 * mid-test. Every case that relies on the switch being off holds the lock
 * **shared**; the case that flips it holds it **exclusive**, so it waits for
 * the readers to finish and holds new ones off until it has switched back.
 *
 * Like `withAdminSession` (`src/accounts/admin-lock.ts`) it is built from
 * directories created atomically with `mkdir`, under `.auth/`, which global
 * setup clears — a lock a crashed run left behind never outlives the run. It
 * differs in two ways: holders are many-or-one, and every holder **heartbeats**
 * its entry, because these locks are held for a whole test (up to the
 * five-minute `contentTest` budget) and a waiter must not mistake a long holder
 * for a dead one.
 *
 * Not re-entrant. Take it outside `withAdminSession`, never inside: the admin
 * lock is always the inner one, held only for the admin write.
 */
export interface NamedLockOptions {
  /** Where lock directories live; `.auth/locks` by default. */
  readonly root?: string;
  /** Give up waiting after this long, naming the holders. */
  readonly waitMs: number;
  /** A holder whose entry has not been touched for this long is presumed dead. */
  readonly staleAfterMs?: number;
  /** How often a holder touches its entry. */
  readonly heartbeatMs?: number;
  /** How often a waiter re-checks. */
  readonly retryMs?: number;
}

const DEFAULT_ROOT = path.join('.auth', 'locks');
const DEFAULT_STALE_AFTER_MS = 90_000;
const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_RETRY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Raised when a lock could not be taken in time; names who held it. */
export class NamedLockTimeoutError extends Error {
  constructor(name: string, mode: 'shared' | 'exclusive', holders: readonly string[]) {
    super(
      `Timed out waiting for the "${name}" lock (${mode}); held by: ${holders.join(', ') || 'nobody (contention)'}.`,
    );
    this.name = 'NamedLockTimeoutError';
  }
}

interface Paths {
  readonly dir: string;
  readonly writer: string;
  readonly readers: string;
}

function pathsFor(name: string, root: string): Paths {
  const dir = path.join(root, name);
  return { dir, writer: path.join(dir, 'writer'), readers: path.join(dir, 'readers') };
}

function isStale(entry: string, staleAfterMs: number): boolean {
  try {
    return Date.now() - statSync(entry).mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
}

function tryMkdir(target: string): boolean {
  try {
    mkdirSync(target, { recursive: false });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

function exists(target: string): boolean {
  try {
    statSync(target);
    return true;
  } catch {
    return false;
  }
}

/** Removes readers that stopped heartbeating; returns the live ones. */
function liveReaders(readers: string, staleAfterMs: number): readonly string[] {
  let names: string[];
  try {
    names = readdirSync(readers);
  } catch {
    return [];
  }
  return names.filter((name) => {
    const entry = path.join(readers, name);
    if (isStale(entry, staleAfterMs)) {
      rmSync(entry, { recursive: true, force: true });
      return false;
    }
    return true;
  });
}

function holders(paths: Paths, staleAfterMs: number): readonly string[] {
  const writer = exists(paths.writer) ? ['writer'] : [];
  return [...writer, ...liveReaders(paths.readers, staleAfterMs).map((id) => `reader ${id}`)];
}

function startHeartbeat(entry: string, everyMs: number): () => void {
  const timer = setInterval(() => {
    const now = new Date();
    try {
      utimesSync(entry, now, now);
    } catch {
      // Released concurrently; the next tick is cleared by the caller.
    }
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}

async function acquireShared(paths: Paths, options: Required<NamedLockOptions>): Promise<string> {
  mkdirSync(paths.readers, { recursive: true });
  const entry = path.join(paths.readers, `${process.pid}-${randomUUID().slice(0, 8)}`);
  const deadline = Date.now() + options.waitMs;
  for (;;) {
    if (exists(paths.writer) && isStale(paths.writer, options.staleAfterMs)) {
      rmSync(paths.writer, { recursive: true, force: true });
    }
    if (!exists(paths.writer)) {
      mkdirSync(entry);
      // A writer that arrived between the check and the mkdir wins: step back.
      if (!exists(paths.writer)) return entry;
      rmSync(entry, { recursive: true, force: true });
    }
    if (Date.now() > deadline) {
      throw new NamedLockTimeoutError(
        path.basename(paths.dir),
        'shared',
        holders(paths, options.staleAfterMs),
      );
    }
    await sleep(options.retryMs);
  }
}

async function acquireExclusive(paths: Paths, options: Required<NamedLockOptions>): Promise<void> {
  mkdirSync(paths.readers, { recursive: true });
  const deadline = Date.now() + options.waitMs;
  const timedOut = () =>
    new NamedLockTimeoutError(
      path.basename(paths.dir),
      'exclusive',
      holders(paths, options.staleAfterMs),
    );
  // First claim the writer slot, which also stops new readers from entering…
  while (!tryMkdir(paths.writer)) {
    if (isStale(paths.writer, options.staleAfterMs)) {
      rmSync(paths.writer, { recursive: true, force: true });
      continue;
    }
    if (Date.now() > deadline) throw timedOut();
    await sleep(options.retryMs);
  }
  // …then wait for the readers already inside to drain.
  const stopHeartbeat = startHeartbeat(paths.writer, options.heartbeatMs);
  try {
    while (liveReaders(paths.readers, options.staleAfterMs).length > 0) {
      if (Date.now() > deadline) throw timedOut();
      await sleep(options.retryMs);
    }
  } catch (error) {
    stopHeartbeat();
    rmSync(paths.writer, { recursive: true, force: true });
    throw error;
  }
  stopHeartbeat();
}

function resolved(options: NamedLockOptions): Required<NamedLockOptions> {
  return {
    root: options.root ?? DEFAULT_ROOT,
    waitMs: options.waitMs,
    staleAfterMs: options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS,
    heartbeatMs: options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
    retryMs: options.retryMs ?? DEFAULT_RETRY_MS,
  };
}

/** Runs `work` holding `name` shared: alongside other readers, never alongside the writer. */
export async function withSharedLock<T>(
  name: string,
  options: NamedLockOptions,
  work: () => Promise<T>,
): Promise<T> {
  const full = resolved(options);
  const paths = pathsFor(name, full.root);
  const entry = await acquireShared(paths, full);
  const stopHeartbeat = startHeartbeat(entry, full.heartbeatMs);
  try {
    return await work();
  } finally {
    stopHeartbeat();
    rmSync(entry, { recursive: true, force: true });
  }
}

/** Runs `work` holding `name` exclusively: no reader and no other writer at the same time. */
export async function withExclusiveLock<T>(
  name: string,
  options: NamedLockOptions,
  work: () => Promise<T>,
): Promise<T> {
  const full = resolved(options);
  const paths = pathsFor(name, full.root);
  await acquireExclusive(paths, full);
  const stopHeartbeat = startHeartbeat(paths.writer, full.heartbeatMs);
  try {
    return await work();
  } finally {
    stopHeartbeat();
    rmSync(paths.writer, { recursive: true, force: true });
  }
}
