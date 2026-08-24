import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import { AUTH_STATE_DIR } from '../src/auth';

/**
 * Runs once in the main process before any project (including `setup`). Clears
 * captured auth storage state so it never persists between runs: the `setup`
 * project re-provisions and rewrites `.auth/<role>.json` from scratch each run,
 * and downstream projects always consume a fresh session rather than a stale one
 * left over from a previous invocation.
 */
export default async function globalSetup(): Promise<void> {
  if (existsSync(AUTH_STATE_DIR)) {
    await rm(AUTH_STATE_DIR, { recursive: true, force: true });
    console.log(`[global-setup] Cleared stale auth state in ${AUTH_STATE_DIR}/`);
  }
}
