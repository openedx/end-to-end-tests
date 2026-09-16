import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  addContainerChildren,
  buildSection,
  commitLibrary,
  createLibraryContainer,
  createXBlock,
  courseUsageKey,
  fetchContainerChildren,
  fetchDownstream,
  libraryOlx,
  publishLibraryBlock,
  publishXBlock,
  setLibraryBlockOlx,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { reuseInCourse, waitForLearnerBlock, waitForSyncAvailable } from '../../../src/steps';
import { LIBRARY_TAGS, authorTextBlock, label } from './helpers';

/**
 * Course-side overrides of library-sourced content: the text of a standalone
 * component (TC-00366), the text of a component inside a reused unit
 * (TC-00367) and a component's title (TC-00368). Each override is made in the
 * course's component editor, recorded by the platform in
 * `downstream_customized`, seen by the learner, and **kept** when a later
 * library update is accepted.
 */
test.describe(
  'Overrides of library content in a course',
  { tag: ['@regression', '@mfe-learning', ...LIBRARY_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'overrides a standalone text component and the override survives a sync',
      { annotation: testId('TC-00366') },
      async (
        {
          page,
          config,
          studioAuthorSession,
          resyncStudioAuthor,
          authoringLibrary,
          contentCourse,
          roundTripLearnerLater,
          studioUnitPage,
          studioTextEditor,
          previewChangesDialog,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        await resyncStudioAuthor();
        const title = label('override', testInfo.testId);
        const block = await authorTextBlock(
          page.request,
          config,
          authoringLibrary.id,
          title,
          `${title} library`,
        );
        await commitLibrary(page.request, config, authoringLibrary.id);
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          label('ovr', testInfo.testId),
          {
            subsections: [{ units: [{ blocks: [] }] }],
          },
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const subsectionKey = section.subsections[0]?.usageKey ?? '';
        const imported = await reuseInCourse(page.request, config, {
          parentLocator: unitKey,
          category: 'html',
          libraryContentKey: block.id,
        });

        // Override the text in the course's editor.
        const override = `${title} course override`;
        await studioUnitPage.goto(unitKey);
        await studioUnitPage.editComponentInIframe(imported.locator);
        await studioTextEditor.focus();
        await page.keyboard.press('Control+a');
        await studioTextEditor.type(override);
        await studioTextEditor.save();
        expect(
          (await fetchDownstream(page.request, config, imported.locator)).downstream_customized,
        ).toContain('data');

        await publishXBlock(page.request, config, unitKey);
        const roundTripLearner = await roundTripLearnerLater();
        expect(
          (await waitForLearnerBlock(roundTripLearner.outline, imported.locator)).satisfied,
        ).toBe(true);
        await roundTripLearner.prime(subsectionKey);
        await roundTripLearner.unitPage.goto(contentCourse.courseKey, subsectionKey, unitKey);
        await expect(roundTripLearner.unitPage.block(imported.locator)).toContainText(override);

        // A library update arrives; keeping course content preserves the override.
        await setLibraryBlockOlx(
          page.request,
          config,
          block.id,
          libraryOlx.html(title, `${title} library v2`),
        );
        await publishLibraryBlock(page.request, config, block.id);
        expect((await waitForSyncAvailable(page.request, config, imported.locator)).satisfied).toBe(
          true,
        );
        await studioUnitPage.goto(unitKey);
        await studioUnitPage.openUpdateAvailable(imported.locator);
        await previewChangesDialog.keepCourseContent();
        expect(
          (await fetchDownstream(page.request, config, imported.locator)).downstream_customized,
        ).toContain('data');
        await publishXBlock(page.request, config, unitKey);
        await roundTripLearner.unitPage.goto(contentCourse.courseKey, subsectionKey, unitKey);
        await expect(roundTripLearner.unitPage.block(imported.locator)).toContainText(override);
      },
    );

    test(
      'overrides a text component inside a reused library unit',
      { annotation: testId('TC-00367') },
      async (
        {
          page,
          config,
          studioAuthorSession,
          resyncStudioAuthor,
          authoringLibrary,
          contentCourse,
          roundTripLearnerLater,
          studioUnitPage,
          studioTextEditor,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        await resyncStudioAuthor();
        const title = label('in-unit', testInfo.testId);
        const block = await authorTextBlock(
          page.request,
          config,
          authoringLibrary.id,
          `${title} text`,
          `${title} library`,
        );
        const unit = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'unit',
          title,
        );
        await addContainerChildren(page.request, config, unit.id, [block.id]);
        await commitLibrary(page.request, config, authoringLibrary.id);
        const chapter = await createXBlock(page.request, config, {
          parentLocator: courseUsageKey(contentCourse.courseKey),
          category: 'chapter',
          displayName: label('ovr-unit', testInfo.testId),
        });
        const sequential = await createXBlock(page.request, config, {
          parentLocator: chapter,
          category: 'sequential',
          displayName: 'Subsection',
        });
        const imported = await reuseInCourse(page.request, config, {
          parentLocator: sequential,
          category: 'vertical',
          libraryContentKey: unit.id,
        });
        const [child] = await fetchContainerChildren(page.request, config, imported.locator);
        const childKey = child?.block_id ?? '';

        const override = `${title} course override`;
        await studioUnitPage.goto(imported.locator);
        await studioUnitPage.editComponentInIframe(childKey);
        await studioTextEditor.focus();
        await page.keyboard.press('Control+a');
        await studioTextEditor.type(override);
        await studioTextEditor.save();
        expect(
          (await fetchDownstream(page.request, config, childKey)).downstream_customized,
        ).toContain('data');

        await publishXBlock(page.request, config, imported.locator);
        const roundTripLearner = await roundTripLearnerLater();
        expect((await waitForLearnerBlock(roundTripLearner.outline, childKey)).satisfied).toBe(
          true,
        );
        await roundTripLearner.prime(sequential);
        await roundTripLearner.unitPage.goto(contentCourse.courseKey, sequential, imported.locator);
        await expect(roundTripLearner.unitPage.block(childKey)).toContainText(override);
      },
    );

    test(
      'overrides the title of a library-sourced component',
      { annotation: testId('TC-00368') },
      async (
        {
          page,
          config,
          studioAuthorSession,
          resyncStudioAuthor,
          authoringLibrary,
          contentCourse,
          roundTripLearnerLater,
          studioUnitPage,
          studioTextEditor,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        await resyncStudioAuthor();
        const title = label('titled', testInfo.testId);
        const block = await authorTextBlock(page.request, config, authoringLibrary.id, title);
        await commitLibrary(page.request, config, authoringLibrary.id);
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          label('ovr-title', testInfo.testId),
          {
            subsections: [{ units: [{ blocks: [] }] }],
          },
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const imported = await reuseInCourse(page.request, config, {
          parentLocator: unitKey,
          category: 'html',
          libraryContentKey: block.id,
        });

        const overriddenTitle = `${title} course title`;
        await studioUnitPage.goto(unitKey);
        await studioUnitPage.editComponentInIframe(imported.locator);
        await studioTextEditor.setTitle(overriddenTitle);
        await studioTextEditor.save();
        expect(
          (await fetchDownstream(page.request, config, imported.locator)).downstream_customized,
        ).toContain('display_name');

        await publishXBlock(page.request, config, unitKey);
        const roundTripLearner = await roundTripLearnerLater();
        expect(
          (await waitForLearnerBlock(roundTripLearner.outline, imported.locator)).satisfied,
        ).toBe(true);
        expect((await roundTripLearner.outline()).blocks[imported.locator]?.display_name).toBe(
          overriddenTitle,
        );
      },
    );
  },
);
