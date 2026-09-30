import type { Page } from '@playwright/test';

import {
  buildSection,
  fetchObjectTagCounts,
  fetchObjectTags,
  setObjectTags,
  tagCountFor,
} from '../../../src/api';
import { TIMEOUTS, encodedTagValue, type AppConfig } from '../../../src/config';
import type { AuthoringSidebar } from '../../../src/pages/studio/sidebar/authoring-sidebar.page';
import type { StudioCourseOutlinePage } from '../../../src/pages/studio/course-outline.page';
import type { TagDrawer } from '../../../src/pages/studio/sidebar/tag-drawer.page';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { TAG } from '../../../src/steps';

/**
 * The outline tag drawer at every level — section, subsection and course (BTR
 * TC-00176–00196). Each level runs the same seven behaviours: view the enabled
 * taxonomies, search, browse nested children, add a parent, add a child (parent
 * implied), delete a parent, delete a child (parent removed). The oracle after
 * every Save is the `object_tags` API (values and implicit counts).
 *
 * A fresh per-test course (`authoringCourse`) holds one section, so the drawer
 * opens on an unambiguous card; the taxonomy is the worker-seeded `workerTaxonomy`.
 * Section/subsection drawers open from the card's "Manage tags" kebab; the course
 * drawer opens from the Align rail (the course is selected by default).
 */
type Level = 'section' | 'subsection' | 'unit' | 'course';

interface LevelSpec {
  readonly level: Level;
  readonly ids: {
    readonly view: string;
    readonly search: string;
    readonly browse: string;
    readonly addParent: string;
    readonly addChild: string;
    readonly deleteParent: string;
    readonly deleteChild: string;
  };
}

const LEVELS: readonly LevelSpec[] = [
  {
    level: 'section',
    ids: {
      view: 'TC-00176',
      search: 'TC-00177',
      browse: 'TC-00178',
      addParent: 'TC-00179',
      addChild: 'TC-00180',
      deleteParent: 'TC-00181',
      deleteChild: 'TC-00182',
    },
  },
  {
    level: 'subsection',
    ids: {
      view: 'TC-00183',
      search: 'TC-00184',
      browse: 'TC-00185',
      addParent: 'TC-00186',
      addChild: 'TC-00187',
      deleteParent: 'TC-00188',
      deleteChild: 'TC-00189',
    },
  },
  {
    level: 'unit',
    ids: {
      view: 'TC-00205',
      search: 'TC-00206',
      browse: 'TC-00207',
      addParent: 'TC-00208',
      addChild: 'TC-00209',
      deleteParent: 'TC-00210',
      deleteChild: 'TC-00211',
    },
  },
  {
    level: 'course',
    ids: {
      view: 'TC-00190',
      search: 'TC-00191',
      browse: 'TC-00192',
      addParent: 'TC-00193',
      addChild: 'TC-00194',
      deleteParent: 'TC-00195',
      deleteChild: 'TC-00196',
    },
  },
];

interface DrawerContext {
  readonly page: Page;
  readonly config: AppConfig;
  readonly courseKey: string;
  readonly outline: StudioCourseOutlinePage;
  readonly sidebar: AuthoringSidebar;
  readonly drawer: TagDrawer;
  readonly taxonomyId: number;
}

/**
 * Builds a section, resolves the object for `level`, optionally pre-seeds tags on
 * it, then opens its tag drawer and returns the object's usage/course key.
 */
async function prepare(
  ctx: DrawerContext,
  level: Level,
  label: string,
  seedTags: readonly string[] = [],
): Promise<string> {
  const section = await buildSection(ctx.page.request, ctx.config, ctx.courseKey, label);
  const objectId =
    level === 'section'
      ? section.usageKey
      : level === 'subsection'
        ? (section.subsections[0]?.usageKey ?? '')
        : level === 'unit'
          ? (section.units[0]?.usageKey ?? '')
          : ctx.courseKey; // a course is tagged by its course key, not a block usage key
  if (seedTags.length > 0) {
    await setObjectTags(ctx.page.request, ctx.config, objectId, ctx.taxonomyId, seedTags);
  }
  await ctx.outline.goto(ctx.courseKey);
  await ctx.outline.waitForCourse(ctx.courseKey);
  if (level === 'section') {
    await ctx.outline.openManageTags(ctx.outline.sectionCards.first(), 'section');
  } else if (level === 'subsection') {
    await ctx.outline.setAllExpanded(true);
    await ctx.outline.openManageTags(ctx.outline.subsectionCards.first(), 'subsection');
  } else if (level === 'unit') {
    await ctx.outline.setAllExpanded(true);
    await ctx.outline.openManageTags(ctx.outline.unitCards.first(), 'unit');
  } else {
    // The course is the default selection; the Align rail shows its drawer.
    await ctx.sidebar.openPage('align');
  }
  await ctx.drawer.waitOpen();
  return objectId;
}

