import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';

/** Cohort endpoints live on the LMS, under the course's instructor cohort API. */
function cohortsBase(config: AppConfig, courseKey: string): string {
  return `${config.baseUrls.lms}/courses/${courseKey}/cohorts`;
}

/** One cohort as the LMS reports it. */
export interface Cohort {
  readonly id: number;
  readonly name: string;
  readonly user_count: number;
  readonly assignment_type: string;
  readonly group_id: number | null;
  readonly user_partition_id: number | null;
}

async function cohortWrite<T>(
  request: APIRequestContext,
  config: AppConfig,
  method: 'POST' | 'PUT' | 'PATCH',
  url: string,
  what: string,
  body: { data?: unknown; form?: Record<string, string> },
): Promise<T> {
  const token = await fetchCsrfToken(request, config);
  const headers = { [CSRF_HEADER]: token, Referer: config.baseUrls.lms };
  const response = await request.fetch(url, { method, headers, ...body });
  if (!response.ok()) {
    throw new ApiError(`${what} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
  return (await response.json()) as T;
}

/** Turns cohorts on for a course (`is_cohorted: true`). */
export async function enableCohorts(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<void> {
  await cohortWrite(
    request,
    config,
    'PATCH',
    `${cohortsBase(config, courseKey)}/settings`,
    `Enabling cohorts in ${courseKey}`,
    { data: { is_cohorted: true } },
  );
}

/** Creates a manually-assigned cohort. */
export async function createCohort(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  name: string,
): Promise<Cohort> {
  return cohortWrite<Cohort>(
    request,
    config,
    'POST',
    `${cohortsBase(config, courseKey)}/`,
    `Creating cohort "${name}" in ${courseKey}`,
    { data: { name, assignment_type: 'manual' } },
  );
}

/**
 * Links a cohort to a content group so a unit restricted to that group is shown
 * only to the cohort's members. **PUT** (a PATCH is refused without `name`).
 */
export async function linkCohortToGroup(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  cohort: Cohort,
  partitionId: number,
  groupId: number,
): Promise<Cohort> {
  return cohortWrite<Cohort>(
    request,
    config,
    'PUT',
    `${cohortsBase(config, courseKey)}/${cohort.id}`,
    `Linking cohort ${cohort.id} to group ${groupId}`,
    {
      data: {
        name: cohort.name,
        assignment_type: cohort.assignment_type,
        group_id: groupId,
        user_partition_id: partitionId,
      },
    },
  );
}

/** Adds a learner (by username) to a cohort. */
export async function addToCohort(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  cohortId: number,
  username: string,
): Promise<void> {
  const result = await cohortWrite<{ added?: unknown[]; unknown?: string[] }>(
    request,
    config,
    'POST',
    `${cohortsBase(config, courseKey)}/${cohortId}/add`,
    `Adding ${username} to cohort ${cohortId}`,
    { form: { users: username } },
  );
  if ((result.added ?? []).length === 0) {
    throw new ApiError(`"${username}" was not added to cohort ${cohortId}.`, {
      status: 200,
      url: `${cohortsBase(config, courseKey)}/${cohortId}/add`,
      body: JSON.stringify(result),
    });
  }
}
