import { generateKeyPairSync } from 'node:crypto';

import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import type { AdminLmsRunner, RoundTripLearner } from '../../../src/fixtures';
import { LTI_EDITOR_SELECTORS, TIMEOUTS, getRunId, type AppConfig } from '../../../src/config';
import {
  LTI_EXTERNAL_CONFIG_FLAG,
  availableComponentTypes,
  createLtiStoreConfiguration,
  fetchContainer,
  fetchXBlock,
  ltiEditorOffersConfigType,
  readLtiLaunchInfo,
  setCourseFlagOverride,
  type LtiLaunch,
  type LtiLaunchInfo,
  type LtiToolClient,
} from '../../../src/api';
import type { StudioUnitPage } from '../../../src/pages/studio/unit.page';
import { StudioLtiEditor } from '../../../src/pages/studio/editors/lti-editor';
import { issue, testId } from '../../../src/reporting';
import { LTI_TAGS, launchOf, ltiLabel, ltiUnit, openUnitAs } from './helpers';

/**
 * An LTI component that uses a reusable configuration from LTI Store
 * (TC-00661): the site operator keeps the tool's configuration in Django admin
 * and turns reusable configurations on for the course; the author points a new
 * LTI component at it by its filter key, entering no tool details; a learner
 * launches it under the configuration's own registration.
 *
 * The operator's half is setup, done through the admin account. The UI drives
 * the author's choice and the launch; the block's settings, the registration
 * values Studio shows and what the tool received decide.
 *
 * `LTI-003`: a configuration saved with the admin form's default "Redirect URIs"
 * (an empty list) cannot be launched — LTI Store hands the field over as the
 * text `[]`, which xblock-lti-consumer takes for a non-empty list instead of
 * falling back to the launch URL. The case is covered with the launch URL
 * listed, and the default is held as a `test.fail`.
 */

interface StoreCase {
  readonly page: Page;
  readonly config: AppConfig;
  readonly adminLms: AdminLmsRunner;
  readonly courseKey: string;
  readonly studioUnitPage: StudioUnitPage;
  readonly learner: RoundTripLearner;
  readonly tool: LtiToolClient;
}

/**
 * The whole case: the operator keeps a configuration (with `redirectUris`, or
 * the form's default), the author uses it from Studio, and the learner opens
 * the unit. Returns the slug, the registration Studio showed and the tool's
 * newest launch of the block.
 */
async function launchStoredConfiguration(
  c: StoreCase,
  testInfo: TestInfo,
  redirectUris?: readonly string[],
): Promise<{ slug: string; info: LtiLaunchInfo; blockKey: string; launch: LtiLaunch }> {
  // LTI Store keeps configurations by unique name and slug, across runs.
  const slug = `e2e-${getRunId()}-${testInfo.testId.slice(-6)}-r${testInfo.retry}`.toLowerCase();
  const platformPrivateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const toolPublicKey = await c.tool.publicKey();

  // The operator: reusable configurations on for the course, and the tool's
  // configuration kept in the store.
  const filterKey = await c.adminLms(async (admin) => {
    await setCourseFlagOverride(admin, c.config, c.courseKey, {
      flag: LTI_EXTERNAL_CONFIG_FLAG,
      choice: 'on',
      enabled: true,
      note: `e2e run ${getRunId()}`,
    });
    return createLtiStoreConfiguration(admin, c.config, {
      name: slug,
      slug,
      launchUrl: c.tool.launchUrl,
      oidcUrl: c.tool.oidcUrl,
      toolPublicKey,
      platformPrivateKey,
      ...(redirectUris === undefined ? {} : { redirectUris }),
    });
  });
  expect(filterKey).toBe(`lti_store:${slug}`);

  // The author adds an LTI Consumer and points it at the stored configuration.
  const request = c.page.request;
  const unit = await ltiUnit(request, c.config, c.courseKey, ltiLabel('store', testInfo));
  await c.studioUnitPage.goto(unit.usageKey);
  const tiles = availableComponentTypes(await fetchContainer(request, c.config, unit.usageKey));
  const blockKey = await c.studioUnitPage.addAdvancedComponent(
    tiles.indexOf('advanced'),
    'lti_consumer',
  );
  // The course flag reaches Studio's editor once its cached state refreshes.
  await expect
    .poll(() => ltiEditorOffersConfigType(request, c.config, blockKey), {
      message: 'the LTI editor offers reusable configurations in this course',
      timeout: TIMEOUTS.contentPublish,
    })
    .toBe(true);
  const editor = new StudioLtiEditor(await c.studioUnitPage.openLegacyEditor(blockKey));
  await editor.useReusableConfiguration(filterKey);
  await c.studioUnitPage.saveLegacyEditor(editor.frame, LTI_EDITOR_SELECTORS.save, {
    handler: 'submit_studio_edits',
  });

  const { metadata } = await fetchXBlock(request, c.config, blockKey);
  expect(metadata).toMatchObject({ config_type: 'external', external_config: filterKey });
  const info = await readLtiLaunchInfo(request, c.config, blockKey);
  await c.tool.register(info);
  await c.studioUnitPage.publish();

  await openUnitAs(c.learner, c.courseKey, unit);
  await c.learner.unitPage.ltiBlock(blockKey).waitForInlineLaunch();
  return { slug, info, blockKey, launch: await launchOf(c.tool, blockKey) };
}

