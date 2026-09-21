import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';

/**
 * The **openedx-authz** API (`/api/authz/v1/`) behind the Roles and Permissions
 * admin console: role definitions, who holds which role in a scope, assignment
 * and revocation, a caller's own permission check, and the state of the
 * `authz.enable_course_authoring` waffle flag.
 *
 * Measured on Tutor `main` (openedx-authz 1.23.0, 2026-09-17, Epic 12 plan §1.2
 * and §1.8); `release/verawood` pins 1.21.0, which answers the same routes with
 * four fewer course permissions and an unscoped `orgs/` list — no spec hard-codes
 * a permission list, so both are served by this one client.
 *
 * Three facts shape it:
 *
 * - **Both origins serve it, and the JWT is enough.** The console itself calls
 *   the LMS, so these reads ride the caller's own `request` with no Studio
 *   handshake and no throwaway `loginSession`.
 * - **A scope key must be URL-encoded.** A course key's `+` decodes to a space
 *   otherwise and the server answers `400 Invalid external_key format`.
 * - **Writes answer 207.** Assign and revoke report per-user outcomes in
 *   `completed[]` / `errors[]` rather than failing the request, so a caller says
 *   whether a partial result is a failure ({@link AuthzWriteOptions}).
 */
export const AUTHZ_BASE = '/api/authz/v1';

/** Course-scope roles, as `GET roles/?scope=<course key>` lists them. */
export const COURSE_ROLES = [
  'course_admin',
  'course_staff',
  'course_editor',
  'course_auditor',
  'course_limited_staff',
  'course_data_researcher',
  'course_beta_tester',
] as const;
export type CourseRole = (typeof COURSE_ROLES)[number];

/** Library-scope roles, as `GET roles/?scope=<library key>` lists them. */
export const LIBRARY_ROLES = [
  'library_admin',
  'library_author',
  'library_contributor',
  'library_user',
] as const;
export type LibraryRole = (typeof LIBRARY_ROLES)[number];

/**
 * Platform-level roles the console renders but cannot change — they are managed
 * in Django admin. Note that openedx-authz 1.23 does **not** expose assignment
 * rows for them (plan headline decision 6), so they may never appear in a list.
 */
export const PLATFORM_ROLES = ['django.superuser', 'django.globalstaff'] as const;

/**
 * How the platform maps a legacy course-team role to an authz role when a course
 * is migrated (`LEGACY_COURSE_ROLE_EQUIVALENCES`, measured end to end in
 * §1.8.5). A legacy role outside this map keeps using the legacy path even with
 * the flag on.
 */
export const LEGACY_ROLE_EQUIVALENTS: Readonly<Record<string, CourseRole>> = {
  instructor: 'course_admin',
  staff: 'course_staff',
  limited_staff: 'course_limited_staff',
  data_researcher: 'course_data_researcher',
  beta_testers: 'course_beta_tester',
};

/**
 * A scope key as the API wants it in a query string: percent-encoded, but with
 * `:` left alone the way the console sends it. Without this a course key's `+`
 * arrives as a space and the request is rejected.
 */
export const authzScopeKey = (key: string): string => encodeURIComponent(key).replace(/%3A/g, ':');

interface AuthzPage<T> {
  readonly count: number;
  readonly next: string | null;
  readonly previous: string | null;
  readonly results: readonly T[];
}

