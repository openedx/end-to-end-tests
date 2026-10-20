/**
 * Account backend for targets that leave new accounts inactive (no
 * `SKIP_EMAIL_VALIDATION`), such as master.openedx.io: like `automatic`, but
 * `activate()` ticks the account's `is_active` box in the LMS Django admin, using
 * ADMIN_USERNAME / ADMIN_PASSWORD.
 *
 *     CUSTOM_ACCOUNT_BACKEND_PLUGINS=./plugins/admin-activate.plugin.ts
 *     ACCOUNT_BACKEND=admin-activate
 *
 * It also replaces the course-creator grant, for targets whose outgoing mail
 * hangs (the axim-sandboxes): saving a grant in the Studio admin emails the
 * user synchronously, so the save lands but the response never returns. The
 * grant here gives the admin request a short timeout, tolerates that timeout,
 * and decides success by the author's own Studio home reporting `granted`.
 *
 * Reuses the `staff` state file's admin session (signing in only when it is
 * missing or dead, then republishing it), under the admin lock, so it does not
 * evict the admin session the rest of the suite shares.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';

import { newLearnerIdentity } from '../src/api';
import {
  fetchCourseCreatorStatus,
  grantCourseCreator,
  requestCourseCreator,
} from '../src/api/course-creator';
import { loginSession } from '../src/api/login';
import { establishStudioSession } from '../src/api/studio-session';
import {
  findAdminRowPk,
  openAdminForm,
  postAdminForm,
  readAdminForm,
} from '../src/api/django-admin';
import { USER_ADMIN } from '../src/api/user-admin';
import { withAdminSession } from '../src/accounts/admin-lock';
import type {
  AccountBackend,
  AccountContext,
  ActivationContext,
  GrantCourseCreatorContext,
} from '../src/accounts/types';
import { authStateFile, isUsableStateFile, persistStorageState } from '../src/auth/storage';
import type { AppConfig } from '../src/config';

/** How long an admin request may take before it is treated as hung on mail. */
const ADMIN_REQUEST_TIMEOUT_MS = 20_000;
/** How long to wait for Studio to report the grant once it was sent. */
const GRANT_CONFIRM_TIMEOUT_MS = 30_000;

/**
 * Runs `work` on an admin session (LMS + Studio), under the admin lock: the
 * shared `staff` state first, a fresh sign-in (republished) if that fails.
 */
async function withAdmin(
  config: AppConfig,
  work: (session: APIRequestContext) => Promise<void>,
): Promise<void> {
  const admin = config.credentials.admin;
  if (admin === undefined) {
    throw new Error('admin-activate needs ADMIN_USERNAME and ADMIN_PASSWORD.');
  }
  const stateFile = authStateFile('staff');
  // The admin lock lives beside the state files; setup may run before that dir exists.
  mkdirSync(dirname(stateFile), { recursive: true });
  await withAdminSession(async () => {
    const run = async (signIn: boolean) => {
      const reuse = !signIn && isUsableStateFile(stateFile);
      const session = await playwrightRequest.newContext({
        timeout: ADMIN_REQUEST_TIMEOUT_MS,
        ...(reuse ? { storageState: stateFile } : {}),
      });
      try {
        if (!reuse) {
          await loginSession(session, config, {
            emailOrUsername: admin.username,
            password: admin.password,
          });
          await establishStudioSession(session, config);
          persistStorageState(await session.storageState(), stateFile);
        }
        await work(session);
      } finally {
        await session.dispose();
      }
    };
    try {
      await run(false);
    } catch {
      await run(true);
    }
  });
}

async function activateThroughAdmin(
  session: APIRequestContext,
  config: AppConfig,
  username: string,
): Promise<void> {
  const pk = await findAdminRowPk(session, USER_ADMIN, config.baseUrls.lms, username);
  if (pk === undefined) throw new Error(`No user row for ${username} in the LMS admin.`);
  const url = `${config.baseUrls.lms}${USER_ADMIN}/${pk}/change/`;
  const what = `Activating ${username}`;
  const { html, token } = await openAdminForm(session, url, what);
  const form = readAdminForm(html);
  form.is_active = 'on';
  await postAdminForm(session, url, token, form, what);
}

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && /timeout|ETIMEDOUT/i.test(error.message);

export default class AdminActivateBackend implements AccountBackend {
  readonly name = 'admin-activate';

  createIdentity(_context: AccountContext) {
    return Promise.resolve(newLearnerIdentity());
  }

  async activate({ config, identity }: ActivationContext): Promise<void> {
    await withAdmin(config, (session) => activateThroughAdmin(session, config, identity.username));
  }

  async grantCourseCreator({
    config,
    request,
    identity,
  }: GrantCourseCreatorContext): Promise<void> {
    await requestCourseCreator(request, config);
    // The save lands even when its response hangs on the notification email, so a
    // timeout on it is not a failure; the status check below decides.
    let sent = false;
    await withAdmin(config, async (session) => {
      if (sent) return; // A retry after a timed-out save: don't post it again.
      try {
        await grantCourseCreator(session, config, identity.username);
      } catch (error) {
        if (!isTimeout(error)) throw error;
      }
      sent = true;
    });

    const deadline = Date.now() + GRANT_CONFIRM_TIMEOUT_MS;
    let status = await fetchCourseCreatorStatus(request, config);
    while (status !== 'granted' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      status = await fetchCourseCreatorStatus(request, config);
    }
    if (status !== 'granted') {
      throw new Error(
        `Course-creator grant for ${identity.username} not confirmed: Studio reports "${status}".`,
      );
    }
  }
}