test.describe(
  'LTI 1.3 reusable configuration (LTI Store)',
  { tag: [...LTI_TAGS, '@lti-store'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'an author uses a configuration kept in LTI Store, and a learner launches it',
      { annotation: testId('TC-00661') },
      async (
        {
          page,
          config,
          adminLms,
          contentCourse,
          studioAuthorSession,
          studioUnitPage,
          roundTripLearner,
          ltiTool,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        // The launch URL listed as the redirect URI (LTI-003: the default fails).
        const { slug, info, blockKey, launch } = await launchStoredConfiguration(
          {
            page,
            config,
            adminLms,
            courseKey: contentCourse.courseKey,
            studioUnitPage,
            learner: roundTripLearner,
            tool: ltiTool,
          },
          testInfo,
          [ltiTool.launchUrl],
        );
        // Studio shows the stored configuration's registration, keyed by its slug.
        expect(info.keysetUrl.endsWith(`/public_keysets/lti_store/${slug}`)).toBe(true);
        expect(info.tokenUrl.endsWith(`/token/lti_store/${slug}`)).toBe(true);
        expect(info.deploymentId).toBe('1');

        expect(launch.error).toBeUndefined();
        expect(launch).toMatchObject({
          verified: true,
          clientId: info.clientId,
          resourceLinkId: blockKey,
          messageType: 'LtiResourceLinkRequest',
        });
      },
    );

    test(
      'a configuration left with the default redirect URIs launches',
      {
        annotation: [
          testId('TC-00661'),
          issue('https://github.com/open-craft/openedx-ltistore/issues/57'),
        ],
      },
      async (
        {
          page,
          config,
          adminLms,
          contentCourse,
          studioAuthorSession,
          studioUnitPage,
          roundTripLearner,
          ltiTool,
        },
        testInfo,
      ) => {
        test.fail(
          true,
          'LTI-003: LTI Store hands its default Redirect URIs over as the text "[]", which ' +
            'xblock-lti-consumer takes for a list that lacks the launch URL, so the launch is ' +
            'refused: https://github.com/open-craft/openedx-ltistore/issues/57',
        );
        void studioAuthorSession;
        const { info, launch } = await launchStoredConfiguration(
          {
            page,
            config,
            adminLms,
            courseKey: contentCourse.courseKey,
            studioUnitPage,
            learner: roundTripLearner,
            tool: ltiTool,
          },
          testInfo,
        );
        expect(launch).toMatchObject({ verified: true, clientId: info.clientId });
      },
    );
  },
);
