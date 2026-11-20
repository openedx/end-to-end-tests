import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import type { RoundTripLearner } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  agsEndpoint,
  fetchCourseProgress,
  publishXBlock,
  updateXBlock,
  type AuthoredUnit,
  type LtiLaunch,
} from '../../../src/api';
import type { LtiToolSession } from '../../../src/lti-tools';
import { issue, testId } from '../../../src/reporting';
import { seedReadyLtiBlock } from '../../../src/steps';
import { LTI_TAGS, launchFrom, launchTargetFor, ltiLabel, ltiUnit, openUnitAs } from './helpers';

/**
 * Grades an LTI 1.3 tool returns through Assignment and Grade Services:
 * declaratively, to the line item the platform creates for a graded block
 * (TC-00655), and programmatically, to a line item the tool creates itself
 * (TC-00656).
 *
 * The tool posts the scores (it is the actor in these cases); the learner's
 * Progress API decides. Each block sits alone in its own graded subsection,
 * because Progress reports a subsection's problem scores without naming the
 * block each belongs to.
 */

/** The assignment type the graded subsections use: one the default grading policy has. */
const ASSIGNMENT_TYPE = 'Homework';

/** A graded LTI block (10 points) the learner has launched; returns the launch. */
async function launchedGradedBlock(
  author: APIRequestContext,
  config: AppConfig,
  tool: LtiToolSession,
  learner: RoundTripLearner,
  courseKey: string,
  label: string,
  agsMode: 'declarative' | 'programmatic',
): Promise<{ unit: AuthoredUnit; blockKey: string; launch: LtiLaunch }> {
  const unit = await ltiUnit(author, config, courseKey, label, { gradedAs: ASSIGNMENT_TYPE });
  const target = launchTargetFor(tool);
  const { blockKey } = await seedReadyLtiBlock(author, config, tool, unit.usageKey, {
    hasScore: true,
    weight: 10,
    agsMode,
    launchTarget: target,
  });
  await openUnitAs(learner, courseKey, unit, tool);
  return { unit, blockKey, launch: await launchFrom(tool, learner.unitPage, blockKey, target) };
}

/** The learner's points in the subsection holding `unit`, as their Progress reports them. */
async function subsectionScore(
  learner: RoundTripLearner,
  config: AppConfig,
  courseKey: string,
  unit: AuthoredUnit,
): Promise<{ earned: number; possible: number } | undefined> {
  const progress = await fetchCourseProgress(learner.request, config, courseKey);
  const subsection = progress.subsections.find((s) => s.block_key === unit.sequentialUsageKey);
  return subsection === undefined
    ? undefined
    : { earned: subsection.num_points_earned, possible: subsection.num_points_possible };
}

