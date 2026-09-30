import { buildSection, fetchObjectTags } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { TAG } from '../../../src/steps';

/**
 * The Align sidebar as the entry point to tagging (BTR TC-00490, 00497, 00500):
 * adding an alignment tag from the Align rail on the outline (a section), the unit
 * page (the unit) and with a component selected, and that the tag persists across
 * a reload. The tag drawer itself is covered exhaustively in
 * `tag-drawer-{outline,unit}.spec.ts`; here the emphasis is the Align-rail access
 * and reload persistence, decided by the `object_tags` API and the reopened tree.
 *
 * Gated on `authoring-sidebar` (the rail) and `taxonomies`.
 */
test.describe(
  'Align sidebar tagging',
  {
    tag: [
      '@regression',
      '@studio',
      '@author',
      '@mfe-authoring',
      '@authoring-sidebar',
      '@taxonomies',
    ],
  },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'adds a tag to a section from the Align rail and it persists',
      { annotation: testId('TC-00490') },
      async ({
        page,
        config,
        workerTaxonomy,
        authoringCourse,
        studioCourseOutlinePage,
        authoringSidebar,
        tagDrawer,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const name = workerTaxonomy.taxonomy.name;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E align sec ${test.info().testId.slice(-6)}`,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );
        await authoringSidebar.openPage('align');
        await tagDrawer.waitOpen();
        await tagDrawer.beginEditing();
        await tagDrawer.openTagSelector(name);
        await tagDrawer.checkTag(name, TAG.parentOne);
        await tagDrawer.commitStaged(name);
        await tagDrawer.save();

        const entry = (await fetchObjectTags(page.request, config, section.usageKey)).find(
          (t) => t.taxonomyId === workerTaxonomy.taxonomy.id,
        );
        expect(entry?.tags.map((t) => t.value)).toEqual([TAG.parentOne]);

        // The tag persists across a reload: reopen the Align drawer and it is there.
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );
        await authoringSidebar.openPage('align');
        await tagDrawer.waitOpen();
        await tagDrawer.beginEditing();
        expect(await tagDrawer.appliedTagCount(name)).toBeGreaterThan(0);
      },
    );

    test(
      'adds a tag to the unit from the unit-page Align rail and it persists',
      { annotation: testId('TC-00497') },
      async ({
        page,
        config,
        workerTaxonomy,
        authoringCourse,
        studioUnitPage,
        authoringSidebar,
        tagDrawer,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const name = workerTaxonomy.taxonomy.name;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E align unit ${test.info().testId.slice(-6)}`,
        );
        const unit = section.units[0];
        if (unit === undefined) throw new Error('buildSection produced no unit.');
        await studioUnitPage.goto(unit.usageKey);
        await authoringSidebar.openPage('align');
        await tagDrawer.waitOpen();
        await tagDrawer.beginEditing();
        await tagDrawer.openTagSelector(name);
        await tagDrawer.checkTag(name, TAG.parentOne);
        await tagDrawer.commitStaged(name);
        await tagDrawer.save();

        expect(
          (await fetchObjectTags(page.request, config, unit.usageKey))
            .find((t) => t.taxonomyId === workerTaxonomy.taxonomy.id)
            ?.tags.map((t) => t.value),
        ).toEqual([TAG.parentOne]);

        await studioUnitPage.goto(unit.usageKey);
        await authoringSidebar.openPage('align');
        await tagDrawer.waitOpen();
        await tagDrawer.beginEditing();
        expect(await tagDrawer.appliedTagCount(name)).toBeGreaterThan(0);
      },
    );

    test(
      'adds a tag to a selected component from the Align rail and it persists',
      { annotation: testId('TC-00500') },
      async ({
        page,
        config,
        workerTaxonomy,
        authoringCourse,
        studioUnitPage,
        authoringSidebar,
        tagDrawer,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const name = workerTaxonomy.taxonomy.name;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E align comp ${test.info().testId.slice(-6)}`,
        );
        const unit = section.units[0];
        const component = section.blocks[0];
        if (unit === undefined || component === undefined) {
          throw new Error('buildSection produced no unit with a component.');
        }
        await studioUnitPage.goto(unit.usageKey);
        await studioUnitPage.selectComponent(component.usageKey);
        await authoringSidebar.openPage('align');
        await tagDrawer.waitOpen();
        await tagDrawer.beginEditing();
        await tagDrawer.openTagSelector(name);
        await tagDrawer.checkTag(name, TAG.parentOne);
        await tagDrawer.commitStaged(name);
        await tagDrawer.save();

        expect(
          (await fetchObjectTags(page.request, config, component.usageKey))
            .find((t) => t.taxonomyId === workerTaxonomy.taxonomy.id)
            ?.tags.map((t) => t.value),
        ).toEqual([TAG.parentOne]);

        await studioUnitPage.goto(unit.usageKey);
        await studioUnitPage.selectComponent(component.usageKey);
        await authoringSidebar.openPage('align');
        await tagDrawer.waitOpen();
        await tagDrawer.beginEditing();
        expect(await tagDrawer.appliedTagCount(name)).toBeGreaterThan(0);
      },
    );
  },
);
