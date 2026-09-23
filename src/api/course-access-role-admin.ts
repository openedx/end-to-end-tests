import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import {
  adminCsrfToken,
  assertAdminPage,
  decodeAdminEntities,
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

/** One row of the legacy role table, as its change list renders it. */
export interface CourseAccessRoleRow {
  readonly username: string;
  readonly org: string;
  /**
   * Empty for an organization-wide row — the blank course id the plan's own
   * instructions call for. (The admin renders an empty value as `-`; this is
   * normalized back to an empty string so a caller compares against what it
   * wrote.)
   */
  readonly courseKey: string;
  readonly role: string;
}

/**
 * The legacy role rows matching a search term — the reading behind "the legacy
 * role should have been removed" and, after a rollback, "the final state must
 * match the original baseline".
 *
 * The change list's own search box does the filtering and Django's `field-<name>`
 * cells carry the model's **raw** values (`beta_testers`, not a label), so a
 * before-and-after comparison is exact and nothing here depends on displayed
 * copy.
 */
export async function listCourseAccessRoles(
  adminSession: APIRequestContext,
  config: AppConfig,
  search: string,
): Promise<CourseAccessRoleRow[]> {
  const url = `${config.baseUrls.lms}${COURSE_ACCESS_ROLE_ADMIN}/?q=${encodeURIComponent(search)}`;
  const response = await adminSession.get(url);
  const html = await response.text();
  assertAdminPage(html, response.status(), url, `Listing the legacy roles matching ${search}`);

  const table = /id="result_list"[\s\S]*?<\/table>/.exec(html)?.[0];
  if (table === undefined) return [];
  const cell = (row: string, field: string): string => {
    const match = new RegExp(
      `<t[dh][^>]*class="[^"]*field-${field}[^"]*"[^>]*>([\\s\\S]*?)</t[dh]>`,
    ).exec(row);
    const text =
      match === null ? '' : decodeAdminEntities((match[1] ?? '').replace(/<[^>]+>/g, '')).trim();
    // Django renders an empty field as its "empty value display" (`-`), which is
    // what an organization-wide row's blank course id looks like. Normalized back
    // so a caller compares against the value it wrote.
    return text === '-' ? '' : text;
  };
  return table
    .split('<tr')
    .slice(1)
    .filter((row) => row.includes('field-role'))
    .map((row) => ({
      username: cell(row, 'user'),
      org: cell(row, 'org'),
      courseKey: cell(row, 'course_id'),
      role: cell(row, 'role'),
    }));
}

/** How many legacy role rows match a search term. */
export async function countCourseAccessRoles(
  adminSession: APIRequestContext,
  config: AppConfig,
  search: string,
): Promise<number> {
  return (await listCourseAccessRoles(adminSession, config, search)).length;
}
