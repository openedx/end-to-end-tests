import { expect, test } from '../../../src/fixtures';
import {
  availableComponentTypes,
  canI,
  buildSection,
  commitLibrary,
  createLibraryBlock,
  createXBlock,
  fetchContainer,
  fetchContainerChildren,
  libraryOlx,
  setLibraryBlockOlx,
  duplicateXBlock,
  fetchCourseOutline,
  fetchObjectTags,
  fetchXBlockOutline,
  moveXBlock,
  setObjectTags,
  updateXBlock,
  enrollInCourseViaApi,
  publishXBlock,
} from '../../../src/api';
import { STUDIO_OUTLINE_PAGE_SELECTORS, TIMEOUTS, getRunId } from '../../../src/config';
import { TAG, enableAuthzForCourse, seedScopeAssignments } from '../../../src/steps';
import { migrationCourse } from '../transition/helpers';
import { testId } from '../../../src/reporting';
import { STUDIO_AUTHZ_TAGS } from './helpers';

/**
 * Authoring a course whose rights come from AuthZ (`TC-00618`, `TC-00621`,
 * `TC-00644`, `TC-00645`, `TC-00647`, `TC-00648`).
 *
 * Each case is a permission question — "may this role do this?" — so the action
 * is driven **as the role** and the outcome is read from the platform: the
 * outline, the block's own record, the learner's course, `object_tags`. Where a
 * page object already drives the surface it is used; the two structural actions
 * the outline offers by drag (duplicate, move) go through the API Studio itself
 * calls, with the outline read back as the oracle.
 */
