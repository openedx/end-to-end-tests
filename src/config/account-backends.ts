/**
 * Account-creation / authentication backends (see
 * https://github.com/openedx/end-to-end-tests/issues/10).
 *
 * Installations differ in how a newly-registered account becomes able to sign in,
 * chiefly around email activation. Rather than assume one path, the suite picks a
 * backend by configuration so the same specs run against very different targets.
 *
 * - `automatic` — the default. Registers a throwaway identity and reuses the
 *   session registration itself creates ("Automatic login on"), so no activation
 *   step is needed even when the install leaves accounts inactive. Only the
 *   login/logout specs, which sign in separately, need a login-able account.
 * - `manual` — for interactive sessions against a target that enforces email
 *   activation and whose config cannot be changed: the suite prompts the operator
 *   for an email to register with, then for the activation link/token to paste.
 *
 * These are the built-ins only. An installation can add its own backend without
 * forking the suite by listing a plugin module in
 * `CUSTOM_ACCOUNT_BACKEND_PLUGINS` and naming it in `ACCOUNT_BACKEND`; those
 * names are unknown here, so `ACCOUNT_BACKEND` is only checked against this list
 * when no plugins are configured (see `load.ts`) — the account registry validates
 * the rest.
 */
export const ACCOUNT_BACKENDS = ['automatic', 'manual'] as const;

export type AccountBackendName = (typeof ACCOUNT_BACKENDS)[number];

/** The backend used when `ACCOUNT_BACKEND` is not set. */
export const DEFAULT_ACCOUNT_BACKEND: AccountBackendName = 'automatic';

export function isAccountBackendName(value: string): value is AccountBackendName {
  return (ACCOUNT_BACKENDS as readonly string[]).includes(value);
}
