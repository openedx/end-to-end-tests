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
import type { StudioUnitPage } from '../../../src/pages/studio/unit.page';
import type { TagDrawer } from '../../../src/pages/studio/sidebar/tag-drawer.page';
import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { TAG } from '../../../src/steps';

/**
 * The tag drawer reached from the **unit page** (BTR TC-00223–00236): the unit's
 * own tags (nothing selected) and a selected component's tags. Both open from the
 * unit page's Align rail — the same embedded drawer as the outline. The seven
 * behaviours and the `object_tags` oracle match `tag-drawer-outline.spec.ts`; only
 * the surface and the tagged object differ.
 */
type Surface = 'component' | 'unit-page';

interface SurfaceSpec {
  readonly surface: Surface;
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

const SURFACES: readonly SurfaceSpec[] = [
  {
    surface: 'component',
    ids: {
      view: 'TC-00223',
      search: 'TC-00224',
      browse: 'TC-00225',
      addParent: 'TC-00226',
      addChild: 'TC-00227',
      deleteParent: 'TC-00228',
      deleteChild: 'TC-00229',
    },
  },
  {
    surface: 'unit-page',
    ids: {
      view: 'TC-00230',
      search: 'TC-00231',
      browse: 'TC-00232',
      addParent: 'TC-00233',
      addChild: 'TC-00234',
      deleteParent: 'TC-00235',
      deleteChild: 'TC-00236',
    },
  },
];

interface UnitDrawerContext {
  readonly page: Page;
  readonly config: AppConfig;
  readonly courseKey: string;
  readonly unitPage: StudioUnitPage;
  readonly sidebar: AuthoringSidebar;
  readonly drawer: TagDrawer;
  readonly taxonomyId: number;
}

/** Builds a unit with components, resolves the object for `surface`, optionally seeds tags, opens the drawer. */
async function prepare(
  ctx: UnitDrawerContext,
  surface: Surface,
  label: string,
  seedTags: readonly string[] = [],
): Promise<string> {
  const section = await buildSection(ctx.page.request, ctx.config, ctx.courseKey, label);
  const unit = section.units[0];
  const component = section.blocks[0];
  if (unit === undefined || component === undefined) {
    throw new Error('buildSection produced no unit with a component.');
  }
  const objectId = surface === 'component' ? component.usageKey : unit.usageKey;
  if (seedTags.length > 0) {
    await setObjectTags(ctx.page.request, ctx.config, objectId, ctx.taxonomyId, seedTags);
  }
  await ctx.unitPage.goto(unit.usageKey);
  if (surface === 'component') {
    await ctx.unitPage.selectComponent(component.usageKey);
  }
  await ctx.sidebar.openPage('align');
  await ctx.drawer.waitOpen();
  return objectId;
}

for (const { surface, ids } of SURFACES) {
  test.describe(
    `Tag drawer — ${surface}`,
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
          studioUnitPage,
          authoringSidebar,
          tagDrawer,
          studioAuthorSession,
        }) => {
          void studioAuthorSession;
          const ctx: UnitDrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            unitPage: studioUnitPage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          await prepare(ctx, surface, `E2E view ${test.info().testId.slice(-6)}`);
          await tagDrawer.beginEditing();
          expect(await tagDrawer.taxonomyNames()).toContain(workerTaxonomy.taxonomy.name);

          // `TAG-003`: the drawer's taxonomy tree ships ~40 unlabelled form
          // controls, two unnamed buttons and a disallowed ARIA attribute.
          // Baselined on this scan only; everything else still gates.
          await checkA11y(page, {
            label: 'studio-tag-drawer',
            additionalBaseline: ['aria-allowed-attr', 'button-name', 'label'],
          });
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
          studioUnitPage,
          authoringSidebar,
          tagDrawer,
          studioAuthorSession,
        }) => {
          void studioAuthorSession;
          const ctx: UnitDrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            unitPage: studioUnitPage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          await prepare(ctx, surface, `E2E search ${test.info().testId.slice(-6)}`);
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
          studioUnitPage,
          authoringSidebar,
          tagDrawer,
          studioAuthorSession,
        }) => {
          void studioAuthorSession;
          const ctx: UnitDrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            unitPage: studioUnitPage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          await prepare(ctx, surface, `E2E browse ${test.info().testId.slice(-6)}`);
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
          studioUnitPage,
          authoringSidebar,
          tagDrawer,
          studioAuthorSession,
        }) => {
          void studioAuthorSession;
          const ctx: UnitDrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            unitPage: studioUnitPage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          const objectId = await prepare(ctx, surface, `E2E addp ${test.info().testId.slice(-6)}`);
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
          studioUnitPage,
          authoringSidebar,
          tagDrawer,
          studioAuthorSession,
        }) => {
          void studioAuthorSession;
          const ctx: UnitDrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            unitPage: studioUnitPage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          const objectId = await prepare(ctx, surface, `E2E addc ${test.info().testId.slice(-6)}`);
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
          studioUnitPage,
          authoringSidebar,
          tagDrawer,
          studioAuthorSession,
        }) => {
          void studioAuthorSession;
          const ctx: UnitDrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            unitPage: studioUnitPage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          const objectId = await prepare(ctx, surface, `E2E delp ${test.info().testId.slice(-6)}`, [
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
          studioUnitPage,
          authoringSidebar,
          tagDrawer,
          studioAuthorSession,
        }) => {
          void studioAuthorSession;
          const ctx: UnitDrawerContext = {
            page,
            config,
            courseKey: authoringCourse.courseKey,
            unitPage: studioUnitPage,
            sidebar: authoringSidebar,
            drawer: tagDrawer,
            taxonomyId: workerTaxonomy.taxonomy.id,
          };
          const name = workerTaxonomy.taxonomy.name;
          const objectId = await prepare(ctx, surface, `E2E delc ${test.info().testId.slice(-6)}`, [
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
