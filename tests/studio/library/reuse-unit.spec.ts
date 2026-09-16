import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS } from '../../../src/config';
import {
  addContainerChildren,
  commitLibrary,
  createLibraryContainer,
  createXBlock,
  courseUsageKey,
  fetchContainerChildren,
  fetchDownstream,
  publishLibraryContainer,
  publishXBlock,
  renameLibraryContainer,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { reuseInCourse, waitForLearnerBlock, waitForSyncAvailable } from '../../../src/steps';
import { LIBRARY_A11Y_BASELINE, LIBRARY_TAGS, authorTextBlock, label } from './helpers';

/**
 * Reusing a published library **unit** in a course (TC-00347) and accepting /
 * rejecting the library's later updates to it (TC-00348), asserted from the
 * learner's context.
 *
 * The reuse itself is the platform import the outline's Add sidebar calls
 * (`POST /xblock/` with the unit's `library_content_key`); that sidebar is the
 * authoring-MFE surface Epic 11 builds page objects for, so here the import is
 * driven through the API and the **sync** through the course's Libraries page
 * ("Review Content Updates"), which both supported releases render.
 */
test.describe(
  'Library units reused in a course',
  { tag: ['@regression', '@mfe-learning', ...LIBRARY_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a published library unit added to the outline reaches the learner with its components',
      { annotation: testId('TC-00347') },
      async (
        {
          page,
          config,
          studioAuthorSession,
          resyncStudioAuthor,
          workerLibrary,
          contentCourse,
          roundTripLearnerLater,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        await resyncStudioAuthor();
        const { unit } = workerLibrary.units;
        const chapter = await createXBlock(page.request, config, {
          parentLocator: courseUsageKey(contentCourse.courseKey),
          category: 'chapter',
          displayName: label('reuse-unit', testInfo.testId),
        });
        const sequential = await createXBlock(page.request, config, {
          parentLocator: chapter,
          category: 'sequential',
          displayName: label('subsection', testInfo.testId),
        });

        const imported = await reuseInCourse(page.request, config, {
          parentLocator: sequential,
          category: 'vertical',
          libraryContentKey: unit.id,
        });
        expect(imported.upstreamRef).toBe(unit.id);
        const children = await fetchContainerChildren(page.request, config, imported.locator);
        expect(children.map((c) => c.block_type)).toEqual(['html', 'problem']);
        expect(children.map((c) => c.upstream_link?.upstream_ref)).toEqual([
          workerLibrary.blocks.text.id,
          workerLibrary.blocks.problem.id,
        ]);

        await publishXBlock(page.request, config, imported.locator);
        const roundTripLearner = await roundTripLearnerLater();
        const seen = await waitForLearnerBlock(roundTripLearner.outline, imported.locator);
        expect(seen.satisfied, `learner outline blocks: ${seen.last.join(', ')}`).toBe(true);
        const outline = await roundTripLearner.outline();
        expect(outline.blocks[imported.locator]?.display_name).toBe(unit.display_name);
        for (const child of children) {
          expect(outline.blocks[child.block_id]?.type).toBe(child.block_type);
        }
      },
    );

    test(
      'library unit updates are accepted or rejected from the course Libraries page',
      { annotation: testId('TC-00348') },
      async (
        {
          page,
          config,
          studioAuthorSession,
          resyncStudioAuthor,
          authoringLibrary,
          authoringCourse,
          authoringCourseLearnerLater,
          courseLibrariesPage,
          previewChangesDialog,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        await resyncStudioAuthor();
        const title = label('unit', testInfo.testId);
        const block = await authorTextBlock(
          page.request,
          config,
          authoringLibrary.id,
          `${title} text`,
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
          parentLocator: courseUsageKey(authoringCourse.courseKey),
          category: 'chapter',
          displayName: label('sync-unit', testInfo.testId),
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
        await publishXBlock(page.request, config, imported.locator);
        const roundTripLearner = await authoringCourseLearnerLater();
        expect(
          (await waitForLearnerBlock(roundTripLearner.outline, imported.locator)).satisfied,
        ).toBe(true);

        // Accept a rename from the Review tab's preview.
        await renameLibraryContainer(page.request, config, unit.id, `${title} v2`);
        await publishLibraryContainer(page.request, config, unit.id);
        expect((await waitForSyncAvailable(page.request, config, imported.locator)).satisfied).toBe(
          true,
        );
        await courseLibrariesPage.waitForReviewCard(authoringCourse.courseKey, title);
        await checkA11y(page, {
          label: 'course-libraries',
          additionalBaseline: LIBRARY_A11Y_BASELINE,
        });
        await courseLibrariesPage.reviewUpdates(title);
        expect((await previewChangesDialog.accept()).status()).toBe(200);
        const accepted = await fetchDownstream(page.request, config, imported.locator);
        expect(accepted.version_synced).toBe(accepted.version_available);
        await publishXBlock(page.request, config, imported.locator);
        await expect
          .poll(
            async () => (await roundTripLearner.outline()).blocks[imported.locator]?.display_name,
            {
              timeout: TIMEOUTS.contentPublish,
            },
          )
          .toBe(`${title} v2`);

        // Reject the next rename from the card's Ignore.
        await renameLibraryContainer(page.request, config, unit.id, `${title} v3`);
        await publishLibraryContainer(page.request, config, unit.id);
        expect((await waitForSyncAvailable(page.request, config, imported.locator)).satisfied).toBe(
          true,
        );
        await courseLibrariesPage.waitForReviewCard(authoringCourse.courseKey, title);
        expect((await courseLibrariesPage.ignore(title)).status()).toBe(204);
        const declined = await fetchDownstream(page.request, config, imported.locator);
        expect(declined.version_declined).toBe(declined.version_available);
        expect(declined.ready_to_sync).toBe(false);
        await publishXBlock(page.request, config, imported.locator);
        await expect
          .poll(
            async () => (await roundTripLearner.outline()).blocks[imported.locator]?.display_name,
            {
              timeout: TIMEOUTS.contentPublish,
            },
          )
          .toBe(`${title} v2`);
      },
    );
  },
);
