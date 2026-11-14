import type { APIRequestContext } from '@playwright/test';

import { hasStudioSession } from '../api';
import type { AppConfig } from '../config';
import { AuthError } from './errors';
import type { Role } from './roles';
import type { StorageState } from './types';

/** A cookie shape both Playwright's `StorageState` and `context.cookies()` satisfy. */
type NamedCookie = { readonly name: string };

/** A cookie shape carrying Playwright's expiry (`-1` for a session cookie). */
type ExpiringCookie = NamedCookie & { readonly expires?: number };

/**
 * Whether a set of cookies represents an authenticated session, judged by the
 * presence of the login JWT's header/payload cookie, `cookieName`: the install's
 * `config.jwtCookieHeaderPayload`, since an install can rename it. Open edX sets
 * it via `set_logged_in_cookies` only on a successful sign-in and deletes it on
 * logout, so it is the reliable signal. Django's `sessionid` cookie is **not**:
 * anonymous visitors carry it too, and it is deliberately preserved across logout.
 */
export function hasAuthenticatedSession(
  cookies: ReadonlyArray<NamedCookie>,
  cookieName: string,
): boolean {
  return cookies.some((cookie) => cookie.name === cookieName);
}

/**
 * How long before the login JWT's expiry a stored session is already treated as
 * needing a refresh. The JWT cookie is a ~1 h clock (`JWT_IN_COOKIE_EXPIRATION`);
 * a request context built from a captured state cannot refresh it (no
 * refresh-token cookie), and once it lapses the context is un-healable in place
 * because `APIRequestContext` exposes no cookie mutation. Refreshing a little
 * early keeps a context that a test picks up just before the boundary from
 * lapsing mid-flight.
 */
export const JWT_REFRESH_MARGIN_MS = 5 * 60_000;

/**
 * Whether the login JWT in a captured storage state is still valid for at least
 * {@link JWT_REFRESH_MARGIN_MS}. `false` when the cookie is absent (an anonymous
 * or logged-out state) or within the margin of its expiry.
 *
 * A JWT stored as a **session cookie** (`expires` `-1`/absent) has no readable
 * clock to pre-empt, so it counts as fresh: a decayed session behind it is
 * recovered by the SSO handshake (`establishStudioSession`), which the live JWT
 * still authorizes — the case this check exists to avoid is the JWT *itself*
 * having lapsed, leaving nothing to authorize that handshake.
 *
 * Callers use it to refresh a worker author's state file **before** the per-test
 * `request`/`page` contexts load it, spending a login only when the JWT is
 * genuinely stale (about once an hour per worker) rather than on every test.
 *
 * @param cookieName the login JWT cookie's name, `config.jwtCookieHeaderPayload`.
 */
export function storedJwtIsFresh(
  cookies: ReadonlyArray<ExpiringCookie>,
  cookieName: string,
  now: number = Date.now(),
): boolean {
  const jwt = cookies.find((cookie) => cookie.name === cookieName);
  if (jwt === undefined) return false;
  if (jwt.expires === undefined || jwt.expires < 0) return true;
  return jwt.expires * 1000 - now > JWT_REFRESH_MARGIN_MS;
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
  if (hasAuthenticatedSession(state.cookies, config.jwtCookieHeaderPayload)) {
    return;
  }

  const httpHint =
    config.scheme === 'http'
      ? ' The target is served over HTTP; it is likely serving SameSite=None/Secure ' +
        'cookies, which browsers drop over HTTP. Configure the install to serve ' +
        'SameSite=Lax, non-Secure cookies.'
      : '';

  throw new AuthError(
    `Post-login preflight failed: no "${config.jwtCookieHeaderPayload}" cookie was ` +
      `captured, so the stored session is anonymous rather than authenticated. An ` +
      `install that renames the login JWT cookie names it in ` +
      `JWT_AUTH_COOKIE_HEADER_PAYLOAD.${httpHint}`,
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
