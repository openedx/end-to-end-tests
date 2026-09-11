import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { storedJwtIsFresh } from './preflight';
import type { Role } from './roles';
import type { StorageState } from './types';

/** Directory where per-role storage state is written (gitignored). */
export const AUTH_STATE_DIR = '.auth';

/** Path to the storage-state file for a role, e.g. `.auth/learner.json`. */
export function authStateFile(role: Role): string {
  return path.join(AUTH_STATE_DIR, `${role}.json`);
}

/**
 * Writes storage state to `filePath` atomically: to a unique temp file in the
 * same directory, then `rename` into place. `rename(2)` is atomic on one
 * filesystem, so a reader — a restarted worker resuming its slot, another context
 * loading the same file — never observes a half-written file, even if this process
 * is OOM-killed mid-write. The memory-constrained CI target does kill processes
 * under pressure, and a torn state file otherwise fails every retry of that slot on
 * `Unterminated string in JSON`. A crash between the write and the rename leaves the
 * previous file untouched (and a stray `.tmp`, which the per-run `.auth/` wipe
 * clears) rather than a corrupt one.
 *
 * Prefer this over `context.storageState({ path })`, whose write is not atomic.
 */
export function persistStorageState(state: StorageState, filePath: string): void {
  const tmp = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, filePath);
}

/**
 * Whether `filePath` holds usable storage state — it exists *and* parses. A torn
 * write (a mid-write kill from before {@link persistStorageState}, or an external
 * truncation) reads as unusable, so callers treat it as absent and provision fresh
 * rather than failing on every retry. Use this in place of a bare `existsSync`
 * before loading a state file.
 */
export function isUsableStateFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    JSON.parse(readFileSync(filePath, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a captured author state file should be re-authenticated **before** a
 * per-test context loads it: it is torn/absent, or its login JWT has lapsed (or
 * is within {@link storedJwtIsFresh}'s margin of doing so).
 *
 * This is the proactive counterpart to the on-retry heal. A session the platform
 * evicted while the JWT is still valid needs no refresh here — the SSO handshake
 * rebuilds it off the live JWT. But once the JWT itself lapses, a request context
 * built from the file cannot be healed in place (`APIRequestContext` has no
 * cookie mutation), so every session-authed write on it fails until the file is
 * rewritten. Refreshing here, only when the JWT is stale, keeps a long worker run
 * (one that outlives the ~1 h JWT) from failing its first attempt while spending
 * a login roughly once an hour per worker rather than per test.
 */
export function storedSessionNeedsRefresh(filePath: string): boolean {
  if (!existsSync(filePath)) return true;
  try {
    const state = JSON.parse(readFileSync(filePath, 'utf8')) as StorageState;
    return !storedJwtIsFresh(state.cookies);
  } catch {
    return true;
  }
}
