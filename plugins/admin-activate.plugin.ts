/**
 * Account backend for targets that leave new accounts inactive (no
 * `SKIP_EMAIL_VALIDATION`), such as master.openedx.io: like `automatic`, but
 * `activate()` ticks the account's `is_active` box in the LMS Django admin, using
 * ADMIN_USERNAME / ADMIN_PASSWORD.
 *
 *     CUSTOM_ACCOUNT_BACKEND_PLUGINS=./plugins/admin-activate.plugin.ts
 *     ACCOUNT_BACKEND=admin-activate
 *
 * Reuses the `staff` state file's admin session (signing in only when it is
 * missing or dead, then republishing it), under the admin lock, so it does not
 * evict the admin session the rest of the suite shares.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';

import { newLearnerIdentity } from '../src/api';
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
import type { AccountBackend, AccountContext, ActivationContext } from '../src/accounts/types';
import { authStateFile, isUsableStateFile, persistStorageState } from '../src/auth/storage';
import type { AppConfig } from '../src/config';

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

export default class AdminActivateBackend implements AccountBackend {
  readonly name = 'admin-activate';

  createIdentity(_context: AccountContext) {
    return Promise.resolve(newLearnerIdentity());
  }

  async activate({ config, identity }: ActivationContext): Promise<void> {
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
        const session = await playwrightRequest.newContext(
          reuse ? { storageState: stateFile } : {},
        );
        try {
          if (!reuse) {
            await loginSession(session, config, {
              emailOrUsername: admin.username,
              password: admin.password,
            });
            await establishStudioSession(session, config);
            persistStorageState(await session.storageState(), stateFile);
          }
          await activateThroughAdmin(session, config, identity.username);
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
}