for (const { level, ids } of LEVELS) {
  test.describe(
    `Tag drawer — ${level}`,
    { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies'] },
    () => {
      test.describe.configure({ timeout: TIMEOUTS.contentTest });

      test(
        'views the enabled taxonomies',
        { annotation: testId(ids.view) },
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
          const ctx: DrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            outline: studioCourseOutlinePage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          await prepare(ctx, level, `E2E view ${test.info().testId.slice(-6)}`);
          await tagDrawer.beginEditing();
          expect(await tagDrawer.taxonomyNames()).toContain(workerTaxonomy.taxonomy.name);
        },
      );

      test(
        'searches for matching tags',
        { annotation: testId(ids.search) },
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
          const ctx: DrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            outline: studioCourseOutlinePage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          await prepare(ctx, level, `E2E search ${test.info().testId.slice(-6)}`);
          await tagDrawer.beginEditing();
          await tagDrawer.openTagSelector(name);
          await tagDrawer.searchTags(name, 'Parent One');
          await expect
            .poll(() => tagDrawer.visibleTagValues(name))
            .toEqual([encodedTagValue(TAG.parentOne)]);
        },
      );

      test(
        'browses nested child tags',
        { annotation: testId(ids.browse) },
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
          const ctx: DrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            outline: studioCourseOutlinePage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          await prepare(ctx, level, `E2E browse ${test.info().testId.slice(-6)}`);
          await tagDrawer.beginEditing();
          await tagDrawer.openTagSelector(name);
          await tagDrawer.expandTagChildren(name, TAG.parentOne);
          await expect
            .poll(() => tagDrawer.visibleTagValues(name))
            .toContain(encodedTagValue(TAG.parentOne, TAG.childOneA));
        },
      );

      test(
        'adds a parent tag',
        { annotation: testId(ids.addParent) },
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
          const ctx: DrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            outline: studioCourseOutlinePage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          const objectId = await prepare(ctx, level, `E2E addp ${test.info().testId.slice(-6)}`);
          await tagDrawer.beginEditing();
          await tagDrawer.openTagSelector(name);
          await tagDrawer.checkTag(name, TAG.parentOne);
          await tagDrawer.commitStaged(name);
          await tagDrawer.save();

          const entry = (await fetchObjectTags(page.request, config, objectId)).find(
            (t) => t.taxonomyId === ctx.taxonomyId,
          );
          expect(entry?.tags.map((t) => t.value)).toEqual([TAG.parentOne]);
          expect(
            tagCountFor(await fetchObjectTagCounts(page.request, config, [objectId]), objectId),
          ).toBe(1);
        },
      );

      test(
        'adds a child tag, implying its parent',
        { annotation: testId(ids.addChild) },
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
          const ctx: DrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            outline: studioCourseOutlinePage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          const objectId = await prepare(ctx, level, `E2E addc ${test.info().testId.slice(-6)}`);
          await tagDrawer.beginEditing();
          await tagDrawer.openTagSelector(name);
          await tagDrawer.expandTagChildren(name, TAG.parentOne);
          await tagDrawer.checkTag(name, TAG.parentOne, TAG.childOneA);
          await tagDrawer.commitStaged(name);
          await tagDrawer.save();

          const entry = (await fetchObjectTags(page.request, config, objectId)).find(
            (t) => t.taxonomyId === ctx.taxonomyId,
          );
          expect(entry?.tags.map((t) => t.value)).toEqual([TAG.childOneA]);
          expect(
            tagCountFor(
              await fetchObjectTagCounts(page.request, config, [objectId], { implicit: true }),
              objectId,
            ),
          ).toBe(2);
        },
      );

      test(
        'deletes a parent tag',
        { annotation: testId(ids.deleteParent) },
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
          const ctx: DrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            outline: studioCourseOutlinePage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          const objectId = await prepare(ctx, level, `E2E delp ${test.info().testId.slice(-6)}`, [
            TAG.parentTwo,
          ]);
          await tagDrawer.beginEditing();
          await tagDrawer.deleteAppliedTag(name, TAG.parentTwo);
          await tagDrawer.save();
          expect(await fetchObjectTags(page.request, config, objectId)).toEqual([]);
        },
      );

      test(
        'deletes a child tag, removing its implied parent',
        { annotation: testId(ids.deleteChild) },
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
          const ctx: DrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            outline: studioCourseOutlinePage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          const objectId = await prepare(ctx, level, `E2E delc ${test.info().testId.slice(-6)}`, [
            TAG.childOneB,
          ]);
          await tagDrawer.beginEditing();
          await tagDrawer.deleteAppliedTag(name, TAG.childOneB);
          await tagDrawer.save();
          expect(await fetchObjectTags(page.request, config, objectId)).toEqual([]);
        },
      );
    },
  );
}