async function authzGet<T>(
  request: APIRequestContext,
  config: AppConfig,
  path: string,
  what: string,
): Promise<T> {
  const url = `${config.baseUrls.lms}${AUTHZ_BASE}/${path}`;
  const response = await request.get(url);
  if (!response.ok()) {
    throw new ApiError(`${what} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: (await response.text()).slice(0, 500),
    });
  }
  return (await response.json()) as T;
}

/**
 * Builds a query string. Values are passed **raw**: `URLSearchParams` encodes
 * them, and handing it an already-encoded scope key would double-encode the `+`
 * of a course key into `%252B`, which matches nothing.
 */
function queryString(params: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered === '' ? '' : `?${rendered}`;
}

/** Paging and ordering shared by the console's list endpoints. */
export interface AuthzListQuery {
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: string;
  readonly order?: 'asc' | 'desc';
}

const pagingParams = (query: AuthzListQuery): Record<string, string | number | undefined> => ({
  search: query.search,
  page: query.page,
  page_size: query.pageSize,
  sort_by: query.sortBy,
  order: query.order,
});

// --- role definitions -----------------------------------------------------------------------

/** A role and the permissions it carries, for one scope type. */
export interface AuthzRoleDefinition {
  readonly role: string;
  readonly permissions: readonly string[];
  readonly userCount: number;
}

interface RawRoleDefinition {
  readonly role: string;
  readonly permissions?: readonly string[];
  readonly user_count?: number;
}

/**
 * The roles available in a scope, with their permission lists — the data behind
 * the console's permission matrix, and the reason no spec hard-codes a
 * permission set: releases differ (1.23 added four `courses.view_*`).
 *
 * `scope` is required by the API; a course key or a library key decides which
 * vocabulary comes back.
 */
export async function listRoles(
  request: APIRequestContext,
  config: AppConfig,
  scope: string,
): Promise<readonly AuthzRoleDefinition[]> {
  const page = await authzGet<AuthzPage<RawRoleDefinition>>(
    request,
    config,
    `roles/?scope=${authzScopeKey(scope)}&page_size=100`,
    `Listing authz roles in ${scope}`,
  );
  return page.results.map((raw) => ({
    role: raw.role,
    permissions: raw.permissions ?? [],
    userCount: raw.user_count ?? 0,
  }));
}

// --- who holds what -------------------------------------------------------------------------

/** A user and the roles they hold in one scope, as `roles/users/?scope=` lists them. */
export interface AuthzScopeMember {
  readonly username: string;
  readonly email: string;
  readonly fullName: string;
  readonly roles: readonly string[];
}

interface RawScopeMember {
  readonly username?: string;
  readonly email?: string;
  readonly full_name?: string;
  readonly roles?: readonly string[];
}

const toMember = (raw: RawScopeMember): AuthzScopeMember => ({
  username: raw.username ?? '',
  email: raw.email ?? '',
  fullName: raw.full_name ?? '',
  roles: raw.roles ?? [],
});

/**
 * Who holds a role in one scope — the course/library team as authz sees it, and
 * the oracle for the legacy ↔ authz synchronisation cases.
 *
 * A holder of an **org-level** role is not listed here: that assignment lives on
 * a glob scope (`course-v1:<ORG>+*`) and shows up in
 * {@link listUserAssignments} instead (§1.8.5).
 */
export async function listRoleUsers(
  request: APIRequestContext,
  config: AppConfig,
  scope: string,
  query: AuthzListQuery & { readonly roles?: readonly string[] } = {},
): Promise<{ readonly count: number; readonly members: readonly AuthzScopeMember[] }> {
  const params = queryString({
    ...pagingParams(query),
    roles: query.roles?.join(','),
  }).replace('?', '&');
  const page = await authzGet<AuthzPage<RawScopeMember>>(
    request,
    config,
    `roles/users/?scope=${authzScopeKey(scope)}${params}`,
    `Listing the authz members of ${scope}`,
  );
  return { count: page.count, members: page.results.map(toMember) };
}

/** One role assignment, as the console's tables list them (one row per assignment). */
export interface AuthzAssignment {
  readonly role: string;
  readonly org: string;
  readonly scope: string;
  readonly permissionCount: number;
  readonly isSuperadmin: boolean;
  /** Present on `assignments/`; empty on `users/<username>/assignments/`. */
  readonly username: string;
  readonly email: string;
  readonly fullName: string;
}

interface RawAssignment {
  readonly role?: string;
  readonly org?: string;
  readonly scope?: string;
  readonly permission_count?: number;
  readonly is_superadmin?: boolean;
  readonly username?: string;
  readonly email?: string;
  readonly full_name?: string;
}

const toAssignment = (raw: RawAssignment): AuthzAssignment => ({
  role: raw.role ?? '',
  org: raw.org ?? '',
  scope: raw.scope ?? '',
  permissionCount: raw.permission_count ?? 0,
  isSuperadmin: raw.is_superadmin ?? false,
  username: raw.username ?? '',
  email: raw.email ?? '',
  fullName: raw.full_name ?? '',
});

/** Filters the Team Members table offers. */
export interface AuthzAssignmentQuery extends AuthzListQuery {
  readonly scopes?: readonly string[];
  readonly orgs?: readonly string[];
  readonly roles?: readonly string[];
}

/** Every assignment visible to the caller — the console's Team Members tab. */
export async function listAssignments(
  request: APIRequestContext,
  config: AppConfig,
  query: AuthzAssignmentQuery = {},
): Promise<{ readonly count: number; readonly assignments: readonly AuthzAssignment[] }> {
  const page = await authzGet<AuthzPage<RawAssignment>>(
    request,
    config,
    `assignments/${queryString({
      ...pagingParams(query),
      scopes: query.scopes?.join(','),
      orgs: query.orgs?.join(','),
      roles: query.roles?.join(','),
    })}`,
    'Listing authz assignments',
  );
  return { count: page.count, assignments: page.results.map(toAssignment) };
}

/** One user's assignments — the console's user audit view. */
export async function listUserAssignments(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
  query: AuthzListQuery & {
    readonly roles?: readonly string[];
    readonly orgs?: readonly string[];
  } = {},
): Promise<{ readonly count: number; readonly assignments: readonly AuthzAssignment[] }> {
  const page = await authzGet<AuthzPage<RawAssignment>>(
    request,
    config,
    `users/${encodeURIComponent(username)}/assignments/${queryString({
      ...pagingParams(query),
      roles: query.roles?.join(','),
      orgs: query.orgs?.join(','),
    })}`,
    `Listing the authz assignments of ${username}`,
  );
  return { count: page.count, assignments: page.results.map(toAssignment) };
}

/** A user the console can offer, as `users/` lists them. */
export interface AuthzUser {
  readonly username: string;
  readonly email: string;
  readonly fullName: string;
  readonly assignmentCount: number;
}

/** Users with authz assignments visible to the caller. */
export async function listAuthzUsers(
  request: APIRequestContext,
  config: AppConfig,
  query: AuthzListQuery & {
    readonly scopes?: readonly string[];
    readonly orgs?: readonly string[];
  } = {},
): Promise<{ readonly count: number; readonly users: readonly AuthzUser[] }> {
  const page = await authzGet<
    AuthzPage<{
      readonly username?: string;
      readonly email?: string;
      readonly full_name?: string;
      readonly assignation_count?: number;
    }>
  >(
    request,
    config,
    `users/${queryString({
      ...pagingParams(query),
      scopes: query.scopes?.join(','),
      orgs: query.orgs?.join(','),
    })}`,
    'Listing authz users',
  );
  return {
    count: page.count,
    users: page.results.map((raw) => ({
      username: raw.username ?? '',
      email: raw.email ?? '',
      fullName: raw.full_name ?? '',
      assignmentCount: raw.assignation_count ?? 0,
    })),
  };
}

/** A scope (course or library) the caller may act in, as `scopes/` lists them. */
export interface AuthzScope {
  readonly externalKey: string;
  readonly displayName: string;
  readonly org: string;
}

/** Scopes the caller can assign roles in — the wizard's second step. */
export async function listScopes(
  request: APIRequestContext,
  config: AppConfig,
  query: AuthzListQuery & {
    readonly scopeType?: 'course' | 'library';
    readonly org?: string;
    readonly orgs?: readonly string[];
    readonly managementPermissionOnly?: boolean;
  } = {},
): Promise<{ readonly count: number; readonly scopes: readonly AuthzScope[] }> {
  const page = await authzGet<
    AuthzPage<{
      readonly external_key?: string;
      readonly display_name?: string;
      readonly org?: { readonly short_name?: string };
    }>
  >(
    request,
    config,
    `scopes/${queryString({
      ...pagingParams(query),
      scope_type: query.scopeType,
      org: query.org,
      orgs: query.orgs?.join(','),
      management_permission_only: query.managementPermissionOnly?.toString(),
    })}`,
    'Listing authz scopes',
  );
  return {
    count: page.count,
    scopes: page.results.map((raw) => ({
      externalKey: raw.external_key ?? '',
      displayName: raw.display_name ?? '',
      org: raw.org?.short_name ?? '',
    })),
  };
}

/** Organizations the caller can filter by — the console's Organization filter. */
export async function listAuthzOrgs(
  request: APIRequestContext,
  config: AppConfig,
  query: AuthzListQuery = {},
): Promise<{ readonly count: number; readonly orgs: readonly string[] }> {
  const page = await authzGet<AuthzPage<{ readonly short_name?: string }>>(
    request,
    config,
    `orgs/${queryString(pagingParams(query))}`,
    'Listing authz organizations',
  );
  return { count: page.count, orgs: page.results.map((raw) => raw.short_name ?? '') };
}

// --- permission checks ----------------------------------------------------------------------

/** One permission question and the platform's answer. */
export interface PermissionCheck {
  readonly action: string;
  readonly scope?: string;
  readonly allowed: boolean;
}

/**
 * Asks the platform what the **caller** may do — the fast, UI-free oracle of the
 * role matrix. A check with no `scope` asks "allowed in any scope at all".
 */
export async function validateMyPermissions(
  request: APIRequestContext,
  config: AppConfig,
  checks: readonly { readonly action: string; readonly scope?: string }[],
): Promise<readonly PermissionCheck[]> {
  const url = `${config.baseUrls.lms}${AUTHZ_BASE}/permissions/validate/me`;
  const token = await fetchCsrfToken(request, config);
  const response = await request.post(url, {
    data: checks,
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });
  if (!response.ok()) {
    throw new ApiError(`Validating permissions failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: (await response.text()).slice(0, 500),
    });
  }
  const raw = (await response.json()) as readonly {
    readonly action?: string;
    readonly scope?: string;
    readonly allowed?: boolean;
  }[];
  return raw.map((row) => ({
    action: row.action ?? '',
    scope: row.scope,
    allowed: row.allowed ?? false,
  }));
}

