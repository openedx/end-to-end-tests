import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';

/** LMS account-activation route: the target of the link in the activation email. */
export const ACTIVATE_PATH = '/activate';

/**
 * Extracts the activation key from whatever the operator pastes — either the full
 * activation link (`http://lms.example.com/activate/<key>?next=...`) or the bare
 * key. Query strings and trailing slashes are stripped.
 *
 * @throws {Error} when no key can be found in the input.
 */
export function extractActivationKey(pastedLinkOrKey: string): string {
  const trimmed = pastedLinkOrKey.trim();
  const marker = `${ACTIVATE_PATH}/`;
  const fromLink = trimmed.includes(marker)
    ? trimmed.slice(trimmed.indexOf(marker) + marker.length)
    : trimmed;
  const key = fromLink.split(/[?#/]/)[0]?.trim() ?? '';
  if (key === '') {
    throw new Error(`Could not find an activation key in "${pastedLinkOrKey}".`);
  }
  return key;
}

/**
 * Activates an account by visiting its activation link, exactly as a learner
 * would by clicking the email — `GET {LMS}/activate/{key}`. After this the
 * account `is_active` and can sign in via the login-session API.
 *
 * @throws {ApiError} when the activation request fails.
 */
export async function activateAccount(
  request: APIRequestContext,
  config: AppConfig,
  keyOrLink: string,
): Promise<void> {
  const key = extractActivationKey(keyOrLink);
  const url = `${config.baseUrls.lms}${ACTIVATE_PATH}/${key}`;
  const response = await request.get(url);

  if (!response.ok()) {
    throw new ApiError(`Account activation failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
}
