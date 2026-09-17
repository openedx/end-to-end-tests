import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS } from '../../../src/config';
import {
  addContainerChildren,
  createLibraryContainer,
  fetchContainerHierarchy,
  fetchLibraryContainer,
  fetchLibraryContainerChildren,
  type LibraryContainer,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { LIBRARY_A11Y_BASELINE, LIBRARY_TAGS, label } from './helpers';

/**
 * Sections and subsections in a content library: create (TC-00349, TC-00350),
 * rename (TC-00351, TC-00352), publish a subsection (TC-00354), delete
 * (TC-00355, TC-00356 — a deleted section's subsections survive), the
 * two-step publish confirmation (TC-00361, TC-00362) and the hierarchy
 * diagram (TC-00357, TC-00358).
 *
 * The UI drives; `containers/<key>/`, `children/` and `hierarchy/` decide.
 * Each test uses its own empty library.
 */
test.describe(
  'Content library sections and subsections',
  { tag: ['@regression', ...LIBRARY_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'creates a section from the Add Content sidebar',
      { annotation: testId('TC-00349') },
      async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
        void studioAuthorSession;
        const title = label('section', testInfo.testId);
        await libraryPage.goto(authoringLibrary.id);
        await libraryPage.openAddContent();
        const created = (await (
          await libraryPage.addContainer('section', title)
        ).json()) as LibraryContainer;
        expect(created).toMatchObject({ container_type: 'section', display_name: title });

        expect((await fetchLibraryContainer(page.request, config, created.id)).display_name).toBe(
          title,
        );
        await expect(page).toHaveURL((url) => url.pathname.includes(`/section/${created.id}`));
        await checkA11y(page, {
          label: 'library-section',
          additionalBaseline: LIBRARY_A11Y_BASELINE,
        });
      },
    );

    test(
      'creates a subsection under a section from the section page',
      { annotation: testId('TC-00350') },
      async (
        { page, config, studioAuthorSession, authoringLibrary, libraryContainerPage },
        testInfo,
      ) => {
        void studioAuthorSession;
        const section = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'section',
          label('section', testInfo.testId),
        );
        const title = label('subsection', testInfo.testId);

        await libraryContainerPage.goto(authoringLibrary.id, 'section', section.id);
        const created = (await (
          await libraryContainerPage.addChildContainer(title)
        ).json()) as LibraryContainer;
        expect(created).toMatchObject({ container_type: 'subsection', display_name: title });

        expect(
          (await fetchLibraryContainerChildren(page.request, config, section.id)).map((c) => c.id),
        ).toEqual([created.id]);
      },
    );

    test(
      'renames a section and a subsection from their pages',
      { annotation: [testId('TC-00351'), testId('TC-00352')] },
      async (
        { page, config, studioAuthorSession, authoringLibrary, libraryContainerPage },
        testInfo,
      ) => {
        void studioAuthorSession;
        const section = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'section',
          label('section', testInfo.testId),
        );
        const subsection = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'subsection',
          label('subsection', testInfo.testId),
        );
        await addContainerChildren(page.request, config, section.id, [subsection.id]);

        await libraryContainerPage.goto(authoringLibrary.id, 'section', section.id);
        const renamedSection = `${section.display_name} renamed`;
        expect((await libraryContainerPage.rename(renamedSection)).status()).toBe(200);
        expect((await fetchLibraryContainer(page.request, config, section.id)).display_name).toBe(
          renamedSection,
        );

        await libraryContainerPage.goto(authoringLibrary.id, 'subsection', subsection.id);
        const renamedSubsection = `${subsection.display_name} renamed`;
        expect((await libraryContainerPage.rename(renamedSubsection)).status()).toBe(200);
        expect(
          (await fetchLibraryContainer(page.request, config, subsection.id)).display_name,
        ).toBe(renamedSubsection);
        // The library browse view shows the new names.
        await libraryContainerPage.goto(authoringLibrary.id, 'section', section.id);
        await expect(libraryContainerPage.childFor(renamedSubsection)).toHaveCount(1);
      },
    );

    test(
      'publishes a subsection after a two-step confirmation',
      { annotation: [testId('TC-00354'), testId('TC-00362')] },
      async (
        { page, config, studioAuthorSession, authoringLibrary, libraryContainerPage },
        testInfo,
      ) => {
        void studioAuthorSession;
        const subsection = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'subsection',
          label('subsection', testInfo.testId),
        );
        const unit = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'unit',
          label('unit', testInfo.testId),
        );
        await addContainerChildren(page.request, config, subsection.id, [unit.id]);

        await libraryContainerPage.goto(authoringLibrary.id, 'subsection', subsection.id);
        await libraryContainerPage.openInfo();
        const listed = await libraryContainerPage.sidebar.openPublishConfirmation();
        expect(listed).toEqual(
          expect.arrayContaining([subsection.display_name, unit.display_name]),
        );
        await libraryContainerPage.sidebar.cancelPublish();
        expect(
          (await fetchLibraryContainer(page.request, config, subsection.id))
            .has_unpublished_changes,
        ).toBe(true);

        await libraryContainerPage.sidebar.openPublishConfirmation();
        expect((await libraryContainerPage.sidebar.confirmPublish()).status()).toBe(200);
        expect(
          (await fetchLibraryContainer(page.request, config, subsection.id))
            .has_unpublished_changes,
        ).toBe(false);
        expect(
          (await fetchLibraryContainer(page.request, config, unit.id)).has_unpublished_changes,
        ).toBe(false);
      },
    );

    test(
      'asks for confirmation before publishing a section',
      { annotation: testId('TC-00361') },
      async (
        { page, config, studioAuthorSession, authoringLibrary, libraryContainerPage },
        testInfo,
      ) => {
        void studioAuthorSession;
        const section = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'section',
          label('section', testInfo.testId),
        );

        await libraryContainerPage.goto(authoringLibrary.id, 'section', section.id);
        await libraryContainerPage.openInfo();
        expect(await libraryContainerPage.sidebar.openPublishConfirmation()).toContain(
          section.display_name,
        );
        await libraryContainerPage.sidebar.cancelPublish();
        expect(
          (await fetchLibraryContainer(page.request, config, section.id)).has_unpublished_changes,
        ).toBe(true);
        await libraryContainerPage.sidebar.openPublishConfirmation();
        await libraryContainerPage.sidebar.confirmPublish();
        expect(
          (await fetchLibraryContainer(page.request, config, section.id)).has_unpublished_changes,
        ).toBe(false);
      },
    );

    test(
      'deletes a section; its subsections stay in the library',
      { annotation: testId('TC-00355') },
      async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
        void studioAuthorSession;
        const section = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'section',
          label('section', testInfo.testId),
        );
        const subsection = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'subsection',
          label('subsection', testInfo.testId),
        );
        await addContainerChildren(page.request, config, section.id, [subsection.id]);

        await libraryPage.goto(authoringLibrary.id, 'sections');
        await libraryPage
          .cardFor(section.display_name)
          .first()
          .waitFor({ timeout: TIMEOUTS.librarySearch });
        expect((await libraryPage.deleteCard(section.display_name)).status()).toBe(204);

        await expect(fetchLibraryContainer(page.request, config, section.id)).rejects.toMatchObject(
          { status: 404 },
        );
        expect((await fetchLibraryContainer(page.request, config, subsection.id)).id).toBe(
          subsection.id,
        );
      },
    );

    test(
      'deletes a subsection',
      { annotation: testId('TC-00356') },
      async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
        void studioAuthorSession;
        const subsection = await createLibraryContainer(
          page.request,
          config,
          authoringLibrary.id,
          'subsection',
          label('subsection', testInfo.testId),
        );

        await libraryPage.goto(authoringLibrary.id, 'subsections');
        await libraryPage
          .cardFor(subsection.display_name)
          .first()
          .waitFor({ timeout: TIMEOUTS.librarySearch });
        expect((await libraryPage.deleteCard(subsection.display_name)).status()).toBe(204);
        await expect(
          fetchLibraryContainer(page.request, config, subsection.id),
        ).rejects.toMatchObject({ status: 404 });
      },
    );

    test(
      'shows sections and their subsections in the hierarchy',
      { annotation: [testId('TC-00357'), testId('TC-00358')] },
      async ({ page, config, studioAuthorSession, workerLibrary, libraryContainerPage }) => {
        void studioAuthorSession;
        const { section } = workerLibrary.sections;
        const { subsection } = workerLibrary.subsections;

        await libraryContainerPage.goto(workerLibrary.libraryKey, 'section', section.id);
        await libraryContainerPage.openInfo();
        await libraryContainerPage.sidebar.openTab('usage');
        const sectionRows = await libraryContainerPage.sidebar.hierarchyTexts();
        const sectionHierarchy = await fetchContainerHierarchy(page.request, config, section.id);
        expect(sectionHierarchy.sections.map((s) => s.display_name)).toEqual([
          section.display_name,
        ]);
        expect(sectionRows).toContain(section.display_name);

        await libraryContainerPage.goto(workerLibrary.libraryKey, 'subsection', subsection.id);
        await libraryContainerPage.openInfo();
        await libraryContainerPage.sidebar.openTab('usage');
        const subsectionRows = await libraryContainerPage.sidebar.hierarchyTexts();
        const subsectionHierarchy = await fetchContainerHierarchy(
          page.request,
          config,
          subsection.id,
        );
        expect(subsectionHierarchy.sections.map((s) => s.id)).toEqual([section.id]);
        expect(subsectionRows.indexOf(section.display_name)).toBeLessThan(
          subsectionRows.indexOf(subsection.display_name),
        );
      },
    );
  },
);
