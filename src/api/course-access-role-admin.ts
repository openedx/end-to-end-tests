import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import {
  adminCsrfToken,
  assertAdminPage,
  countAdminResultRows,
  findAdminRowPk,
  openAdminForm,
  postAdminForm,
} from './django-admin';

/** The legacy role model's admin, the only way to grant an **organization-wide** role. */
export const COURSE_ACCESS_ROLE_ADMIN = '/admin/student/courseaccessrole';

/**
 * The legacy course roles, as `CourseAccessRole.role` stores them.
 *
 * The instructor API's own vocabulary differs for one of them — it calls the
 * beta role `beta` where the model calls it `beta_testers` — so a spec that
 * grants per course through the API and organization-wide through the admin
 * uses both spellings deliberately.
 */
export const LEGACY_COURSE_ROLES = [
  'instructor',
  'staff',
  'limited_staff',
  'data_researcher',
  'beta_testers',
] as const;

export type LegacyCourseRole = (typeof LEGACY_COURSE_ROLES)[number];

/**
 * Grants a legacy role through the LMS Django admin, and returns the row's
 * primary key so a test can take it away again.
 *
 * Leaving `courseKey` out is the point of this client: a row with a blank course
 * id is an **organization-level** role, which no API exposes and which the BTR
 * plan asks for by this exact route ("Course ID should be in blank to assign Org
 * Level Roles"). Per-course roles have an API — `grantCourseTeamRole` — and
 * should use it.
 *
 * `adminSession` must hold a superuser's LMS Django session (the `adminLms`
 * fixture's runner).
 */
export async function grantLegacyRole(
  adminSession: APIRequestContext,
  config: AppConfig,
  grant: {
    readonly email: string;
    readonly org: string;
    readonly role: LegacyCourseRole;
    readonly courseKey?: string;
  },
): Promise<string> {
  const url = `${config.baseUrls.lms}${COURSE_ACCESS_ROLE_ADMIN}/add/`;
  const { token } = await openAdminForm(
    adminSession,
    url,
    `Granting ${grant.role} in ${grant.org}`,
  );
  await postAdminForm(
    adminSession,
    url,
    token,
    {
      email: grant.email,
      org: grant.org,
      course_id: grant.courseKey ?? '',
      role: grant.role,
    },
    `Granting ${grant.email} the ${grant.role} role in ${grant.org}`,
  );
  const pk = await findAdminRowPk(
    adminSession,
    COURSE_ACCESS_ROLE_ADMIN,
    config.baseUrls.lms,
    grant.email,
  );
  if (pk === undefined) {
    throw new ApiError(
      `The ${grant.role} row for ${grant.email} in ${grant.org} saved but could not be found ` +
        'again in the change list.',
      { status: 200, url, body: '' },
    );
  }
  return pk;
}

/** Removes a role row granted by {@link grantLegacyRole}, by primary key. */
export async function revokeLegacyRole(
  adminSession: APIRequestContext,
  config: AppConfig,
  pk: string,
): Promise<void> {
  const url = `${config.baseUrls.lms}${COURSE_ACCESS_ROLE_ADMIN}/${pk}/delete/`;
  const html = await (await adminSession.get(url)).text();
  const token = adminCsrfToken(html);
  if (token === undefined) {
    throw new ApiError('The course access role delete confirmation did not render.', {
      status: 200,
      url,
      body: html.slice(0, 300),
    });
  }
  const response = await adminSession.post(url, {
    form: { csrfmiddlewaretoken: token, post: 'yes' },
    headers: { Referer: url },
    maxRedirects: 0,
  });
  if (response.status() < 300 || response.status() >= 400) {
    throw new ApiError(`Removing course access role ${pk} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: (await response.text()).slice(0, 300),
    });
  }
}

/**
 * How many legacy role rows the admin holds for one course (or for any other
 * term its search covers) — the reading behind "the legacy role should have been
 * removed" after a migration.
 *
 * The change list's own search box does the filtering, so nothing here depends
 * on a rendered label, and the count is the result table's rows minus its
 * header.
 */
export async function countCourseAccessRoles(
  adminSession: APIRequestContext,
  config: AppConfig,
  search: string,
): Promise<number> {
  const url = `${config.baseUrls.lms}${COURSE_ACCESS_ROLE_ADMIN}/?q=${encodeURIComponent(search)}`;
  const response = await adminSession.get(url);
  const html = await response.text();
  assertAdminPage(html, response.status(), url, `Counting the legacy roles matching ${search}`);
  return countAdminResultRows(html);
}
