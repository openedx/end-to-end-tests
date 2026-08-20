/**
 * Account-creation / authentication backends (see
 * https://github.com/openedx/end-to-end-tests/issues/10).
 *
 * Installations differ in how a newly-registered account becomes able to sign in,
 * chiefly around email activation. Rather than assume one path, the suite picks a
 * backend by configuration so the same specs run against very different targets.
 *
 * - `automatic` — the Tutor/sandbox default (`SKIP_EMAIL_VALIDATION = True`): new
 *   accounts are active on creation and can sign in immediately. No activation
 *   step is needed.
 * - `manual` — for interactive sessions against a target that enforces email
 *   activation and whose config cannot be changed: the suite prompts the operator
 *   for an email to register with, then for the activation link/token to paste.
 *
 * Future backends from the spike (not yet implemented): a 3rd-party mailbox API
 * (Mailosaur/MailSlurp/MailHog) and a local-file mail reader.
 */
export const ACCOUNT_BACKENDS = ['automatic', 'manual'] as const;

export type AccountBackendName = (typeof ACCOUNT_BACKENDS)[number];

/** The backend used when `ACCOUNT_BACKEND` is not set. */
export const DEFAULT_ACCOUNT_BACKEND: AccountBackendName = 'automatic';

export function isAccountBackendName(value: string): value is AccountBackendName {
  return (ACCOUNT_BACKENDS as readonly string[]).includes(value);
}
