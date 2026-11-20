import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { LTI_EDITOR_SELECTORS, TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  LTI_CLAIM,
  LTI_CONSUMER_API_PATH,
  LTI_ROLE,
  availableComponentTypes,
  fetchContainer,
  fetchXBlock,
  launchRoles,
  readLtiLaunchInfo,
  type LtiLaunch,
} from '../../../src/api';
import type { LtiToolSession } from '../../../src/lti-tools';
import { StudioLtiEditor } from '../../../src/pages/studio/editors/lti-editor';
import { issue, testId } from '../../../src/reporting';
import { seedReadyLtiBlock } from '../../../src/steps';
import type { InstructorCastMember } from '../../../src/fixtures';
import {
  LTI_TAGS,
  asCourseStaff,
  launchAsStaff,
  launchFrom,
  launchTargetFor,
  ltiLabel,
  ltiUnit,
  openUnitAs,
} from './helpers';

/**
 * LTI 1.3 launches from a course: an author sets an LTI Consumer up in Studio
 * against the suite's test tool, and learners and course staff launch it
 * (TC-00653); a duplicated component launches too (TC-00659, its LTI 1.3 half).
 *
 * The UI drives the setup and the launch; what the tool **received** decides:
 * the test tool reports each launch's verified claims (`ltiTool.readLaunch`), so
 * the assertions read the platform's own `id_token`, not the tool's page.
 *
 * Every block is in a section of this test's own in the worker's content
 * course, and every launch is by a user of the test's own on their own contexts.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Course staff launch a fresh new-window LTI block of the test's own; returns what the tool received. */
async function staffLaunch(
  author: APIRequestContext,
  config: AppConfig,
  tool: LtiToolSession,
  courseKey: string,
  staff: InstructorCastMember,
  label: string,
): Promise<LtiLaunch> {
  const unit = await ltiUnit(author, config, courseKey, label);
  const { blockKey } = await seedReadyLtiBlock(author, config, tool, unit.usageKey, {
    launchTarget: 'new_window',
  });
  return asCourseStaff(author, config, courseKey, staff, () =>
    launchAsStaff(config, tool, staff, courseKey, unit, blockKey),
  );
}

