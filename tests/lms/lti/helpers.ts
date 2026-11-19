import type { APIRequestContext } from '@playwright/test';

import { expect } from '../../../src/fixtures';
import type { InstructorCastMember, RoundTripLearner } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  buildSection,
  grantCourseTeamRole,
  primeCoursewareForLearner,
  type AuthoredUnit,
  type LtiLaunch,
  type LtiToolClient,
} from '../../../src/api';
import { UnitPage } from '../../../src/pages/lms/courseware/unit.page';

/**
 * Shared by the LTI 1.3 specs: every one authors in the worker's content course
 * (`@author`) and launches the suite's test tool (`@lti-tool`).
 */
export const LTI_TAGS: string[] = [
  '@regression',
  '@studio',
  '@author',
  '@lti',
  '@lti-tool',
  '@mfe-authoring',
  '@mfe-learning',
];

/**
 * A section of one empty unit in `courseKey`, built as the author
 * (`page.request`) — in a subsection graded as `gradedAs` when given, which a
 * graded LTI block needs for its score to count.
 */
export async function ltiUnit(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  label: string,
  options: { readonly gradedAs?: string } = {},
): Promise<AuthoredUnit> {
  const section = await buildSection(request, config, courseKey, label, {
    subsections: [
      {
        units: [{ blocks: [] }],
        ...(options.gradedAs === undefined ? {} : { gradedAs: options.gradedAs }),
      },
    ],
  });
  return section.units[0]!;
}

/**
 * The newest launch the tool received for `blockKey`, once there is one — newer
 * than the launch `after` when given, for a relaunch of the same block.
 */
export async function launchOf(
  tool: LtiToolClient,
  blockKey: string,
  after?: LtiLaunch,
): Promise<LtiLaunch> {
  let newest: LtiLaunch | undefined;
  await expect
    .poll(
      async () => {
        newest = (await tool.launches(blockKey))[0];
        return newest !== undefined && newest.id > (after?.id ?? 0);
      },
      { message: `the tool receives a launch of ${blockKey}`, timeout: TIMEOUTS.navigation },
    )
    .toBe(true);
  return newest!;
}

/** A learner opens `unit` in the learning MFE (its subsection primed first). */
export async function openUnitAs(
  learner: RoundTripLearner,
  courseKey: string,
  unit: AuthoredUnit,
): Promise<void> {
  await learner.prime(unit.sequentialUsageKey);
  await learner.unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
}

/** Runs `work` while the cast's staff member holds the course Staff role, revoking it after. */
export async function asCourseStaff<T>(
  author: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  staff: InstructorCastMember,
  work: () => Promise<T>,
): Promise<T> {
  await grantCourseTeamRole(author, config, courseKey, [staff.identity.username], 'staff');
  try {
    return await work();
  } finally {
    await grantCourseTeamRole(
      author,
      config,
      courseKey,
      [staff.identity.username],
      'staff',
      'revoke',
    );
  }
}

/**
 * Course staff (see {@link asCourseStaff}) open `unit` and launch the
 * new-window LTI block `blockKey`. Returns what the tool received.
 */
export async function launchAsStaff(
  config: AppConfig,
  tool: LtiToolClient,
  staff: InstructorCastMember,
  courseKey: string,
  unit: AuthoredUnit,
  blockKey: string,
): Promise<LtiLaunch> {
  await primeCoursewareForLearner(staff.request, config, unit.sequentialUsageKey);
  const unitPage = new UnitPage(staff.page, config);
  await unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
  const window = await unitPage.ltiBlock(blockKey).launchInNewWindow();
  await window.close();
  return launchOf(tool, blockKey);
}

/** A label unique to this test and attempt, for the sections it builds. */
export function ltiLabel(what: string, testInfo: { testId: string; retry: number }): string {
  return `E2E LTI ${what} ${testInfo.testId.slice(-6)}R${testInfo.retry}`;
}