/** Whether the caller holds `action` in `scope` — one question, one boolean. */
export async function canI(
  request: APIRequestContext,
  config: AppConfig,
  action: string,
  scope?: string,
): Promise<boolean> {
  const [answer] = await validateMyPermissions(request, config, [{ action, scope }]);
  return answer?.allowed ?? false;
}

/** Which of `users` the platform recognises — what the Assign Role wizard asks. */
export interface UserValidation {
  readonly validUsers: readonly string[];
  readonly invalidUsers: readonly string[];
  readonly total: number;
}

/** Validates user identifiers (username or email) before an assignment. */
export async function validateUsers(
  request: APIRequestContext,
  config: AppConfig,
  users: readonly string[],
): Promise<UserValidation> {
  const url = `${config.baseUrls.lms}${AUTHZ_BASE}/users/validate/`;
  const token = await fetchCsrfToken(request, config);
  const response = await request.post(url, {
    data: { users },
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });
  if (!response.ok()) {
    throw new ApiError(`Validating users failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: (await response.text()).slice(0, 500),
    });
  }
  const raw = (await response.json()) as {
    readonly valid_users?: readonly string[];
    readonly invalid_users?: readonly string[];
    readonly summary?: { readonly total?: number };
  };
  return {
    validUsers: raw.valid_users ?? [],
    invalidUsers: raw.invalid_users ?? [],
    total: raw.summary?.total ?? 0,
  };
}

// --- assignment writes ----------------------------------------------------------------------

/** One user's outcome in a 207 multi-status answer. */
export interface AuthzWriteOutcome {
  readonly userIdentifier: string;
  readonly scope?: string;
  /** `role_added` / `role_removed` on success. */
  readonly status?: string;
  /** `user_not_found`, `user_already_has_role`, `user_does_not_have_role`, … */
  readonly error?: string;
}

/** What assign and revoke report: per-user outcomes, not a single status. */
export interface AuthzWriteResult {
  readonly completed: readonly AuthzWriteOutcome[];
  readonly errors: readonly AuthzWriteOutcome[];
}

export interface AuthzWriteOptions {
  /**
   * Keep a partial result instead of throwing. The default is to throw, because
   * a seeding call that silently assigned nobody is a worse failure than a loud
   * one; the specs that put the *error* rows under test pass `true` and assert
   * the body.
   */
  readonly allowErrors?: boolean;
}

interface RawWriteOutcome {
  readonly user_identifier?: string;
  readonly scope?: string;
  readonly status?: string;
  readonly error?: string;
}

function toWriteResult(raw: {
  readonly completed?: readonly RawWriteOutcome[];
  readonly errors?: readonly RawWriteOutcome[];
}): AuthzWriteResult {
  const map = (rows: readonly RawWriteOutcome[] = []): AuthzWriteOutcome[] =>
    rows.map((row) => ({
      userIdentifier: row.user_identifier ?? '',
      scope: row.scope,
      status: row.status,
      error: row.error,
    }));
  return { completed: map(raw.completed), errors: map(raw.errors) };
}

function assertNoWriteErrors(
  result: AuthzWriteResult,
  what: string,
  url: string,
  options: AuthzWriteOptions,
): void {
  if (options.allowErrors === true || result.errors.length === 0) return;
  const detail = result.errors
    .map((row) => `${row.userIdentifier}: ${row.error ?? 'unknown error'}`)
    .join('; ');
  throw new ApiError(`${what} did not apply to every user — ${detail}.`, {
    status: 207,
    url,
    body: JSON.stringify(result),
  });
}

/**
 * Grants `role` to `users` in every scope named — the Assign Role wizard's save.
 * Answers 207: a user who does not exist, or who already holds the role, is an
 * `errors[]` row rather than a failed request.
 */
export async function assignRole(
  request: APIRequestContext,
  config: AppConfig,
  input: {
    readonly role: string;
    readonly scopes: readonly string[];
    readonly users: readonly string[];
  },
  options: AuthzWriteOptions = {},
): Promise<AuthzWriteResult> {
  const url = `${config.baseUrls.lms}${AUTHZ_BASE}/roles/users/`;
  const token = await fetchCsrfToken(request, config);
  const what = `Assigning ${input.role} to ${input.users.join(', ')}`;
  const response = await request.put(url, {
    data: { role: input.role, scopes: input.scopes, users: input.users },
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });
  if (response.status() !== 207 && !response.ok()) {
    throw new ApiError(`${what} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: (await response.text()).slice(0, 500),
    });
  }
  const result = toWriteResult((await response.json()) as Parameters<typeof toWriteResult>[0]);
  assertNoWriteErrors(result, what, url, options);
  return result;
}