test.describe('LTI 1.3 launches', { tag: [...LTI_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'an author sets up an LTI 1.3 component in Studio, and a learner launches it',
    { tag: ['@lti-tool-claims', '@lti-tool-inline'], annotation: testId('TC-00653') },
    async (
      {
        page,
        config,
        contentCourse,
        studioAuthorSession,
        studioUnitPage,
        roundTripLearner,
        ltiTool,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      // Same user in the browser and the API: `page.request`
      // (tests/studio/home/course-lifecycle.spec.ts).
      const unit = await ltiUnit(page.request, config, courseKey, ltiLabel('setup', testInfo));

      // The author adds an LTI Consumer from the Advanced tile and walks its
      // editor: LTI 1.3, the tool's launch and login URLs, its public key.
      await studioUnitPage.goto(unit.usageKey);
      const tiles = availableComponentTypes(
        await fetchContainer(page.request, config, unit.usageKey),
      );
      const blockKey = await studioUnitPage.addAdvancedComponent(
        tiles.indexOf('advanced'),
        'lti_consumer',
      );
      const editor = new StudioLtiEditor(await studioUnitPage.openLegacyEditor(blockKey));
      await editor.configureLti13({
        launchUrl: ltiTool.launchUrl,
        oidcUrl: ltiTool.oidcUrl,
        toolPublicKey: await ltiTool.publicKey(),
      });
      await studioUnitPage.saveLegacyEditor(editor.frame, LTI_EDITOR_SELECTORS.save, {
        handler: 'submit_studio_edits',
      });

      // The block holds what was typed, and Studio shows the values to
      // register the platform with in the tool.
      const { metadata } = await fetchXBlock(page.request, config, blockKey);
      expect(metadata).toMatchObject({
        lti_version: 'lti_1p3',
        lti_1p3_launch_url: ltiTool.launchUrl,
        lti_1p3_oidc_url: ltiTool.oidcUrl,
      });
      const info = await readLtiLaunchInfo(page.request, config, blockKey);
      const api = `${config.baseUrls.lms}${LTI_CONSUMER_API_PATH}`;
      expect(info.clientId).toMatch(UUID);
      expect(info.deploymentId).toBe('1');
      expect(info.keysetUrl.startsWith(`${api}public_keysets/`)).toBe(true);
      expect(info.tokenUrl.startsWith(`${api}token/`)).toBe(true);
      expect(info.loginUrl.replace(/\/$/, '')).toBe(`${api}launch`);

      await ltiTool.register(info);
      await studioUnitPage.publish();

      // The learner opens the unit; the block launches the tool inline.
      await openUnitAs(roundTripLearner, courseKey, unit, ltiTool);
      const launch = await launchFrom(ltiTool, roundTripLearner.unitPage, blockKey, 'iframe');
      expect(launch.error).toBeUndefined();
      expect(launch).toMatchObject({
        verified: true,
        clientId: info.clientId,
        messageType: 'LtiResourceLinkRequest',
        resourceLinkId: blockKey,
      });
      expect(launch.claims[LTI_CLAIM.deploymentId]).toBe('1');
      expect(launch.claims[LTI_CLAIM.context]).toMatchObject({ id: courseKey });
      expect(launchRoles(launch)).toContain(LTI_ROLE.learner);
      // An anonymous id of the platform's, not the learner's username.
      expect(typeof launch.claims.sub).toBe('string');
      expect(launch.claims.sub).not.toBe(roundTripLearner.identity.username);
    },
  );

  test(
    'course staff launch it as an instructor, not a learner',
    { tag: '@lti-tool-claims', annotation: testId('TC-00653') },
    async (
      { page, config, contentCourse, studioAuthorSession, instructorCast, ltiTool },
      testInfo,
    ) => {
      void studioAuthorSession;
      const launch = await staffLaunch(
        page.request,
        config,
        ltiTool,
        contentCourse.courseKey,
        await instructorCast('staff'),
        ltiLabel('staff', testInfo),
      );
      expect(launch.verified).toBe(true);
      expect(launchRoles(launch)).toContain(LTI_ROLE.instructor);
      expect(launchRoles(launch)).not.toContain(LTI_ROLE.learner);
    },
  );

  test(
    'course staff are not sent the platform administrator role',
    {
      tag: '@lti-tool-claims',
      annotation: [
        testId('TC-00653'),
        issue('https://github.com/openedx/xblock-lti-consumer/issues/618'),
      ],
    },
    async (
      { page, config, contentCourse, studioAuthorSession, instructorCast, ltiTool },
      testInfo,
    ) => {
      test.fail(
        true,
        'Course staff are sent the global-staff role set (system/person#Administrator, ' +
          'institution Administrator): https://github.com/openedx/xblock-lti-consumer/issues/618',
      );
      void studioAuthorSession;
      const launch = await staffLaunch(
        page.request,
        config,
        ltiTool,
        contentCourse.courseKey,
        await instructorCast('staff'),
        ltiLabel('staff roles', testInfo),
      );
      expect(launch.verified).toBe(true);
      expect(launchRoles(launch)).not.toContain(LTI_ROLE.systemAdministrator);
      expect(launchRoles(launch)).not.toContain(LTI_ROLE.administrator);
    },
  );

  test(
    'a duplicated LTI 1.3 component launches as itself, under the same registration',
    { annotation: testId('TC-00659') },
    async (
      {
        page,
        config,
        contentCourse,
        studioAuthorSession,
        studioUnitPage,
        roundTripLearner,
        ltiTool,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const unit = await ltiUnit(page.request, config, courseKey, ltiLabel('duplicate', testInfo));
      // Seeding reads the block's registration from Studio, which creates its
      // LTI configuration; a duplicate of a configured block shares its
      // client id (a never-rendered one would get its own).
      const target = launchTargetFor(ltiTool);
      const original = await seedReadyLtiBlock(page.request, config, ltiTool, unit.usageKey, {
        launchTarget: target,
      });

      await studioUnitPage.goto(unit.usageKey);
      const copyKey = await studioUnitPage.duplicateComponent(original.blockKey);
      await studioUnitPage.publish();

      const copy = await readLtiLaunchInfo(page.request, config, copyKey);
      expect(copyKey).not.toBe(original.blockKey);
      expect(copy.clientId).toBe(original.info.clientId);

      await openUnitAs(roundTripLearner, courseKey, unit, ltiTool);
      const launch = await launchFrom(ltiTool, roundTripLearner.unitPage, copyKey, target);
      expect(launch.error).toBeUndefined();
      expect(launch).toMatchObject({
        verified: true,
        clientId: original.info.clientId,
        resourceLinkId: copyKey,
      });
    },
  );
});
