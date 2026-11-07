import type { APIRequestContext, Page, Route } from '@playwright/test';

import { ApiError, deleteTaxonomy, fetchTaxonomy } from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import type { CompetencyManagementPage } from '../../../src/pages/studio/taxonomies/competency-management.page';
import { expectedTaxonomyMenu } from '../../../src/steps';

/**
 * The route guard on the Competency Management page
 * (`/taxonomy/<id>/competencies`): a Competency taxonomy opens it, any other
 * taxonomy is redirected to `/taxonomy/<id>`, and a taxonomy the user cannot read
 * shows the connection-error alert without a redirect (openedx-core #707,
 * frontend-app-authoring #3264). The entry points that lead here are
 * `competency-entry-points.spec.ts`. No BTR case maps to these.
 *
 * The admin ({@link competencyTaxonomyAdmin}) seeds through the content-tagging
 * API and opens each route by URL; the page object waits for no outcome, so each
 * test asserts the one it expects (page, redirect or alert). The cases about a
 * taxonomy the author cannot read act as the worker author, with the taxonomy
 * seeded by {@link competencyTaxonomySeeder}; they never take the admin fixture,
 * which holds the admin lock for the whole test. The case about a taxonomy the
 * user can read but not tag acts as a global-staff Studio user
 * ({@link staffTaxonomyColleague}) on a disabled Competency taxonomy.
 *
 * Not covered: #707's "no flash while the type is resolving" scenario (only a spinner
 * shows while the taxonomy loads). Proving the spinner appeared needs a delayed
 * response, which ADR-0003 forbids, and a DOM observer cannot prove it on a fast API.
 *
 * Interception (ADR-0003): the failed-request case intercepts one route, the
 * taxonomy's own `GET taxonomies/<id>/`, to make it fail with a 500, because #707
 * requires a taxonomy request that errors to render the error state and not to
 * redirect, and a healthy installation cannot produce that response on demand.
 * Nothing is faked: the case asserts only what is rendered, and removes the
 * route when it ends. No other case here intercepts.
 */
