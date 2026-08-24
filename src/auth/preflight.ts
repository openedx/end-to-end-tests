import type { AppConfig } from '../config';
import { AuthError } from './errors';
import type { StorageState } from './types';

/**
 * The session cookie that must be present for a storage state to be
 * authenticated. JWT cookies are short-lived and transparently refreshed from
 * this session, so the session cookie is the thing that must persist.
 */
export const ESSENTIAL_SESSION_COOKIE = 'sessionid';

/**
 * Post-login preflight: verify the session cookie was actually captured.
 *
 * On HTTP targets a missing session cookie almost always means the install is
 * serving `SameSite=None`/`Secure` cookies, which browsers silently drop over
 * HTTP — so we surface that specific diagnostic rather than letting later tests
 * fail as mysterious anonymous-user errors.
 *
 * @throws {AuthError} when no session cookie is present in the storage state.
 */
export function assertAuthCookiesPresent(state: StorageState, config: AppConfig): void {
  const hasSession = state.cookies.some((cookie) => cookie.name === ESSENTIAL_SESSION_COOKIE);
  if (hasSession) {
    return;
  }

  const httpHint =
    config.scheme === 'http'
      ? ' The target is served over HTTP; it is likely serving SameSite=None/Secure ' +
        'cookies, which browsers drop over HTTP. Configure the install to serve ' +
        'SameSite=Lax, non-Secure cookies.'
      : '';

  throw new AuthError(
    `Post-login preflight failed: no "${ESSENTIAL_SESSION_COOKIE}" cookie was captured, ` +
      `so the stored session is anonymous.${httpHint}`,
  );
}
