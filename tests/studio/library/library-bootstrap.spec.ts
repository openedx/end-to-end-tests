import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { waitForMigration, waitForSyncAvailable } from '../../../src/steps';
import {
  DEFAULT_COURSE_ORG,
  LibraryDeleteRestrictedError,
  acceptSync,
  addCollectionItems,
  addContainerChildren,
  addLegacyLibraryBlock,
  commitLibrary,
  createCollection,
  createLegacyLibrary,
  createLibrary,
  createLibraryBlock,
  createLibraryContainer,
  createXBlock,
  declineSync,
  deleteLibrary,
  fetchContainerHierarchy,
  fetchDownstream,
  fetchLibrary,
  fetchLibraryBlock,
  fetchLibraryBlockOlx,
  fetchLibraryContainerChildren,
  fetchLibraryTeam,
  listLibraries,
  updateLibrary,
  fetchStudioHome,
  fetchStudioUsername,
  libraryOlx,
  listDownstreams,
  listLegacyLibraries,
  listLibraryBlocks,
  newLibrarySlug,
  publishLibraryBlock,
  setLibraryBlockOlx,
  startMigration,
  importLibraryContent,
} from '../../../src/api';

/**
 * The library layer's own contract (Epic 10 plan §3 step 2): the v2 client, the
 * course-side import and sync, and the legacy migration work end to end **with
 * no UI**, so a broken session or a changed API shape is reported here rather
 * than as a confusing failure in a library spec. No BTR case maps to these.
 *
 * Same user in browser and API → `page.request`, never `request`
 * (see `tests/studio/home/course-lifecycle.spec.ts`).
 */