/**
 * Revokes `role` from `users` in one scope. The API takes its arguments as
 * query parameters, not a body, and answers 207 the same way.
 */
export async function revokeRole(
  request: APIRequestContext,
  config: AppConfig,
  input: {
    readonly role: string;
    readonly scope: string;
    readonly users: readonly string[];
  },
  options: AuthzWriteOptions = {},
): Promise<AuthzWriteResult> {
  const params = `role=${encodeURIComponent(input.role)}&scope=${authzScopeKey(input.scope)}&users=${input.users.map(encodeURIComponent).join(',')}`;
  const url = `${config.baseUrls.lms}${AUTHZ_BASE}/roles/users/?${params}`;
  const token = await fetchCsrfToken(request, config);
  const what = `Revoking ${input.role} from ${input.users.join(', ')} in ${input.scope}`;
  const response = await request.delete(url, {
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });
  if (response.status() !== 207 && !response.ok()) {
    throw new ApiError(`${what} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: (await response.text()).slice(0, 500),
    });
  }
  const result = toWriteResult((await response.json()) as Parameters<typeof toWriteResult>[0]);
  assertNoWriteErrors(result, what, url, options);
  return result;
}

// --- the flag -------------------------------------------------------------------------------

/**
 * Where `authz.enable_course_authoring` currently applies: globally, and the
 * courses and organizations whose override forces it on or off.
 *
 * Any authenticated user may read this (no authz permission decorator), which
 * makes it both the cheap capability preflight and the oracle a waffle-override
 * write waits on.
 */
export interface WaffleFlagStates {
  readonly global: boolean;
  readonly orgOverrides: { readonly on: readonly string[]; readonly off: readonly string[] };
  readonly courseOverrides: { readonly on: readonly string[]; readonly off: readonly string[] };
}

export async function fetchWaffleFlagStates(
  request: APIRequestContext,
  config: AppConfig,
): Promise<WaffleFlagStates> {
  const raw = await authzGet<{
    readonly global?: boolean;
    readonly org_overrides?: { readonly on?: readonly string[]; readonly off?: readonly string[] };
    readonly course_overrides?: {
      readonly on?: readonly string[];
      readonly off?: readonly string[];
    };
  }>(request, config, 'waffle-flag-states/', 'Reading the authz waffle flag states');
  return {
    global: raw.global ?? false,
    orgOverrides: { on: raw.org_overrides?.on ?? [], off: raw.org_overrides?.off ?? [] },
    courseOverrides: {
      on: raw.course_overrides?.on ?? [],
      off: raw.course_overrides?.off ?? [],
    },
  };
}

/** Whether AuthZ course authoring is in force for `courseKey` right now. */
export async function isAuthzEnabledForCourse(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<boolean> {
  const states = await fetchWaffleFlagStates(request, config);
  if (states.courseOverrides.on.includes(courseKey)) return true;
  if (states.courseOverrides.off.includes(courseKey)) return false;
  const org = courseKey.split(':')[1]?.split('+')[0] ?? '';
  if (states.orgOverrides.on.includes(org)) return true;
  if (states.orgOverrides.off.includes(org)) return false;
  return states.global;
}
