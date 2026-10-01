import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import {
  ADVANCED_BLOCK_SELECTORS,
  STUDIO_EDITOR_SELECTORS,
  TIMEOUTS,
  advancedBlockRoot,
} from '../../../src/config';
import {
  advancedComponentTypes,
  availableComponentTypes,
  buildSection,
  createXBlock,
  fetchContainer,
  fetchPdfFields,
  publishXBlock,
  updateXBlock,
  uploadAsset,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { addComponentAndSeeAsLearner, emptyUnit } from './component-helpers';

/** A minimal, valid PDF document: the bytes are the test's own. */
const pdfBytes = (label: string) =>
  Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

/** The asset URL an upload answered with (`asset.external_url`, on the LMS). */
async function uploadedUrl(response: { json(): Promise<unknown> }): Promise<string> {
  const body = (await response.json()) as { asset?: { external_url?: string } };
  const url = body.asset?.external_url;
  if (url === undefined) throw new Error('The PDF upload answered without an asset URL.');
  return url;
}

/**
 * The PDF component (xblocks-contrib `pdf`): added from the Advanced tile and
 * set up in its editor (TC-00508), edited (TC-00509), and seen by a learner
 * (TC-00511). `TC-00512` (a PDF from a content library) lives in
 * `tests/studio/library/pdf-from-library.spec.ts`.
 *
 * The editor uploads the file to the course's Files and saves the block's
 * fields; the block read back decides, and the preview and the learner's
 * courseware show that file — a course asset, never a third-party document.
 */
test.describe(
  'Studio PDF component',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning', '@pdf-xblock'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'adds a PDF component a learner can see',
      { annotation: testId('TC-00511') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        const probeUnit = await emptyUnit(
          page.request,
          config,
          authoringCourse.courseKey,
          'pdf-probe',
        );
        const advanced = advancedComponentTypes(
          await fetchContainer(page.request, config, probeUnit),
        );
        expect(advanced).toContain('pdf');

        await addComponentAndSeeAsLearner(
          page.request,
          config,
          authoringCourse.courseKey,
          authoringCourseLearner,
          'pdf',
          'pdf',
        );
      },
    );

    test(
      'adds a PDF from the Advanced tile and sets its file in the editor',
      { annotation: testId('TC-00508') },
      async ({
        page,
        config,
        authoringCourse,
        studioAuthorSession,
        studioUnitPage,
        studioPdfEditor,
      }) => {
        void studioAuthorSession;
        const request = page.request;
        const unitKey = await emptyUnit(request, config, authoringCourse.courseKey, 'pdf-add');
        const tiles = availableComponentTypes(await fetchContainer(request, config, unitKey));
        expect(advancedComponentTypes(await fetchContainer(request, config, unitKey))).toContain(
          'pdf',
        );

        await studioUnitPage.goto(unitKey);
        const pdfKey = await studioUnitPage.addAdvancedComponent(tiles.indexOf('advanced'), 'pdf');
        // The editor opens on the new block.
        const upload = await studioPdfEditor.chooseFile({
          name: `e2e-${pdfKey.slice(-8)}.pdf`,
          buffer: pdfBytes('TC-00508'),
        });
        expect(upload.ok()).toBe(true);
        const url = await uploadedUrl(upload);
        await checkA11y(page, {
          label: 'studio-pdf-editor',
          include: STUDIO_EDITOR_SELECTORS.editorDialog,
        });
        const saved = await studioPdfEditor.save();
        expect(saved.ok()).toBe(true);

        expect((await fetchPdfFields(request, config, pdfKey)).url).toBe(url);
        await expect(
          studioUnitPage
            .component(pdfKey)
            .locator(advancedBlockRoot('pdf'))
            .locator(ADVANCED_BLOCK_SELECTORS.embedFrame),
        ).toHaveAttribute('src', url);
      },
    );

    test(
      'edits a PDF: replaces its file, hides the download link, links the source',
      { annotation: testId('TC-00509') },
      async (
        {
          page,
          config,
          authoringCourse,
          studioAuthorSession,
          studioUnitPage,
          studioPdfEditor,
          authoringCourseLearnerLater,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        const request = page.request;
        const { courseKey } = authoringCourse;
        const suffix = `${testInfo.testId.slice(-6)}r${testInfo.retry}`;
        const first = await uploadAsset(request, config, courseKey, {
          name: `e2e-first-${suffix}.pdf`,
          mimeType: 'application/pdf',
          buffer: pdfBytes('first'),
        });
        const section = await buildSection(request, config, courseKey, `E2E pdf edit ${suffix}`, {
          subsections: [{ units: [{ blocks: [] }] }],
        });
        const unit = section.units[0]!;
        const pdfKey = await createXBlock(request, config, {
          parentLocator: unit.usageKey,
          category: 'pdf',
          displayName: 'E2E PDF',
        });
        await updateXBlock(request, config, pdfKey, { fields: { url: first.external_url } });

        await studioUnitPage.goto(unit.usageKey);
        await studioUnitPage.editComponentInIframe(pdfKey);
        const replaced = await studioPdfEditor.chooseFile({
          name: `e2e-second-${suffix}.pdf`,
          buffer: pdfBytes('second'),
        });
        const url = await uploadedUrl(replaced);
        const source = {
          url: `https://example.org/e2e-source-${suffix}`,
          text: `E2E source ${suffix}`,
        };
        await studioPdfEditor.setAllowDownload(false);
        await studioPdfEditor.setSource(source.url, source.text);
        expect((await studioPdfEditor.save()).ok()).toBe(true);

        expect(await fetchPdfFields(request, config, pdfKey)).toMatchObject({
          url,
          allowDownload: false,
          sourceUrl: source.url,
          sourceText: source.text,
        });
        await publishXBlock(request, config, unit.usageKey);

        // The learner sees the new file, the source link and no download link.
        const learner = await authoringCourseLearnerLater();
        await expect
          .poll(async () => (await learner.outline()).blocks[pdfKey]?.type, {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe('pdf');
        await learner.prime(unit.sequentialUsageKey);
        await learner.unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
        const block = learner.unitPage.advancedBlock(pdfKey, 'pdf').rendered;
        await expect(block.locator(ADVANCED_BLOCK_SELECTORS.embedFrame)).toHaveAttribute(
          'src',
          url,
        );
        const links = block.locator(ADVANCED_BLOCK_SELECTORS.pdfLink);
        await expect(links).toHaveCount(1);
        await expect(links).toHaveAttribute('href', source.url);
        await expect(links).toHaveText(source.text);
        const served = await learner.request.get(url);
        expect(served.status()).toBe(200);
        expect(served.headers()['content-type']).toContain('application/pdf');
      },
    );
  },
);
