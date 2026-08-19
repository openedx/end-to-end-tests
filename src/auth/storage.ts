import path from 'node:path';

import type { Role } from './roles';

/** Directory where per-role storage state is written (gitignored). */
export const AUTH_STATE_DIR = '.auth';

/** Path to the storage-state file for a role, e.g. `.auth/learner.json`. */
export function authStateFile(role: Role): string {
  return path.join(AUTH_STATE_DIR, `${role}.json`);
}
