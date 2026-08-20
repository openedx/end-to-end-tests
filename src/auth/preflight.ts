import type { AppConfig } from '../config';
import { AuthError } from './errors';
import type { StorageState } from './types';

/**
 * The Django session cookie. Present for **anonymous** visitors too (Django sets
 * it whenever the session is touched) and deliberately preserved across logout,
 * so its presence does **not** prove an authenticated session — use
 * {@link AUTH_JWT_COOKIE} for that.
 */
export const ESSENTIAL_SESSION_COOKIE = 'sessionid';

/**
 * The JS-readable header/payload half of the login JWT
 * (`edx-jwt-cookie-header-payload`). Open edX sets it via `set_logged_in_cookies`
 * only on a successful sign-in and deletes it on logout, so it is the reliable
 * signal that a session is authenticated (unlike {@link ESSENTIAL_SESSION_COOKIE},
 * which anonymous users also carry).
 */
export const AUTH_JWT_COOKIE = 'edx-jwt-cookie-header-payload';

/** A cookie shape both Playwright's `StorageState` and `context.cookies()` satisfy. */
type NamedCookie = { readonly name: string };

/**
 * Whether a set of cookies represents an authenticated session, judged by the
 * presence of the login JWT cookie. Use this rather than checking for
 * `sessionid`, which is present for anonymous users and survives logout.
 */
export function hasAuthenticatedSession(cookies: ReadonlyArray<NamedCookie>): boolean {
  return cookies.some((cookie) => cookie.name === AUTH_JWT_COOKIE);
}

/**
 * Post-login preflight: verify the login JWT cookie was actually captured, i.e.
 * the stored state is genuinely authenticated rather than an anonymous session.
 *
 * On HTTP targets a missing login cookie almost always means the install is
 * serving `SameSite=None`/`Secure` cookies, which browsers silently drop over
 * HTTP — so we surface that specific diagnostic rather than letting later tests
 * fail as mysterious anonymous-user errors.
 *
 * @throws {AuthError} when no login JWT cookie is present in the storage state.
 */
export function assertAuthCookiesPresent(state: StorageState, config: AppConfig): void {
  if (hasAuthenticatedSession(state.cookies)) {
    return;
  }

  const httpHint =
    config.scheme === 'http'
      ? ' The target is served over HTTP; it is likely serving SameSite=None/Secure ' +
        'cookies, which browsers drop over HTTP. Configure the install to serve ' +
        'SameSite=Lax, non-Secure cookies.'
      : '';

  throw new AuthError(
    `Post-login preflight failed: no "${AUTH_JWT_COOKIE}" cookie was captured, ` +
      `so the stored session is anonymous rather than authenticated.${httpHint}`,
  );
}
