import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { studioOrigin } from './studio-origin';

/**
 * Studio's sign-in entry point. Studio keeps its own Django session and obtains
 * it through the `edx-oauth2` social-auth backend (`client_id=cms-sso`): this
 * URL redirects to the LMS `/oauth2/authorize`, which — given a valid LMS
 * session — redirects straight back to `/complete/edx-oauth2/` on Studio. The
 * whole round trip is silent: no credentials, no UI.
 */
export const STUDIO_LOGIN_PATH = '/login/';

/** Who the Studio session belongs to; `401` when there is no Studio session. */
export const STUDIO_ME_PATH = '/api/user/v1/me';

/**
 * Establishes a Studio session on a request context that already holds an LMS
 * session, by following {@link STUDIO_LOGIN_PATH} through the OAuth handshake.
 *
 * Measured (Epic 7 discovery): the parent-domain LMS cookies alone get a `302`
 * to `/login/` from every Studio URL and a `401` from every Studio API. After
 * this one `GET`, the jar also holds Studio's own session cookie
 * (`studio_session_id` on a default install) and a Studio-scoped `csrftoken`,
 * and the same requests succeed. Without an LMS session the handshake ends at
 * the authn MFE's login page instead, which is what the check below catches.
 *
 * The cookie name is operator-configurable, so success is judged by asking
 * Studio who the session is, not by looking for a cookie.
 *
 * @returns the username Studio reports for the session.
 * @throws {ApiError} when Studio still has no session afterwards — the LMS
 *   session was missing or invalid, or the OAuth client is misconfigured.
 */
export async function establishStudioSession(
  request: APIRequestContext,
  config: AppConfig,
): Promise<string> {
  const origin = studioOrigin(config);
  const loginUrl = `${origin}${STUDIO_LOGIN_PATH}`;
  const handshake = await request.get(loginUrl);
  const landedOn = handshake.url();

  const me = await request.get(`${origin}${STUDIO_ME_PATH}`);
  if (me.ok()) {
    const body = (await me.json()) as { username?: string };
    if (typeof body.username === 'string') {
      return body.username;
    }
  }

  throw new ApiError(
    `Studio has no session after the SSO handshake (${loginUrl} landed on ${landedOn}, ` +
      `then ${STUDIO_ME_PATH} answered HTTP ${me.status()}). The request context must hold ` +
      'a valid LMS session first; if it does, check that the Studio OAuth client ' +
      '(cms-sso) is configured on the target.',
    { status: me.status(), url: `${origin}${STUDIO_ME_PATH}`, body: await me.text() },
  );
}

/**
 * Whether the request context already has a Studio session. Cheap probe for
 * callers that want to skip the handshake when it has been done.
 */
export async function hasStudioSession(
  request: APIRequestContext,
  config: AppConfig,
): Promise<boolean> {
  const response = await request.get(`${studioOrigin(config)}${STUDIO_ME_PATH}`);
  return response.ok();
}
