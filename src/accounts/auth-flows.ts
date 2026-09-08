import { defaultSignIn, defaultSignInThroughUi, defaultSignOutThroughUi } from './default-flows';
import { resolveAccountBackend } from './registry';
import type { SignInContext, UiSignInContext, UiSignOutContext } from './types';

/**
 * Backend-aware entry points for the auth flows: each resolves the configured
 * account backend and runs its override, or the stock Open edX flow when the
 * backend does not implement one.
 *
 * These are the single seam every consumer uses, so an installation with SSO
 * replaces sign-in/sign-out suite-wide through `ACCOUNT_BACKEND` alone — no spec,
 * page object, or auth-provider change.
 */

/**
 * Signs in without a browser, leaving `context.request` authenticated (the auth
 * provider captures that as reusable storage state).
 */
export async function accountSignIn(context: SignInContext): Promise<void> {
  const backend = await resolveAccountBackend(context.config);
  await (backend.signIn ? backend.signIn(context) : defaultSignIn(context));
}

/** Signs in by driving the install's sign-in UI. */
export async function accountSignInThroughUi(context: UiSignInContext): Promise<void> {
  const backend = await resolveAccountBackend(context.config);
  await (backend.signInThroughUi
    ? backend.signInThroughUi(context)
    : defaultSignInThroughUi(context));
}

/** Signs out by driving the install's UI. */
export async function accountSignOutThroughUi(context: UiSignOutContext): Promise<void> {
  const backend = await resolveAccountBackend(context.config);
  await (backend.signOutThroughUi
    ? backend.signOutThroughUi(context)
    : defaultSignOutThroughUi(context));
}