test.describe(
  'Studio under AuthZ — authoring actions',
  { tag: ['@regression', ...STUDIO_AUTHZ_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'lets course staff build a unit and put a component in it',
      { annotation: testId('TC-00618') },
      async (
        { page, config, authzTarget, studioAuthorSession, resyncStudioAuthor, studioColleague },
        testInfo,
      ) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const staff = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          courseKey,
          [staff.identity.username],
          ['course_staff'],
        );
        await resyncStudioAuthor();
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E staff authoring ${testInfo.testId.slice(-6)}`,
          { subsections: [{ units: [] }] },
        );

        // Built by the staff account itself: a unit, then an HTML component.
        const unit = await createXBlock(staff.request, config, {
          parentLocator: section.subsections[0]?.usageKey ?? '',
          category: 'vertical',
          displayName: `E2E unit ${testInfo.testId.slice(-6)}`,
        });
        const component = await createXBlock(staff.request, config, {
          parentLocator: unit,
          category: 'html',
        });
        await updateXBlock(staff.request, config, component, {
          data: `<p>E2E ${testInfo.testId.slice(-6)}</p>`,
        });

        // The platform's record of the course now contains both. A unit's
        // children come from the container endpoint, not the outline: the
        // outline stops at the unit.
        expect(
          (await fetchContainerChildren(page.request, config, unit)).map((child) => child.block_id),
        ).toContain(component);

        // And the surface renders for that role.
        await staff.page.goto(`${config.baseUrls.apps}/authoring/course/${courseKey}`, {
          waitUntil: 'domcontentloaded',
        });
        await expect(
          staff.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.sectionCard).first(),
        ).toBeVisible({ timeout: TIMEOUTS.navigation });
      },
    );

    test(
      'publishes a unit as a course admin, and the learner sees it',
      { annotation: testId('TC-00621') },
      async (
        {
          page,
          config,
          adminLms,
          authzTarget,
          automaticMigrationTarget,
          studioAuthorSession,
          studioColleague,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        void automaticMigrationTarget;
        void authzTarget;
        // A course of this case's own, released and then migrated. The shared
        // AuthZ course accumulates the whole tree's content, and a learner
        // reading a course full of other specs' blocks measures their mess
        // rather than this publish.
        const courseKey = await migrationCourse(
          page.request,
          config,
          getRunId(),
          `P${testInfo.parallelIndex}`,
        );
        await adminLms((session) =>
          enableAuthzForCourse(session, config, courseKey, { mode: 'automatic' }),
        );
        // Migrating it made the worker author this course's `course_admin`.
        expect(await canI(page.request, config, 'courses.manage_course_team', courseKey)).toBe(
          true,
        );
        const admin = { request: page.request };
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E publish ${testInfo.testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }] },
        );
        const unitKey = section.units[0]?.usageKey ?? '';

        // Published by the admin account, not by the author that built it.
        await publishXBlock(admin.request, config, unitKey);
        expect((await fetchXBlockOutline(page.request, config, unitKey)).published).toBe(true);

        // Visible in the LMS to an enrolled learner.
        const learner = await studioColleague();
        await enrollInCourseViaApi(learner.request, config, courseKey);
        await expect
          .poll(
            async () =>
              (
                await fetchCourseOutline(
                  learner.request,
                  config,
                  courseKey,
                  learner.identity.username,
                )
              ).units.some((unit) => unit.id === unitKey),
            { timeout: TIMEOUTS.contentPublish },
          )
          .toBe(true);
      },
    );

    test(
      'adds a library component to the course as a course admin',
      { annotation: testId('TC-00644') },
      async (
        {
          page,
          config,
          authzTarget,
          authoringLibrary,
          studioAuthorSession,
          resyncStudioAuthor,
          studioColleague,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        // This case drives the picker in a browser and needs a library role of
        // its own, so it takes an account rather than the worker author.
        const admin = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          courseKey,
          [admin.identity.username],
          ['course_admin'],
        );
        await resyncStudioAuthor();
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E library ${testInfo.testId.slice(-6)}`,
          { subsections: [{ units: [] }] },
        );
        const unit = await createXBlock(page.request, config, {
          parentLocator: section.subsections[0]?.usageKey ?? '',
          category: 'vertical',
          displayName: `E2E library unit ${testInfo.testId.slice(-6)}`,
        });

        // The library needs something published to reuse, and this account needs
        // to be allowed to reuse it: `library_user` carries
        // `reuse_library_content` and nothing else.
        const title = `E2E reusable ${testInfo.testId.slice(-6)}`;
        const block = await createLibraryBlock(page.request, config, authoringLibrary.id, {
          blockType: 'html',
        });
        await setLibraryBlockOlx(
          page.request,
          config,
          block.id,
          libraryOlx.html(title, 'reusable'),
        );
        await commitLibrary(page.request, config, authoringLibrary.id);
        await seedScopeAssignments(
          page.request,
          config,
          authoringLibrary.id,
          [admin.identity.username],
          ['library_user'],
        );

        // Added the way an author does it: the unit's own picker.
        const types = availableComponentTypes(await fetchContainer(page.request, config, unit));
        await admin.unitPage.goto(unit);
        await admin.unitPage.openAddComponent(types.indexOf('library_v2'));
        await admin.libraryPicker.root.waitFor();
        await admin.libraryPicker.selectLibrary(authoringLibrary.id, authoringLibrary.slug);
        await admin.libraryPicker
          .cardFor(title)
          .first()
          .waitFor({ timeout: TIMEOUTS.librarySearch });
        expect((await admin.libraryPicker.addToCourse(title)).status()).toBe(200);

        // The course's own record now holds the block the picker added.
        await expect
          .poll(async () => (await fetchContainerChildren(page.request, config, unit)).length, {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBeGreaterThan(0);
      },
    );

    test(
      'tags course content as a course admin',
      { annotation: testId('TC-00645') },
      async ({ page, config, authzTarget, authoringTaxonomy, studioAuthorSession }, testInfo) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        // This course's AuthZ administrator is the worker author: migration
        // turned its legacy `instructor` row into `course_admin`. Driving the
        // case as it, rather than provisioning another account, keeps the spec
        // inside the platform's sign-in rate limit.
        expect(await canI(page.request, config, 'courses.manage_course_team', courseKey)).toBe(
          true,
        );
        const admin = { request: page.request, page };
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E tagging ${testInfo.testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unitKey = section.units[0]?.usageKey ?? '';

        // Tagged by the admin account; read back from the platform's own store.
        const tag = TAG.childOneA;
        await setObjectTags(admin.request, config, unitKey, authoringTaxonomy.taxonomy.id, [tag]);
        const applied = await fetchObjectTags(page.request, config, unitKey);
        expect(applied.flatMap((entry) => entry.tags.map((row) => row.value))).toContain(tag);
      },
    );

    test(
      'duplicates a unit and moves it to another section as course staff',
      { annotation: testId('TC-00647') },
      async (
        { page, config, authzTarget, studioAuthorSession, resyncStudioAuthor, studioColleague },
        testInfo,
      ) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const staff = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          courseKey,
          [staff.identity.username],
          ['course_staff'],
        );
        await resyncStudioAuthor();
        const first = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E move source ${testInfo.testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const second = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E move target ${testInfo.testId.slice(-6)}`,
          { subsections: [{ units: [] }] },
        );
        const sourceUnit = first.units[0]?.usageKey ?? '';
        const sourceParent = first.subsections[0]?.usageKey ?? '';
        const targetParent = second.subsections[0]?.usageKey ?? '';

        // Both structural actions, as the staff account.
        const copy = await duplicateXBlock(staff.request, config, {
          parentLocator: sourceParent,
          sourceLocator: sourceUnit,
        });
        expect(
          (await fetchXBlockOutline(page.request, config, sourceParent)).child_info?.children.map(
            (child) => child.id,
          ),
        ).toContain(copy);

        await moveXBlock(staff.request, config, {
          sourceLocator: copy,
          parentLocator: targetParent,
        });
        expect(
          (await fetchXBlockOutline(page.request, config, targetParent)).child_info?.children.map(
            (child) => child.id,
          ),
        ).toContain(copy);
        expect(
          (await fetchXBlockOutline(page.request, config, sourceParent)).child_info?.children.map(
            (child) => child.id,
          ),
        ).not.toContain(copy);
      },
    );

    test(
      'discards a draft change as a course admin',
      { annotation: testId('TC-00648') },
      async ({ page, config, authzTarget, studioAuthorSession }, testInfo) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        // This course's AuthZ administrator is the worker author: migration
        // turned its legacy `instructor` row into `course_admin`. Driving the
        // case as it, rather than provisioning another account, keeps the spec
        // inside the platform's sign-in rate limit.
        expect(await canI(page.request, config, 'courses.manage_course_team', courseKey)).toBe(
          true,
        );
        const admin = { request: page.request, page };
        const published = `E2E published ${testInfo.testId.slice(-6)}`;
        const section = await buildSection(page.request, config, courseKey, published, {
          subsections: [{ units: [{ blocks: [] }] }],
        });
        const unitKey = section.units[0]?.usageKey ?? '';
        await publishXBlock(page.request, config, unitKey);
        const publishedName = (await fetchXBlockOutline(page.request, config, unitKey))
          .display_name;

        // A draft change, then the admin discards it.
        await updateXBlock(page.request, config, unitKey, {
          metadata: { display_name: `${published} draft` },
        });
        expect((await fetchXBlockOutline(page.request, config, unitKey)).has_changes).toBe(true);

        await updateXBlock(admin.request, config, unitKey, { publish: 'discard_changes' });
        const reverted = await fetchXBlockOutline(page.request, config, unitKey);
        expect(reverted.has_changes).toBe(false);
        expect(reverted.display_name).toBe(publishedName);
      },
    );
  },
);
