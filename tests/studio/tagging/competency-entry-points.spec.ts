import type { Locator } from '@playwright/test';

import { fetchTaxonomy } from '../../../src/api';
import { TIMEOUTS, VIEWPORTS, viewportUse } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { expectedTaxonomyMenu } from '../../../src/steps';

/**
 * How a user reaches the Competency Management page from the taxonomy list:
 * the "Apply Competencies" menu item and card footer button (openedx-core #663,
 * frontend-app-authoring #3261), and the card link that still opens the taxonomy
 * page. The route guard behind the same page is `competency-route-guard.spec.ts`
 * (openedx-core #707, frontend-app-authoring #3264). No BTR case maps to these.
 *
 * The admin ({@link competencyTaxonomyAdmin}) seeds taxonomies of both types
 * through the content-tagging API and drives the list page; the API decides each
 * taxonomy's type and tagging right, and the page is asserted only where the
 * rendering is the case (the menu's items, the footer, the URL reached). The menu
 * items are identified by their `data-testid` value, the app's untranslated item
 * key, so their order is asserted without any copy.
 */
test.describe(
  'Competency entry points',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies', '@competencies'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test('lists five menu items in order on a Competency card', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { list, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({ type: 'competency', label: 'menu' });
      // The admin's rights are the oracle, independent of the menu derivation.
      expect(taxonomy).toMatchObject(COMPETENCY_AS_ADMIN);
      const expected = expectedTaxonomyMenu(taxonomy);
      expect(expected).toHaveLength(5);

      await list.goto();
      await list.openCardMenu(taxonomy.id);
      await expect.poll(() => list.cardMenuItemIds(taxonomy.id)).toEqual(expected);
    });

    test('lists four menu items and no Apply Competencies on a Tags card', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { list, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({ type: 'tags', label: 'menu' });
      expect(taxonomy).toMatchObject(TAGS_AS_ADMIN);
      const expected = expectedTaxonomyMenu(taxonomy);
      expect(expected).toHaveLength(4);
      expect(expected).not.toContain('taxonomy-menu-applyCompetencies');

      await list.goto();
      await list.openCardMenu(taxonomy.id);
      await expect.poll(() => list.cardMenuItemIds(taxonomy.id)).toEqual(expected);
    });

    test('shows the footer button only on a Competency card', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { list, seed } = competencyTaxonomyAdmin;
      const competency = await seed({ type: 'competency', label: 'footer-competency' });
      const tags = await seed({ type: 'tags', label: 'footer-tags' });

      await list.goto();
      // Both cards are on the page before the Tags card is asserted to have no
      // footer, so an absent card cannot pass.
      await expect(list.card(competency.id)).toBeVisible();
      await expect(list.card(tags.id)).toBeVisible();
      await expect(list.cardFooter(competency.id)).toHaveCount(1);
      await expect(list.cardFooterButton(competency.id)).toHaveCount(1);
      await expect(list.cardFooter(tags.id)).toHaveCount(0);
      // No accessibility scan here: the list is already scanned with a Competency
      // card (and its footer button inside the card link) by `taxonomy-type.spec.ts`
      // under the same label and baseline.
    });

    test('opens the Competency Management page from the menu item', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { list, competency, detail, page, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({ type: 'competency', label: 'menu-nav' });

      await list.goto();
      await list.applyFromMenu(taxonomy.id);

      await expect(page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}/competencies$`));
      await expect(competency.tree).toBeVisible();
      await expect(detail.menuButton).toHaveCount(0);
    });

    test('opens the same page from the footer button and leaves the card link unused', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { list, competency, page, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({ type: 'competency', label: 'footer-nav' });

      await list.goto();
      await list.applyFromFooter(taxonomy.id);

      await expect(page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}/competencies$`));
      await expect(competency.tree).toBeVisible();

      // The taxonomy page never entered the history: Back returns to the list.
      await page.goBack();
      await expect(page).toHaveURL(/\/taxonomies\/?$/);
    });

    test('opens the taxonomy page from the card body for both types', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { list, competency, detail, page, seed } = competencyTaxonomyAdmin;
      for (const type of ['competency', 'tags'] as const) {
        const taxonomy = await seed({ type, label: `body-${type}` });

        await list.goto();
        await expect(list.card(taxonomy.id)).toHaveAttribute(
          'href',
          new RegExp(`/taxonomy/${taxonomy.id}$`),
        );
        await list.openCard(taxonomy.id);

        await expect(page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}$`));
        await expect(detail.menuButton).toBeVisible();
        await expect(competency.tree).toHaveCount(0);
      }
    });

    test('offers Apply Competencies in the Actions menu of a Competency taxonomy page only', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { detail, competency, page, seed } = competencyTaxonomyAdmin;
      const withType = {
        competency: await seed({ type: 'competency', label: 'actions-competency' }),
        tags: await seed({ type: 'tags', label: 'actions-tags' }),
      };
      expect(withType.competency).toMatchObject(COMPETENCY_AS_ADMIN);
      expect(withType.tags).toMatchObject(TAGS_AS_ADMIN);
      const competencyMenu = expectedTaxonomyMenu(withType.competency);
      const tagsMenu = expectedTaxonomyMenu(withType.tags);
      expect(competencyMenu).toHaveLength(5);
      expect(tagsMenu).toHaveLength(4);

      await detail.goto(withType.tags.id);
      await expect.poll(() => detail.menuItemIds()).toEqual(tagsMenu);

      await detail.goto(withType.competency.id);
      await expect.poll(() => detail.menuItemIds()).toEqual(competencyMenu);
      await detail.applyCompetencies();
      await expect(page).toHaveURL(new RegExp(`/taxonomy/${withType.competency.id}/competencies$`));
      await expect(competency.tree).toBeVisible();
    });

    // The author's taxonomy list is empty (the list API returns no taxonomy to a
    // non-staff user), so there is no card to start from: the author's entry point
    // is the taxonomy page's Actions menu.
    test('offers a non-staff author Apply Competencies on the taxonomy page', async ({
      config,
      page,
      competencyTaxonomySeeder,
      authorTaxonomyPages,
      authoringCourse,
    }) => {
      // A non-staff user sees an org-assigned taxonomy only with a role in a course of
      // that org; the author's own course in the suite org gives it.
      void authoringCourse;
      const { detail, competency } = authorTaxonomyPages;
      const seeded = await competencyTaxonomySeeder({
        taxonomyType: 'competency',
        access: 'suite-org',
      });
      const taxonomy = await fetchTaxonomy(page.request, config, seeded.id);
      expect(taxonomy).toMatchObject({ taxonomyType: 'competency', canTagObject: true });

      await detail.goto(taxonomy.id);
      await expect.poll(() => detail.menuItemIds()).toEqual(expectedTaxonomyMenu(taxonomy));
      await detail.applyCompetencies();

      await expect(page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}/competencies$`));
      await expect(competency.tree).toBeVisible();
    });

    test.describe('at phone width', () => {
      test.use(viewportUse(VIEWPORTS.phone));

      test('keeps the menu inside a phone-width window and the footer button usable', async ({
        competencyTaxonomyAdmin,
      }) => {
        const { list, page, seed } = competencyTaxonomyAdmin;
        const { width } = VIEWPORTS.phone.viewport;
        const taxonomy = await seed({ type: 'competency', label: 'narrow' });
        expect(taxonomy).toMatchObject(COMPETENCY_AS_ADMIN);

        await list.goto();
        await list.openCardMenu(taxonomy.id);
        await expect(list.cardMenuItems(taxonomy.id)).toHaveCount(
          expectedTaxonomyMenu(taxonomy).length,
        );
        for (const item of await list.cardMenuItems(taxonomy.id).all()) {
          await expectInsideWidth(item, width);
        }

        await page.keyboard.press('Escape');
        await expect(list.cardMenuItems(taxonomy.id).first()).toBeHidden();
        // The card overflows a 375 px window (`TAG-006`: the app's CSS fixes it at
        // 400 px). #663 requires only that the footer button is visible and
        // clickable, so that is what is checked.
        await expect(list.cardFooterButton(taxonomy.id)).toBeVisible();
        await list.applyFromFooter(taxonomy.id);
        await expect(page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}/competencies$`));
      });
    });
  },
);

/** What the admin may do with a taxonomy it imported: everything. */
const ADMIN_RIGHTS = { canChangeTaxonomy: true, canDeleteTaxonomy: true, readOnly: false };
const COMPETENCY_AS_ADMIN = { ...ADMIN_RIGHTS, taxonomyType: 'competency', canTagObject: true };
const TAGS_AS_ADMIN = { ...ADMIN_RIGHTS, taxonomyType: 'tags' };

/**
 * Asserts the element's box lies between the window's left edge and `width`. It
 * retries until the layout settles, and a failure shows the measured box.
 */
async function expectInsideWidth(element: Locator, width: number): Promise<void> {
  await expect
    .poll(async () => {
      const box = await element.boundingBox();
      return {
        box,
        insideLeft: box !== null && box.x >= 0,
        insideRight: box !== null && box.x + box.width <= width,
      };
    })
    .toMatchObject({ insideLeft: true, insideRight: true });
}
