import type { APIRequestContext, Page } from '@playwright/test';

import type { LearnerIdentity } from '../api';
import type { AppConfig } from '../config';

/** Resources a backend may use to register and activate an account. */
export interface AccountContext {
  readonly config: AppConfig;
  readonly request: APIRequestContext;
}

/** Resources plus the identity being provisioned. */
export interface IdentityContext extends AccountContext {
  readonly identity: LearnerIdentity;
}

/** Context for the registration step: the identity to create the account for. */
export type RegistrationContext = IdentityContext;

/** Context for the activation step: the identity that was just registered. */
export type ActivationContext = IdentityContext;

/** What a sign-in flow authenticates with. */
export interface AccountCredentials {
  /** An email address or a username, as the install's sign-in accepts. */
  readonly emailOrUsername: string;
  readonly password: string;
}

/**
 * Context for an API-level sign-in: no browser, so the flow authenticates
 * `request`'s cookie jar, which the caller then captures as reusable storage
 * state.
 */
export interface SignInContext extends AccountContext {
  readonly credentials: AccountCredentials;
}

/** Context for a sign-in driven through the install's UI. */
export interface UiSignInContext {
  readonly config: AppConfig;
  readonly page: Page;
  readonly credentials: AccountCredentials;
}

/** Context for a sign-out driven through the install's UI. */
export interface UiSignOutContext {
  readonly config: AppConfig;
  readonly page: Page;
  /** Username of the signed-in account, which identifies the menu trigger. */
  readonly username: string;
}

/**
 * A user-choosable account-creation and authentication backend
 * ([issue #10](https://github.com/openedx/end-to-end-tests/issues/10),
 * [issue #15](https://github.com/openedx/end-to-end-tests/issues/15)).
 *
 * A backend decides what varies by installation:
 * 1. which identity to register with (`createIdentity`) — a throwaway address for
 *    auto-activating targets, or an operator-supplied inbox for manual runs;
 * 2. how the account is created (`register`) — the LMS registration API by
 *    default, or the install's own service when the LMS is not the source of
 *    identity;
 * 3. how a freshly-registered account becomes able to sign in (`activate`) — a
 *    no-op when the target auto-activates, or fetching the activation link
 *    otherwise; and
 * 4. how an existing account signs in and out (`signIn`, `signInThroughUi`,
 *    `signOutThroughUi`) — the LMS login-session API and the authn MFE by
 *    default, or an SSO/IdP flow for installs that replace them.
 *
 * Only `createIdentity` and `activate` are required. `register` and the three
 * auth flows are optional: when a backend omits one, the built-in default runs
 * (`registerLearnerAccount` for `register`, `default-flows.ts` for the rest), so a
 * backend that only customizes account creation stays a two-method
 * implementation.
 *
 * Selecting a backend by config (`ACCOUNT_BACKEND`) keeps the specs identical
 * across targets.
 */
export interface AccountBackend {
  /** Backend name, matching the `ACCOUNT_BACKEND` value that selects it. */
  readonly name: string;

  /** Produce the identity to register with. */
  createIdentity(context: AccountContext): Promise<LearnerIdentity>;

  /** Make the just-registered account able to sign in. */
  activate(context: ActivationContext): Promise<void>;

  /**
   * Create the account for `identity` on the target.
   *
   * Implement it when accounts do not come from the LMS's own registration API —
   * an SSO/IdP install, or a companion service that owns identity and provisions
   * the LMS account itself. Such a target usually has no self-registration
   * endpoint to call at all, so the step has to be replaceable rather than
   * merely wrapped.
   *
   * Defaults to the LMS registration API (`registerLearnerAccount`).
   */
  register?(context: RegistrationContext): Promise<void>;

  /**
   * Sign in without a browser, leaving `context.request` authenticated. Used to
   * capture the reusable storage state the whole suite runs on, so an install
   * whose sign-in cannot be scripted headlessly should implement it by driving a
   * browser itself, or leave the role unconfigured.
   *
   * Defaults to the LMS login-session API (`defaultSignIn`).
   */
  signIn?(context: SignInContext): Promise<void>;

  /**
   * Sign in by driving the install's sign-in UI, leaving the browser on a
   * post-sign-in page. Specs that assert on the sign-in experience itself go
   * through here, so an SSO install exercises its own screens.
   *
   * Defaults to the authn MFE `/login` form (`defaultSignInThroughUi`).
   */
  signInThroughUi?(context: UiSignInContext): Promise<void>;

  /**
   * Sign out by driving the install's UI, clearing the session cookies.
   *
   * Defaults to the header account menu's sign-out link
   * (`defaultSignOutThroughUi`).
   */
  signOutThroughUi?(context: UiSignOutContext): Promise<void>;
}
