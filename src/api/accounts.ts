import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { lmsGet, lmsWrite } from './lms-json';

/**
 * The user accounts and preferences APIs
 * (`openedx/core/djangoapps/user_api`) — what the profile and Account Settings
 * MFEs save to, and so the oracle of every profile, privacy and language case.
 *
 * Two platform behaviours shape how specs use these (both measured):
 *
 * - **A profile is private until the account has an adult year of birth.**
 *   With no `year_of_birth` the platform assumes parental consent is required
 *   (`PARENTAL_CONSENT_AGE_LIMIT`, 13) and forces `account_privacy` to
 *   `private`, whatever the preference says. Another user then sees only
 *   `username`, `profile_image` and `account_privacy`.
 * - **Visibility is decided by the reader's view.** A privacy setting is proven
 *   by what a *second* user's `fetchAccount` returns, never by the owner's own
 *   reading, which always shows everything.
 *
 * Account writes are `application/merge-patch+json`. `social_links` merge by
 * platform (an empty `social_link` removes one), and the platform keys are
 * `facebook`, `x` and `linkedin` — there is no `twitter`.
 */
const accountsUrl = (config: AppConfig, username: string) =>
  `${config.baseUrls.lms}/api/user/v1/accounts/${username}`;
const preferencesUrl = (config: AppConfig, username: string) =>
  `${config.baseUrls.lms}/api/user/v1/preferences/${username}`;

export type SocialPlatform = 'facebook' | 'x' | 'linkedin';

export interface SocialLink {
  readonly platform: SocialPlatform;
  readonly social_link: string;
}

/** Level-of-education codes (`student/models/user.py`). */
export type EducationLevel = 'p' | 'm' | 'b' | 'a' | 'hs' | 'jhs' | 'el' | 'none' | 'other';

export interface Account {
  readonly username: string;
  readonly account_privacy?: string;
  readonly name?: string;
  readonly bio?: string | null;
  readonly country?: string | null;
  readonly level_of_education?: EducationLevel | null;
  readonly language_proficiencies?: readonly { readonly code: string }[];
  readonly social_links?: readonly SocialLink[];
  readonly year_of_birth?: number | null;
  readonly requires_parental_consent?: boolean;
  readonly course_certificates?: unknown;
}

/** The writable profile fields a spec sets. */
export interface AccountPatch {
  readonly bio?: string;
  readonly country?: string | null;
  readonly level_of_education?: EducationLevel | null;
  readonly language_proficiencies?: readonly { readonly code: string }[];
  readonly social_links?: readonly SocialLink[];
  readonly year_of_birth?: number | null;
}

/**
 * Reads an account as the caller sees it: in full for the owner, filtered by
 * the owner's privacy for anyone else.
 */
export async function fetchAccount(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
): Promise<Account> {
  return lmsGet(request, accountsUrl(config, username), `Reading the account of "${username}"`);
}

/**
 * Updates the caller's own account. Clear the bio with `""`: `bio: null` is
 * answered 500 by the platform.
 */
export async function updateAccount(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
  patch: AccountPatch,
): Promise<Account> {
  return lmsWrite(request, config, 'PATCH', accountsUrl(config, username), 'Updating an account', {
    data: patch,
    mergePatch: true,
  });
}

/** The caller's preferences, e.g. `pref-lang`, `account_privacy`, `visibility.bio`. */
export type Preferences = Readonly<Record<string, string>>;

export async function fetchPreferences(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
): Promise<Preferences> {
  return lmsGet(
    request,
    preferencesUrl(config, username),
    `Reading the preferences of "${username}"`,
  );
}

/**
 * Sets (or, with `null`, deletes) preferences. Keys holding `-` or `.`
 * (`pref-lang`, `visibility.*`) can only be written here, on the collection: the
 * per-key route's URL pattern does not accept them.
 */
export async function updatePreferences(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
  patch: Readonly<Record<string, string | null>>,
): Promise<void> {
  await lmsWrite<void>(
    request,
    config,
    'PATCH',
    preferencesUrl(config, username),
    'Updating preferences',
    { data: patch, mergePatch: true },
  );
}

/** The adult year of birth the suite sets so a profile can be shared at all. */
export const ADULT_YEAR_OF_BIRTH = 1990;

/** One of a learner's certificates, as their profile lists them. */
export interface LearnerCertificate {
  readonly course_id: string;
  readonly status: string;
  readonly download_url: string | null;
}

/**
 * A learner's certificates (`/api/certificates/v0/certificates/<username>/`).
 * The owner and staff always read them; anyone else only while the owner's
 * `visibility.course_certificates` is `all_users` — a 403 otherwise, which
 * resolves to `{ forbidden: true }`.
 */
export async function listLearnerCertificates(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
): Promise<readonly LearnerCertificate[] | { readonly forbidden: true }> {
  const url = `${config.baseUrls.lms}/api/certificates/v0/certificates/${username}/`;
  const response = await request.get(url);
  if (response.status() === 403) return { forbidden: true };
  return lmsGet<readonly LearnerCertificate[]>(
    request,
    url,
    `Listing the certificates of "${username}"`,
  );
}
