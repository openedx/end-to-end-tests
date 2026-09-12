import type { APIRequestContext } from '@playwright/test';

import {
  establishStudioSession,
  fetchCourseCreatorStatus,
  loginSession,
  registerLearnerAccount,
  type LearnerIdentity,
} from '../api';
import { hasAuthenticatedSession } from '../auth/preflight';
import type { AppConfig } from '../config';
import type { AccountCredentials } from './types';
import { accountGrantCourseCreator, accountSignIn, accountSignInStudio } from './auth-flows';
import { resolveAccountBackend } from './registry';

/**
 * Provisions a learner account that can sign in, using the configured backend:
 * create an identity, register it, then activate it. Returns the identity so the
 * caller can sign in (via the UI or the login API).
 *
 * Each of the three steps is the backend's to replace. Registration goes through
 * the LMS API unless the backend implements `register`, which an install whose
 * accounts originate elsewhere must do — it has no LMS self-registration to call.
 *
 * This is the single seam every consumer uses to obtain a usable account, so
 * swapping `ACCOUNT_BACKEND` changes the whole suite's account-creation behaviour
 * without touching the auth provider or the specs.
 */
export async function provisionLearnerAccount(
  request: APIRequestContext,
  config: AppConfig,
): Promise<LearnerIdentity> {
  const backend = await resolveAccountBackend(config);
  const identity = await backend.createIdentity({ config, request });
  await (backend.register
    ? backend.register({ config, request, identity })
    : registerLearnerAccount(request, config, identity));
  await backend.activate({ config, request, identity });
  return identity;
}

/**
 * Provisions a learner **and leaves `request` holding their session** — the one
 * way the suite obtains a usable learner context, for the auth provider's
 * storage state and for specs that need an account of their own.
 *
 * On a stock install registration authenticates the request context itself (the
 * platform calls `set_logged_in_cookies` on success), so there is deliberately
 * **no sign-in in that case**. Signing in afterwards is not merely redundant, it
 * fails: the LMS rejects a `login_session` POST made on a context that already
 * carries a session, and because Django's 400 handler replaces the view's JSON
 * the caller gets a bare HTML "Bad Request" with no error code — which is exactly
 * as confusing as it sounds. A fresh context signing in with the same credentials
 * succeeds, so the credentials are never what is wrong.
 *
 * A backend whose accounts originate elsewhere (a custom `register`, an external
 * IdP) separates account creation from session establishment and leaves the jar
 * anonymous. Only then do we sign in — through the backend's `signIn` override
 * or the stock login-session API — so the stock path makes no extra call and
 * never depends on the account being able to log in.
 */
export async function provisionLearnerSession(
  request: APIRequestContext,
  config: AppConfig,
): Promise<LearnerIdentity> {
  const identity = await provisionLearnerAccount(request, config);

  const { cookies } = await request.storageState();
  if (!hasAuthenticatedSession(cookies)) {
    await accountSignIn({
      config,
      request,
      credentials: { emailOrUsername: identity.email, password: identity.password },
    });
  }

  return identity;
}

/**
 * Provisions an **author** — a fresh account that can create courses in Studio —
 * and leaves `request` holding a session valid on both the LMS and Studio.
 *
 * 1. {@link provisionLearnerSession}: register (and activate) the account; the
 *    registration session is the LMS half.
 * 2. `accountSignInStudio`: the backend's `signInStudio`, or by default the
 *    silent OAuth handshake that gives Studio its own session
 *    (`src/api/studio-session.ts`). Without it every Studio URL is a redirect to
 *    `/login/` and every Studio API a 401.
 * 3. If Studio does not already report the account as `granted` (it does on an
 *    install with `ENABLE_CREATOR_GROUP` off), run the backend's
 *    `grantCourseCreator` — by default TC-00310's request-then-admin-grant.
 *
 * The result is the `author` role's storage state, and what a spec that needs an
 * author of its own (`courseAuthor`) gets. `options.adminStorageState` is handed
 * to the grant so a caller that already holds an admin session (a worker, after
 * `setup`) does not cost another admin sign-in.
 */
export async function provisionAuthorSession(
  request: APIRequestContext,
  config: AppConfig,
  options: { readonly adminStorageState?: string } = {},
): Promise<LearnerIdentity> {
  const identity = await provisionLearnerSession(request, config);
  await accountSignInStudio({
    config,
    request,
    credentials: { emailOrUsername: identity.email, password: identity.password },
  });

  const status = await fetchCourseCreatorStatus(request, config);
  if (status !== 'granted') {
    await accountGrantCourseCreator({ config, request, identity, ...options });
  }
  return identity;
}

/**
 * Re-authenticates `request` as the author from scratch — a fresh LMS sign-in
 * followed by the Studio SSO handshake — so it again holds sessions the LMS and
 * Studio both accept.
 *
 * This is the recovery the memory-constrained CI target needs: it evicts Django
 * sessions from its shared cache spuriously, at any time, with no logout event.
 * When that happens the silent SSO handshake alone cannot recover — it needs a
 * live LMS session to trade for a Studio one, and that is gone too — so only a
 * credential sign-in restores the context. (A sign-in on a context still holding
 * the dead session cookies is accepted; the platform does not reject it the way it
 * rejects one made on a *live* session.)
 *
 * Wired into {@link ensureCourse} as its `onSessionExpired` hook and used to
 * confirm a freshly provisioned author can actually author.
 */
export async function reauthenticateStudioAuthor(
  request: APIRequestContext,
  config: AppConfig,
  credentials: AccountCredentials,
): Promise<void> {
  await loginSession(request, config, credentials);
  await establishStudioSession(request, config);
}
