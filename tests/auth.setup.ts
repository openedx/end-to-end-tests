import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { test as setup } from '@playwright/test';

import {
  assertAuthCookiesPresent,
  AuthNotConfiguredError,
  authStateFile,
  defaultAuthProvider,
  ROLES,
} from '../src/auth';
import { getConfig } from '../src/config';

/**
 * Authentication setup project. Signs in once per role and writes the storage
 * state to `.auth/<role>.json`; authenticated projects then consume it via
 * `use: { storageState }`. A single sign-in yields parent-domain cookies that
 * cover every origin, so one state authenticates LMS, Studio, and all MFEs.
 *
 * A role whose credentials are not configured (e.g. `staff`/`instructor` without
 * an admin account) is skipped, not failed, so learner coverage never depends on
 * admin credentials.
 */
for (const role of ROLES) {
  setup(`authenticate as ${role}`, async ({ browser, request }) => {
    const config = getConfig();

    let state;
    try {
      state = await defaultAuthProvider.authenticate(role, { config, browser, request });
    } catch (error) {
      if (error instanceof AuthNotConfiguredError) {
        setup.skip(true, error.message);
        return;
      }
      throw error;
    }

    assertAuthCookiesPresent(state, config);

    const file = authStateFile(role);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state, null, 2), 'utf8');
  });
}
