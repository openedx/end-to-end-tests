import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../../../src/config';
import {
  buildSection,
  courseKeyFor,
  createCourse,
  grantCourseTeamRole,
  newCourseIdentity,
  publishXBlock,
  updateCourseDetails,
  type CourseIdentity,
} from '../../../src/api';

/**
 * The transition cases — turning `authz.enable_course_authoring` on for a scope
 * and watching the platform move that scope's roles.
 *
 * They mutate one course (or one organization) that the test created for itself,
 * so nothing else in the run notices, and they need both the `rbac` capability
 * and an admin account.
 */
export const TRANSITION_TAGS: string[] = ['@studio', '@author', '@mfe-authoring', '@rbac'];

/** A course starts in 2040 unless told otherwise; these need one learners can reach. */
const REACHABLE_START = '2000-01-01T00:00:00Z';

/**
 * A course of the test's own, ready to be migrated: released, with one published
 * unit so a learner's course outline has something in it.
 *
 * Migration is a one-way door for a course's roles, so these cases never borrow
 * the worker's shared courses — a fresh key per test keeps the before-and-after
 * readings honest and leaves other specs alone.
 */
export async function migrationCourse(
  author: APIRequestContext,
  config: AppConfig,
  runId: string,
  slot: string,
  org?: string,
): Promise<string> {
  const base = newCourseIdentity(config, runId, slot, 'migration');
  const identity: CourseIdentity =
    org === undefined
      ? base
      : { ...base, org, courseKey: courseKeyFor(org, base.number, base.run) };
  const courseKey = await createCourse(author, config, identity);
  await updateCourseDetails(author, config, courseKey, { start_date: REACHABLE_START });
  const section = await buildSection(author, config, courseKey, `E2E migration ${slot}`, {
    subsections: [{ units: [{ blocks: ['html'] }] }],
  });
  for (const unit of section.units) await publishXBlock(author, config, unit.usageKey);
  return courseKey;
}

/** An organization short name no other run will use. */
export function newOrgName(runId: string, slot: string): string {
  return `E2EAUTHZ${runId}${slot}`
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 30);
}

/** Grants each actor its legacy role in the course, through the instructor API. */
export async function seedLegacyTeam(
  author: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  team: readonly {
    readonly email: string;
    readonly role: 'instructor' | 'staff' | 'limited_staff' | 'data_researcher' | 'beta';
  }[],
): Promise<void> {
  for (const member of team) {
    await grantCourseTeamRole(author, config, courseKey, [member.email], member.role);
  }
}