test.describe('LTI 1.3 grades (AGS)', { tag: [...LTI_TAGS, '@lti-tool-services'] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'a tool returns and then updates a learner grade through the declarative line item',
    { annotation: testId('TC-00655') },
    async (
      { page, config, contentCourse, studioAuthorSession, roundTripLearner, ltiTool },
      testInfo,
    ) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const { unit, launch } = await launchedGradedBlock(
        page.request,
        config,
        ltiTool,
        roundTripLearner,
        courseKey,
        ltiLabel('ags declarative', testInfo),
        'declarative',
      );
      // Declarative mode: the platform made the block's line item and names it.
      expect(agsEndpoint(launch)?.lineitem).toBeDefined();

      for (const given of [6, 8]) {
        const posted = await ltiTool.postScore(launch, given, 10);
        expect(posted.status, JSON.stringify(posted.body)).toBeLessThan(300);
        await expect
          .poll(() => subsectionScore(roundTripLearner, config, courseKey, unit), {
            message: `the learner's Progress shows ${given}/10`,
            timeout: TIMEOUTS.ltiGradePublish,
          })
          .toEqual({ earned: given, possible: 10 });
      }
    },
  );

  test(
    'a tool creates its own line item and returns a learner grade to it',
    { annotation: testId('TC-00656') },
    async (
      { page, config, contentCourse, studioAuthorSession, roundTripLearner, ltiTool },
      testInfo,
    ) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const { unit, blockKey, launch } = await launchedGradedBlock(
        page.request,
        config,
        ltiTool,
        roundTripLearner,
        courseKey,
        ltiLabel('ags programmatic', testInfo),
        'programmatic',
      );
      // Programmatic mode: a container to manage, no line item of the platform's.
      expect(agsEndpoint(launch)?.lineitems).toBeDefined();
      expect(agsEndpoint(launch)?.lineitem).toBeUndefined();

      const created = await ltiTool.createLineItem(launch, {
        scoreMaximum: 10,
        label: 'E2E programmatic line item',
        resourceLinkId: blockKey,
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const posted = await ltiTool.postScore(launch, 6, 10, created.body.id);
      expect(posted.status, JSON.stringify(posted.body)).toBeLessThan(300);

      await expect
        .poll(() => subsectionScore(roundTripLearner, config, courseKey, unit), {
          message: "the learner's Progress shows 6/10",
          timeout: TIMEOUTS.ltiGradePublish,
        })
        .toEqual({ earned: 6, possible: 10 });
    },
  );

  test(
    'a tool deletes a line item it created',
    {
      annotation: [
        testId('TC-00656'),
        issue('https://github.com/openedx/xblock-lti-consumer/issues/745'),
      ],
    },
    async (
      { page, config, contentCourse, studioAuthorSession, roundTripLearner, ltiTool },
      testInfo,
    ) => {
      test.fail(
        true,
        'AGS refuses every line-item DELETE with 403 (the permission checks the action ' +
          "'delete', DRF calls it 'destroy'): https://github.com/openedx/xblock-lti-consumer/issues/745",
      );
      void studioAuthorSession;
      const { blockKey, launch } = await launchedGradedBlock(
        page.request,
        config,
        ltiTool,
        roundTripLearner,
        contentCourse.courseKey,
        ltiLabel('ags delete', testInfo),
        'programmatic',
      );
      const created = await ltiTool.createLineItem(launch, {
        scoreMaximum: 10,
        label: 'E2E line item to delete',
        resourceLinkId: blockKey,
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);

      const deleted = await ltiTool.deleteLineItem(launch, created.body.id);
      expect(deleted.status, JSON.stringify(deleted.body)).toBeLessThan(300);
      const listed = await ltiTool.listLineItems(launch);
      expect(listed.body.map((item) => item.id)).not.toContain(created.body.id);
    },
  );

  // Not a sheet step: once an author turns a block's grades off, its line item
  // takes no score, even from a tool that still holds a valid token
  // (xblock-lti-consumer 11.5.1).
  test('a block whose grades are turned off refuses a tool’s score', async ({
    page,
    config,
    contentCourse,
    studioAuthorSession,
    roundTripLearner,
    ltiTool,
  }, testInfo) => {
    void studioAuthorSession;
    const { courseKey } = contentCourse;
    const { unit, blockKey, launch } = await launchedGradedBlock(
      page.request,
      config,
      ltiTool,
      roundTripLearner,
      courseKey,
      ltiLabel('ags disabled', testInfo),
      'declarative',
    );
    expect(agsEndpoint(launch)?.lineitem).toBeDefined();

    await updateXBlock(page.request, config, blockKey, {
      metadata: { lti_advantage_ags_mode: 'disabled' },
    });
    await publishXBlock(page.request, config, unit.usageKey);

    const posted = await ltiTool.postScore(launch, 6, 10);
    expect(posted.status, JSON.stringify(posted.body)).toBe(403);
    // The republish rebuilds the learner's view of the course; read the
    // subsection once it is listed again. It never earned the refused score.
    await expect
      .poll(() => subsectionScore(roundTripLearner, config, courseKey, unit), {
        message: "the learner's Progress lists the subsection, with nothing earned",
        timeout: TIMEOUTS.contentPublish,
      })
      .toMatchObject({ earned: 0 });
  });
});
