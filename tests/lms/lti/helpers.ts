import type { APIRequestContext, FrameLocator, Page } from '@playwright/test';

import type { InstructorCastMember, RoundTripLearner } from '../../../src/fixtures';
import type { AppConfig } from '../../../src/config';
import {
  buildSection,
  grantCourseTeamRole,
  primeCoursewareForLearner,
  type AuthoredUnit,
  type LtiLaunch,
} from '../../../src/api';
import type { LtiToolSession } from '../../../src/lti-tools';
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
 * Where a block launches when the case is not about where: inline when the tool
 * can be launched in the block's iframe, else in a new window.
 */
export function launchTargetFor(tool: LtiToolSession): 'iframe' | 'new_window' {
  return tool.features.has('inline') ? 'iframe' : 'new_window';
}

/**
 * The newest launch the tool received for `blockKey`, read from the window or
 * frame it landed in (`surface`) where the tool needs that — newer than `after`
 * when given, for a relaunch of the same block.
 */
export async function launchOf(
  tool: LtiToolSession,
  blockKey: string,
  options: { readonly after?: LtiLaunch; readonly surface?: Page | FrameLocator } = {},
): Promise<LtiLaunch> {
  return tool.readLaunch({ resourceLinkId: blockKey, ...options });
}

/**
 * A learner opens `unit` in the learning MFE (its subsection primed first),
 * admitted to the tool session so its launches reach the test's registration.
 */
export async function openUnitAs(
  learner: RoundTripLearner,
  courseKey: string,
  unit: AuthoredUnit,
  tool: LtiToolSession,
): Promise<void> {
  await tool.admit(learner.context);
  await learner.prime(unit.sequentialUsageKey);
  await learner.unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
}

/**
 * Launches block `blockKey` on an open unit page — inline (the block's iframe
 * starts) or in a new window (its button) as the block is set up — and returns
 * what the tool received, read before the window closes.
 */
export async function launchFrom(
  tool: LtiToolSession,
  unitPage: UnitPage,
  blockKey: string,
  target: 'iframe' | 'new_window',
  after?: LtiLaunch,
): Promise<LtiLaunch> {
  const block = unitPage.ltiBlock(blockKey);
  const options = after === undefined ? {} : { after };
  if (target === 'iframe') {
    await block.waitForInlineLaunch();
    return launchOf(tool, blockKey, { ...options, surface: block.launchFrame });
  }
  const window = await block.launchInNewWindow();
  try {
    return await launchOf(tool, blockKey, { ...options, surface: window });
  } finally {
    await window.close();
  }
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
 * Course staff (see {@link asCourseStaff}), admitted to the tool session, open
 * `unit` and launch the new-window LTI block `blockKey`. Returns what the tool
 * received.
 */
export async function launchAsStaff(
  config: AppConfig,
  tool: LtiToolSession,
  staff: InstructorCastMember,
  courseKey: string,
  unit: AuthoredUnit,
  blockKey: string,
): Promise<LtiLaunch> {
  await tool.admit(staff.context);
  await primeCoursewareForLearner(staff.request, config, unit.sequentialUsageKey);
  const unitPage = new UnitPage(staff.page, config);
  await unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
  return launchFrom(tool, unitPage, blockKey, 'new_window');
}

/** A label unique to this test and attempt, for the sections it builds. */
export function ltiLabel(what: string, testInfo: { testId: string; retry: number }): string {
  return `E2E LTI ${what} ${testInfo.testId.slice(-6)}R${testInfo.retry}`;
}
