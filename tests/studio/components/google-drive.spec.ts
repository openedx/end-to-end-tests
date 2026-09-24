import { expect, test } from '../../../src/fixtures';
import { ADVANCED_BLOCK_SELECTORS, LEGACY_EDITOR_SELECTORS, TIMEOUTS } from '../../../src/config';
import {
  buildSection,
  createXBlock,
  fetchXBlock,
  publishXBlock,
  uploadAsset,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Using the Google Document component (xblock-google-drive): the author pastes
 * an embed code into the block's own Studio editor and a learner views the
 * document in the courseware.
 *
 * The embedded page is a file the test uploads to the course, not a Google
 * document: the block renders any embed code as given, so this keeps "the
 * learner can view it" assertable on an install with no route to Google. The
 * block, its editor and its rendering are all the real thing.
 */
test.describe(
  'Google Document component',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'an author embeds a document and a learner views it',
      { annotation: testId('TC-00122') },
      async (
        { page, config, contentCourse, studioAuthorSession, studioUnitPage, roundTripLearnerLater },
        testInfo,
      ) => {
        void studioAuthorSession;
        const request = page.request;
        const { courseKey } = contentCourse;
        const suffix = `${testInfo.testId.slice(-6)}r${testInfo.retry}`;
        const asset = await uploadAsset(request, config, courseKey, {
          name: `e2e-document-${suffix}.html`,
          mimeType: 'text/html',
          buffer: Buffer.from(`<!doctype html><title>E2E</title><p>E2E document ${suffix}</p>`),
        });
        const section = await buildSection(request, config, courseKey, `E2E document ${suffix}`, {
          subsections: [{ units: [{ blocks: [] }] }],
        });
        const unit = section.units[0]!;
        const documentKey = await createXBlock(request, config, {
          parentLocator: unit.usageKey,
          category: 'google-document',
          displayName: 'E2E document',
        });
        const embed = `<iframe src="${asset.external_url}" width="640" height="480"></iframe>`;

        await studioUnitPage.goto(unit.usageKey);
        const editor = await studioUnitPage.openLegacyEditor(documentKey);
        await editor.locator(LEGACY_EDITOR_SELECTORS.embedCode).fill(embed);
        const saved = await studioUnitPage.saveLegacyEditor(
          editor,
          LEGACY_EDITOR_SELECTORS.documentSave,
        );
        expect(saved.ok()).toBe(true);
        expect((await fetchXBlock(request, config, documentKey)).metadata.embed_code).toContain(
          asset.external_url,
        );
        await publishXBlock(request, config, unit.usageKey);

        const learner = await roundTripLearnerLater();
        await expect
          .poll(async () => (await learner.outline()).blocks[documentKey]?.type, {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe('google-document');
        await learner.prime(unit.sequentialUsageKey);
        await learner.unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
        const frame = learner.unitPage
          .advancedBlock(documentKey, 'google-document')
          .rendered.locator(ADVANCED_BLOCK_SELECTORS.embedFrame);
        await expect(frame).toHaveAttribute('src', asset.external_url);
        // The embedded document is served to the learner.
        expect((await learner.request.get(asset.external_url)).status()).toBe(200);
      },
    );
  },
);
