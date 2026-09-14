import type { APIRequestContext } from '@playwright/test';

import { hasStudioSession } from '../api';
import type { AppConfig } from '../config';
import { AuthError } from './errors';
import type { Role } from './roles';
import type { StorageState } from './types';

/**
 * The JS-readable header/payload half of the login JWT
 * (`edx-jwt-cookie-header-payload`). Open edX sets it via `set_logged_in_cookies`
 * only on a successful sign-in and deletes it on logout, so it is the reliable
 * signal that a session is authenticated. Django's `sessionid` cookie is **not**:
 * anonymous visitors carry it too, and it is deliberately preserved across logout.
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

/** Roles whose stored state must also authenticate Studio when `studio` is declared. */
const STUDIO_ROLES: ReadonlySet<Role> = new Set<Role>(['author', 'staff']);

/**
 * Post-login preflight for Studio: when the target declares `studio`, the roles
 * that author (`author`, `staff`) must hold a Studio session as well as an LMS
 * one. The LMS cookies alone are not enough — Studio has its own session,
 * obtained through a silent OAuth handshake (`establishStudioSession`) — and
 * the cookie name is operator-configurable, so the check asks Studio who the
 * session is instead of looking for a cookie.
 *
 * @throws {AuthError} when Studio answers that there is no session.
 */
export async function assertStudioSessionPresent(
  request: APIRequestContext,
  config: AppConfig,
  role: Role,
): Promise<void> {
  if (!config.capabilities.has('studio') || !STUDIO_ROLES.has(role)) {
    return;
  }
  if (await hasStudioSession(request, config)) {
    return;
  }
  throw new AuthError(
    `Post-login preflight failed for "${role}": the LMS session is present but Studio ` +
      `(${config.baseUrls.studio ?? 'CMS_BASE_URL'}) reports no session. The provider must ` +
      'complete the Studio SSO handshake (see establishStudioSession) before capturing state.',
  );
}