test.describe(
  'Content libraries bootstrap',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@content-libraries'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test('a library authored through the API can be reused in a course and kept in sync', async ({
      page,
      config,
      studioAuthorSession,
      resyncStudioAuthor,
      contentCourse,
    }) => {
      void studioAuthorSession;
      const request = page.request;
      const org = config.org ?? DEFAULT_COURSE_ORG;

      const home = await fetchStudioHome(request, config);
      expect(home.librariesV2Enabled).toBe(true);

      const slug = newLibrarySlug('boot');
      const library = await createLibrary(request, config, {
        org,
        slug,
        title: `Bootstrap ${slug}`,
      });
      expect(library.id).toBe(`lib:${org}:${slug}`);
      const me = await fetchStudioUsername(request, config);
      expect(await fetchLibraryTeam(request, config, library.id)).toEqual([
        expect.objectContaining({ username: me, access_level: 'admin' }),
      ]);

      // Components: create, write OLX, read it back, publish.
      const text = await createLibraryBlock(request, config, library.id, { blockType: 'html' });
      const marker = `bootstrap-${slug}`;
      await setLibraryBlockOlx(request, config, text.id, libraryOlx.html(`Text ${slug}`, marker));
      expect(await fetchLibraryBlockOlx(request, config, text.id)).toContain(marker);
      expect((await fetchLibraryBlock(request, config, text.id)).has_unpublished_changes).toBe(
        true,
      );
      const problem = await createLibraryBlock(request, config, library.id, {
        blockType: 'problem',
      });

      // Containers and a collection.
      const unit = await createLibraryContainer(
        request,
        config,
        library.id,
        'unit',
        `Unit ${slug}`,
      );
      await addContainerChildren(request, config, unit.id, [text.id, problem.id]);
      expect(
        (await fetchLibraryContainerChildren(request, config, unit.id)).map((c) => c.id),
      ).toEqual([text.id, problem.id]);
      const collection = await createCollection(request, config, library.id, `Coll ${slug}`);
      expect(await addCollectionItems(request, config, library.id, collection.key, [text.id])).toBe(
        1,
      );
      expect((await fetchLibraryBlock(request, config, text.id)).collections).toEqual([
        { key: collection.key, title: collection.title },
      ]);
      const hierarchy = await fetchContainerHierarchy(request, config, unit.id);
      expect(hierarchy.components.map((c) => c.id)).toEqual([text.id, problem.id]);

      await commitLibrary(request, config, library.id);
      expect((await fetchLibrary(request, config, library.id)).has_unpublished_changes).toBe(false);
      expect((await listLibraryBlocks(request, config, library.id)).count).toBe(2);

      // Course side: the v2 library writes above desync this context's Studio
      // session (the CMS rotates it on write); re-sync through the browser before
      // the legacy `/xblock/` writes. `resyncStudioAuthor` rather than the API
      // SSO handshake so a prior test's learner (a stale LMS half) can't turn the
      // re-sync into a corruption.
      await resyncStudioAuthor();
      const chapter = await createXBlock(request, config, {
        parentLocator: `block-v1:${contentCourse.courseKey.slice('course-v1:'.length)}+type@course+block@course`,
        category: 'chapter',
        displayName: `Library bootstrap ${slug}`,
      });
      const sequential = await createXBlock(request, config, {
        parentLocator: chapter,
        category: 'sequential',
        displayName: 'Subsection',
      });
      const vertical = await createXBlock(request, config, {
        parentLocator: sequential,
        category: 'vertical',
        displayName: 'Unit',
      });
      const imported = await importLibraryContent(request, config, {
        parentLocator: vertical,
        category: 'html',
        libraryContentKey: text.id,
      });
      expect(imported.upstreamRef).toBe(text.id);
      const link = await fetchDownstream(request, config, imported.locator);
      expect(link).toMatchObject({ upstream_ref: text.id, ready_to_sync: false });
      expect(link.version_synced).toBe(link.version_available);
      // The course-wide downstream list is eventually consistent with the import
      // (CI read `[]` straight after it), so poll it rather than read once.
      await expect
        .poll(
          async () =>
            (await listDownstreams(request, config, contentCourse.courseKey)).map(
              (row) => row.downstream_usage_key,
            ),
          { timeout: TIMEOUTS.librarySync },
        )
        .toContain(imported.locator);

      // A library edit + publish makes the course block ready to sync; accept it.
      await setLibraryBlockOlx(
        request,
        config,
        text.id,
        libraryOlx.html(`Text ${slug} v2`, `${marker}-v2`),
      );
      await publishLibraryBlock(request, config, text.id);
      const available = await waitForSyncAvailable(request, config, imported.locator);
      expect(available.last).toMatchObject({ ready_to_sync: true });
      const synced = await acceptSync(request, config, imported.locator);
      expect(synced.ready_to_sync).toBe(false);
      expect(synced.version_synced).toBe(synced.version_available);

      // The next edit is declined and stays declined.
      await setLibraryBlockOlx(
        request,
        config,
        text.id,
        libraryOlx.html(`Text ${slug} v3`, `${marker}-v3`),
      );
      await commitLibrary(request, config, library.id);
      expect((await waitForSyncAvailable(request, config, imported.locator)).last).toMatchObject({
        ready_to_sync: true,
      });
      await declineSync(request, config, imported.locator);
      const declined = await fetchDownstream(request, config, imported.locator);
      expect(declined.ready_to_sync).toBe(false);
      expect(declined.version_declined).toBe(declined.version_available);

      // Teardown is best effort: this library held a unit, so the platform refuses (LIB-001).
      await deleteLibrary(request, config, library.id).catch((error: unknown) => {
        expect(error).toBeInstanceOf(LibraryDeleteRestrictedError);
      });
    });

    test('the library fixtures hand out a seeded library, a fresh library and colleagues', async ({
      page,
      config,
      studioAuthorSession,
      seededLibrary,
      authoringLibrary,
      studioColleague,
    }) => {
      void studioAuthorSession;
      const request = page.request;

      // The shared library is published and holds the seeded shape.
      const shared = await fetchLibrary(request, config, seededLibrary.libraryKey);
      expect(shared.has_unpublished_changes).toBe(false);
      expect((await listLibraryBlocks(request, config, seededLibrary.libraryKey)).count).toBe(4);
      expect(
        (await fetchLibraryContainerChildren(request, config, seededLibrary.units.unit.id)).map(
          (c) => c.id,
        ),
      ).toEqual([seededLibrary.blocks.text.id, seededLibrary.blocks.problem.id]);
      expect(authoringLibrary.num_blocks).toBe(0);
      expect(authoringLibrary.id).not.toBe(seededLibrary.libraryKey);

      // A Studio user with no role is refused; a `read` member may read but not
      // write; with public read on, the unaffiliated Studio user may read too.
      const outsider = await studioColleague();
      const reader = await studioColleague({
        libraryAccess: { libraryKey: authoringLibrary.id, level: 'read' },
      });
      await expect(
        fetchLibrary(outsider.request, config, authoringLibrary.id),
      ).rejects.toMatchObject({
        status: 403,
      });
      expect((await fetchLibrary(reader.request, config, authoringLibrary.id)).id).toBe(
        authoringLibrary.id,
      );
      await expect(
        createLibraryBlock(reader.request, config, authoringLibrary.id, { blockType: 'html' }),
      ).rejects.toMatchObject({ status: 403 });
      await updateLibrary(request, config, authoringLibrary.id, { allowPublicRead: true });
      expect(
        (await fetchLibrary(outsider.request, config, authoringLibrary.id)).allow_public_read,
      ).toBe(true);
      expect(
        (
          await listLibraries(outsider.request, config, {
            org: authoringLibrary.org,
            textSearch: authoringLibrary.slug,
          })
        ).results.map((l) => l.id),
      ).toContain(authoringLibrary.id);
      await updateLibrary(request, config, authoringLibrary.id, { allowPublicRead: false });
      await expect(
        fetchLibrary(outsider.request, config, authoringLibrary.id),
      ).rejects.toMatchObject({
        status: 403,
      });
    });

    test(
      'a legacy library migrates into a v2 library',
      { tag: '@content-libraries-v1' },
      async ({ page, config, studioAuthorSession }) => {
        void studioAuthorSession;
        const request = page.request;
        const org = config.org ?? DEFAULT_COURSE_ORG;
        const slug = newLibrarySlug('mig');

        const home = await fetchStudioHome(request, config);
        expect(home.librariesV1Enabled).toBe(true);

        const legacyKey = await createLegacyLibrary(request, config, {
          org,
          number: slug.replace(/-/g, ''),
          displayName: `Legacy ${slug}`,
        });
        await addLegacyLibraryBlock(request, config, legacyKey, 'html', `Legacy text ${slug}`);
        await addLegacyLibraryBlock(
          request,
          config,
          legacyKey,
          'problem',
          `Legacy problem ${slug}`,
        );
        const target = await createLibrary(request, config, { org, slug, title: `Target ${slug}` });

        const task = await startMigration(request, config, legacyKey, target.id);
        const migration = await waitForMigration(request, config, task.uuid);
        expect(migration.last).toMatchObject({ state: 'Succeeded' });

        const blocks = await listLibraryBlocks(request, config, target.id);
        expect(blocks.results.map((b) => b.display_name).sort()).toEqual(
          [`Legacy problem ${slug}`, `Legacy text ${slug}`].sort(),
        );
        const legacy = (await listLegacyLibraries(request, config)).find(
          (l) => l.library_key === legacyKey,
        );
        expect(legacy).toMatchObject({ is_migrated: true, migrated_to_key: target.id });

        // Component-only library: the delete works (no LIB-001 here).
        await deleteLibrary(request, config, target.id);
      },
    );
  },
);
