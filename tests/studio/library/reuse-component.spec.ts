import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  commitLibrary,
  fetchContainer,
  fetchDownstream,
  fetchXBlock,
  libraryOlx,
  publishLibraryBlock,
  publishXBlock,
  setLibraryBlockOlx,
  importLibraryContent,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { waitForLearnerBlock, waitForSyncAvailable } from '../../../src/steps';
import { LIBRARY_A11Y_BASELINE, LIBRARY_TAGS, authorTextBlock, label } from './helpers';

/**
 * Reusing a published library component in a course unit (TC-00345) and
 * accepting / rejecting the library's later updates from the unit page
 * (TC-00346) — the epic's acceptance bar: both cases end in the learner's own
 * context, reading the course block the library content became.
 *
 * Session discipline (see `seededLibrary` in `src/fixtures`): the seeded library
 * lives on `page.request`, whose Studio session the v2 writes rotate, so the
 * body re-syncs it once with `establishStudioSession` **before** provisioning a
 * learner — a learner leaves the author's LMS session stale and the handshake
 * would then corrupt the CMS session. The learner half runs last, through
 * `roundTripLearnerLater`.
 */
test.describe(
  'Library content reused in a course',
  { tag: ['@regression', '@mfe-learning', ...LIBRARY_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a published library component added to a unit reaches the learner',
      { tag: '@smoke', annotation: testId('TC-00345') },
      async (
        {
          page,
          config,
          studioAuthorSession,
          resyncStudioAuthor,
          seededLibrary,
          contentCourse,
          roundTripLearnerLater,
          studioUnitPage,
          libraryPicker,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        const { text } = seededLibrary.blocks;
        // The fixture seeded the library on `page.request`; re-sync before any
        // course-side legacy write, and before any learner exists.
        await resyncStudioAuthor();
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          label('reuse', testInfo.testId),
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const subsectionKey = section.subsections[0]?.usageKey ?? '';

        await studioUnitPage.goto(unitKey);
        const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
        expect(types).toContain('library_v2');
        await studioUnitPage.openAddComponent(types.indexOf('library_v2'));
        await libraryPicker.selectLibrary(seededLibrary.libraryKey, seededLibrary.library.title);
        await libraryPicker
          .cardFor(text.display_name)
          .first()
          .waitFor({ timeout: TIMEOUTS.librarySearch });
        await checkA11y(page, {
          label: 'library-picker',
          additionalBaseline: LIBRARY_A11Y_BASELINE,
        });
        const added = (await (await libraryPicker.addToCourse(text.display_name)).json()) as {
          locator: string;
          upstreamRef: string;
        };
        expect(added.upstreamRef).toBe(text.id);
        expect(await fetchDownstream(page.request, config, added.locator)).toMatchObject({
          upstream_ref: text.id,
          ready_to_sync: false,
        });

        await publishXBlock(page.request, config, unitKey);

        // Learner half — provisioned only now, after the authoring is done.
        const learner = await roundTripLearnerLater();
        const seen = await waitForLearnerBlock(learner.outline, added.locator);
        expect(seen.satisfied, `learner outline blocks: ${seen.last.join(', ')}`).toBe(true);
        await learner.prime(subsectionKey);
        await learner.unitPage.goto(contentCourse.courseKey, subsectionKey, unitKey);
        await expect(learner.unitPage.block(added.locator)).toContainText(
          `${text.display_name} body`,
        );
      },
    );

    test(
      'library updates are accepted or rejected from the unit page and the learner sees the result',
      { tag: '@smoke', annotation: testId('TC-00346') },
      async (
        {
          page,
          config,
          studioAuthorSession,
          resyncStudioAuthor,
          seededLibrary,
          contentCourse,
          roundTripLearnerLater,
          studioUnitPage,
          previewChangesDialog,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        const { text } = seededLibrary.blocks;
        const marker = label('synced', testInfo.testId);
        // Our own markers, hoisted so the learner-side assertions read a variable,
        // never a literal (ARCHITECTURE.md: locators never depend on displayed text).
        const v1 = `${marker} v1`;
        const v2 = `${marker} v2`;
        const v3 = `${marker} v3`;
        // Re-sync once, before the course structure and before any learner.
        await resyncStudioAuthor();
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          label('sync', testInfo.testId),
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const subsectionKey = section.subsections[0]?.usageKey ?? '';

        await setLibraryBlockOlx(
          page.request,
          config,
          text.id,
          libraryOlx.html(text.display_name, v1),
        );
        await commitLibrary(page.request, config, seededLibrary.libraryKey);
        const imported = await importLibraryContent(page.request, config, {
          parentLocator: unitKey,
          category: 'html',
          libraryContentKey: text.id,
        });
        await publishXBlock(page.request, config, unitKey);

        const learner = await roundTripLearnerLater();
        await learner.prime(subsectionKey);
        await learner.unitPage.goto(contentCourse.courseKey, subsectionKey, unitKey);
        await expect(learner.unitPage.block(imported.locator)).toContainText(v1);

        // A published library edit becomes available; accept it from the unit page.
        await setLibraryBlockOlx(
          page.request,
          config,
          text.id,
          libraryOlx.html(text.display_name, v2),
        );
        await publishLibraryBlock(page.request, config, text.id);
        const acceptSync = await waitForSyncAvailable(page.request, config, imported.locator);
        expect(acceptSync.satisfied, JSON.stringify(acceptSync.last)).toBe(true);
        await studioUnitPage.goto(unitKey);
        await studioUnitPage.openUpdateAvailable(imported.locator);
        await previewChangesDialog.showVersion('old');
        await previewChangesDialog.showVersion('new');
        expect((await previewChangesDialog.accept()).status()).toBe(200);
        const accepted = await fetchDownstream(page.request, config, imported.locator);
        expect(accepted.ready_to_sync).toBe(false);
        expect(accepted.version_synced).toBe(accepted.version_available);
        await publishXBlock(page.request, config, unitKey);
        await learner.unitPage.goto(contentCourse.courseKey, subsectionKey, unitKey);
        await expect(learner.unitPage.block(imported.locator)).toContainText(v2);

        // The next edit is declined from the unit page and the learner keeps v2.
        await setLibraryBlockOlx(
          page.request,
          config,
          text.id,
          libraryOlx.html(text.display_name, v3),
        );
        await publishLibraryBlock(page.request, config, text.id);
        const declineSync = await waitForSyncAvailable(page.request, config, imported.locator);
        expect(declineSync.satisfied, JSON.stringify(declineSync.last)).toBe(true);
        await studioUnitPage.goto(unitKey);
        await studioUnitPage.openUpdateAvailable(imported.locator);
        expect((await previewChangesDialog.ignore()).status()).toBe(204);
        const declined = await fetchDownstream(page.request, config, imported.locator);
        expect(declined.ready_to_sync).toBe(false);
        expect(declined.version_declined).toBe(declined.version_available);
        await publishXBlock(page.request, config, unitKey);
        await learner.unitPage.goto(contentCourse.courseKey, subsectionKey, unitKey);
        await expect(learner.unitPage.block(imported.locator)).toContainText(v2);
      },
    );

    test(
      'library updates to a component are reviewed, accepted and ignored from the course Libraries page',
      { annotation: testId('TC-00346') },
      async (
        {
          page,
          config,
          studioAuthorSession,
          resyncStudioAuthor,
          authoringLibrary,
          authoringCourse,
          courseLibrariesPage,
          previewChangesDialog,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        await resyncStudioAuthor();
        // A library and a course of this test's own: the Review tab is fed by
        // the course's search index, which stays small (and so prompt) here.
        const title = label('reviewed', testInfo.testId);
        const version = (n: number) => `${title} v${n}`;
        const block = await authorTextBlock(
          page.request,
          config,
          authoringLibrary.id,
          title,
          version(1),
        );
        await commitLibrary(page.request, config, authoringLibrary.id);
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          label('review', testInfo.testId),
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const imported = await importLibraryContent(page.request, config, {
          parentLocator: unitKey,
          category: 'html',
          libraryContentKey: block.id,
        });
        await publishXBlock(page.request, config, unitKey);
        const publishVersion = async (n: number) => {
          await setLibraryBlockOlx(
            page.request,
            config,
            block.id,
            libraryOlx.html(title, version(n)),
          );
          await publishLibraryBlock(page.request, config, block.id);
          const sync = await waitForSyncAvailable(page.request, config, imported.locator);
          expect(sync.satisfied, JSON.stringify(sync.last)).toBe(true);
        };

        // A published library edit is listed under "Review Content Updates";
        // "Review Updates" opens the old / new comparison, and accepting applies it.
        await publishVersion(2);
        await courseLibrariesPage.waitForReviewCard(authoringCourse.courseKey, title);
        // The tab counts what awaits review: this one component.
        await expect
          .poll(async () => Number(await courseLibrariesPage.reviewCount.textContent()))
          .toBe(1);
        await courseLibrariesPage.reviewUpdates(title);
        await previewChangesDialog.showVersion('old');
        await previewChangesDialog.showVersion('new');
        expect((await previewChangesDialog.accept()).status()).toBe(200);
        const accepted = await fetchDownstream(page.request, config, imported.locator);
        expect(accepted.ready_to_sync).toBe(false);
        expect(accepted.version_synced).toBe(accepted.version_available);
        expect((await fetchXBlock(page.request, config, imported.locator)).data).toContain(
          version(2),
        );

        // The next edit is ignored from the same comparison: the course keeps v2.
        await publishVersion(3);
        await courseLibrariesPage.waitForReviewCard(authoringCourse.courseKey, title);
        await courseLibrariesPage.reviewUpdates(title);
        expect((await previewChangesDialog.ignore()).status()).toBe(204);
        const declined = await fetchDownstream(page.request, config, imported.locator);
        expect(declined.ready_to_sync).toBe(false);
        expect(declined.version_declined).toBe(declined.version_available);
        expect((await fetchXBlock(page.request, config, imported.locator)).data).toContain(
          version(2),
        );
      },
    );
  },
);