test.describe(
  'Competency route guard',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies', '@competencies'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test('opens the Competency Management page by URL for a Competency taxonomy', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { competency, detail, page, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({ type: 'competency', label: 'guard-open' });

      await competency.open(taxonomy.id);

      await expect(competency.tree).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}/competencies$`));
      await expect(competency.errorAlert).toHaveCount(0);
      await expect(detail.menuButton).toHaveCount(0);
      // `TAG-004`: the page's breadcrumb (`ol.list-inline`) is the same markup as
      // the taxonomy page's. Baselined on this scan only.
      await checkA11y(page, {
        label: 'studio-competency-management',
        additionalBaseline: ['list'],
      });
    });

    test('redirects a Tags taxonomy to its taxonomy page', async ({ competencyTaxonomyAdmin }) => {
      const { competency, detail, page, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({ type: 'tags', label: 'guard-redirect' });

      await competency.open(taxonomy.id);

      await expect(page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}$`));
      await expect(detail.menuButton).toBeVisible();
      await expect(competency.tree).toHaveCount(0);
    });

    test('goes back to the list after a redirect, without looping', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { list, competency, page, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({ type: 'tags', label: 'guard-back' });

      await list.goto();
      await competency.open(taxonomy.id);
      await expect(page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}$`));

      // The redirect replaced the `/competencies` entry, so the history is the
      // list followed by the taxonomy page.
      await page.goBack();
      await expect(list.importButton).toBeVisible();
      await expect(page).toHaveURL(/\/taxonomies\/?$/);
    });

    test('shows the error alert, not a redirect, for a taxonomy that does not exist', async ({
      config,
      competencyTaxonomyAdmin,
    }) => {
      const { competency, detail, page, request, seed } = competencyTaxonomyAdmin;
      // The page never learns the type of a taxonomy the API cannot serve, so the type
      // does not matter here; a Tags one is seeded and deleted.
      const taxonomy = await seed({ type: 'tags', label: 'guard-missing' });
      await deleteTaxonomy(request, config, taxonomy.id);

      await competency.open(taxonomy.id);
      await expectErrorNotRedirect(competency, page, taxonomy.id);

      await detail.open(taxonomy.id);
      await expect(detail.errorAlert).toBeVisible({ timeout: TIMEOUTS.taxonomyQueryError });
    });

    test('shows the error alert, not a redirect, for a taxonomy the author cannot read', async ({
      config,
      page,
      competencyTaxonomySeeder,
      authorTaxonomyPages,
    }) => {
      const { competency, detail } = authorTaxonomyPages;
      const taxonomy = await competencyTaxonomySeeder({
        taxonomyType: 'competency',
        access: 'unassigned',
      });

      await expectUnreadable(page.request, config, taxonomy.id);

      await competency.open(taxonomy.id);
      await expectErrorNotRedirect(competency, page, taxonomy.id);

      await detail.open(taxonomy.id);
      await expect(detail.errorAlert).toBeVisible({ timeout: TIMEOUTS.taxonomyQueryError });
    });

    test('shows the error alert for a non-numeric id on both pages', async ({
      page,
      authorTaxonomyPages,
    }) => {
      // Any signed-in Studio user will do: the id never names a taxonomy.
      const { competency, detail } = authorTaxonomyPages;

      await competency.open('abc');
      await expectErrorNotRedirect(competency, page, 'abc');

      await detail.open('abc');
      await expect(detail.errorAlert).toBeVisible({ timeout: TIMEOUTS.taxonomyQueryError });
      await expect(page).toHaveURL(/\/taxonomy\/abc$/);
    });

    test('reads a zero-padded id as the number when it redirects', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { competency, detail, page, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({ type: 'tags', label: 'guard-padded' });

      await competency.open(`0${taxonomy.id}`);

      await expect(page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}$`));
      await expect(detail.menuButton).toBeVisible();
    });

    test('redirects a Competency taxonomy the user can read but not tag, and omits Apply Competencies', async ({
      config,
      competencyTaxonomySeeder,
      staffTaxonomyColleague,
    }) => {
      // A disabled taxonomy is readable by global staff, but nobody may tag with it,
      // so the user is a real one with `canTagObject: false` and nothing is faked.
      const seeded = await competencyTaxonomySeeder({
        taxonomyType: 'competency',
        access: 'unassigned',
        enabled: false,
      });
      const staff = await staffTaxonomyColleague();
      const taxonomy = await fetchTaxonomy(staff.request, config, seeded.id);
      expect(taxonomy).toMatchObject({
        enabled: false,
        canTagObject: false,
        taxonomyType: 'competency',
      });

      await staff.detail.goto(taxonomy.id);
      await expect.poll(() => staff.detail.menuItemIds()).toEqual(expectedTaxonomyMenu(taxonomy));

      await staff.competency.open(taxonomy.id);
      await expect(staff.page).toHaveURL(new RegExp(`/taxonomy/${taxonomy.id}$`));
      await expect(staff.detail.menuButton).toBeVisible();
      await expect(staff.competency.tree).toHaveCount(0);
    });

    test('shows the error alert, not a redirect, when the taxonomy request fails', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { competency, page, seed } = competencyTaxonomyAdmin;
      // A Tags taxonomy would redirect if its request succeeded, so a redirect here
      // would mean the page ignored the failed request.
      const taxonomy = await seed({ type: 'tags', label: 'guard-500' });
      // ADR-0003: one route, failing only, removed in `finally`. It matches the
      // taxonomy's own GET (with or without a query string), not `.../tags/`.
      const taxonomyRequest = (url: URL) => url.pathname.endsWith(`/taxonomies/${taxonomy.id}/`);
      const failTaxonomy = (route: Route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"detail":"e2e injected failure"}',
        });
      await page.route(taxonomyRequest, failTaxonomy);
      try {
        await competency.open(taxonomy.id);

        await expectErrorNotRedirect(competency, page, taxonomy.id);
      } finally {
        await page.unroute(taxonomyRequest, failTaxonomy);
      }
    });
  },
);

/**
 * Asserts the content-tagging API refuses this session the taxonomy with a client
 * error. The exact status is not the subject: a 5xx or a transport failure would
 * not show that the taxonomy is merely unreadable.
 */
async function expectUnreadable(
  request: APIRequestContext,
  config: AppConfig,
  id: number,
): Promise<void> {
  const status = await fetchTaxonomy(request, config, id).then(
    () => 200,
    (error: unknown) => {
      if (error instanceof ApiError) return error.status;
      throw error;
    },
  );
  expect(status, 'the author must not be able to read the taxonomy').toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
}

/**
 * Asserts `/taxonomy/<id>/competencies` shows the connection-error alert and stays put:
 * no redirect to `/taxonomy/<id>` and no competency tree. The alert waits out the app's
 * query retries.
 */
async function expectErrorNotRedirect(
  competency: CompetencyManagementPage,
  page: Page,
  idSegment: number | string,
): Promise<void> {
  await expect(competency.errorAlert).toBeVisible({ timeout: TIMEOUTS.taxonomyQueryError });
  await expect(page).toHaveURL(new RegExp(`/taxonomy/${idSegment}/competencies$`));
  await expect(competency.tree).toHaveCount(0);
}
