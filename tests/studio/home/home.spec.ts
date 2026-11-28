import type { APIRequestContext } from '@playwright/test';

import { fetchStudioHome, listStudioCourses, type StudioCourseListQuery } from '../../../src/api';
import { getRunId, type AppConfig } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import type { StudioHomePage } from '../../../src/pages/studio/home/studio-home.page';
import { testId } from '../../../src/reporting';

/**
 * Studio Home chrome and list controls: the platform name, the help links, and
 * that the search and sort controls drive the list the way the underlying
 * `v2/home/courses` query does. Each control is compared with the same query the
 * MFE issues, in one poll, so the rendered order/contents are judged against the
 * API rather than a hand-built expectation.
 */
test.describe('Studio Home', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  test(
    'shows the platform name',
    { tag: '@regression', annotation: testId('TC-00254') },
    async ({ page, config, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      await studioHomePage.goto();

      // The brand logo's alt is "Studio <platform name>" — the rendered slot.
      const { platformName } = await fetchStudioHome(api, config);
      await expect(studioHomePage.brandLogo).toHaveAttribute(
        'alt',
        new RegExp(platformName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    },
  );

  test(
    'help links point off-platform',
    { tag: '@regression', annotation: testId('TC-00255') },
    async ({ page, config, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;
      await studioHomePage.goto();

      // The documentation links go to external docs, never back to the platform.
      const docLinks = page.locator('a[href*="docs.openedx.org"], a[href*="//openedx.org"]');
      await expect(docLinks).not.toHaveCount(0);

      const platformHosts = new Set(
        [config.baseUrls.lms, config.baseUrls.studio, config.baseUrls.apps]
          .filter((url): url is string => url !== undefined)
          .map((url) => new URL(url).host),
      );
      const hosts = await docLinks.evaluateAll((links) =>
        links.map((link) => new URL((link as HTMLAnchorElement).href).host),
      );
      for (const host of hosts) {
        expect(platformHosts.has(host)).toBe(false);
      }
    },
  );

  test(
    'search narrows the list to matching courses',
    { tag: '@regression', annotation: testId('TC-00256') },
    async ({ page, config, authoredCourse, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      await studioHomePage.goto();
      await studioHomePage.search(authoredCourse.number);

      // The rendered result set equals the API's for the same search, and includes
      // the worker course.
      await expect
        .poll(async () => {
          const rendered = await studioHomePage.renderedCourseKeys();
          const apiKeys = (
            await listStudioCourses(api, config, { search: authoredCourse.number })
          ).courses.map((course) => course.courseKey);
          return {
            hasWorkerCourse: rendered.includes(authoredCourse.courseKey),
            matchesApi: [...rendered].sort().join() === [...apiKeys].sort().join(),
          };
        })
        .toEqual({ hasWorkerCourse: true, matchesApi: true });
    },
  );

  test(
    'refines and sorts a search, and clears filters that match nothing',
    { tag: '@regression', annotation: testId('TC-00256') },
    async ({
      page,
      config,
      authoredCourse,
      contentCourse,
      studioHomePage,
      studioAuthorSession,
    }) => {
      void studioAuthorSession;
      void contentCourse;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      // The author's courses share the worker's org, so searching for it turns
      // up more than one result: the settings course and the content course.
      const search = authoredCourse.org;
      await studioHomePage.goto();
      await studioHomePage.search(search);

      // Refined by status: what is shown is what the same search and filter
      // answer through the API, and nothing of the other status.
      await studioHomePage.filterBy('active');
      await expect
        .poll(() => listAgreement(studioHomePage, api, config, { search, activeOnly: true }))
        .toEqual(AGREES);

      await studioHomePage.filterBy('archived');
      await expect
        .poll(() =>
          archivedAgreement(studioHomePage, api, config, authoredCourse.courseKey, search),
        )
        .toEqual(ARCHIVED_AGREES);
      await studioHomePage.filterBy('all');

      // Each sort orders the search's results the way the API orders them.
      for (const [kind, order] of SORTS) {
        await studioHomePage.sortBy(kind);
        await expect
          .poll(() => listAgreement(studioHomePage, api, config, { search, order }), {
            message: `sorted ${kind}`,
          })
          .toEqual(AGREES);
        expect((await studioHomePage.renderedCourseKeys()).length).toBeGreaterThan(1);
      }

      // A search nothing matches: the notice replaces the cards, and its
      // "Clear filters" brings the full listing back.
      await studioHomePage.search(`e2e-no-such-course-${getRunId()}`);
      await expect(studioHomePage.noResultsAlert).toBeVisible();
      await expect(studioHomePage.courseCards).toHaveCount(0);

      await studioHomePage.clearFilters();
      await expect(studioHomePage.noResultsAlert).toBeHidden();
      await expect(studioHomePage.searchInput).toHaveValue('');
      await expect.poll(() => listAgreement(studioHomePage, api, config, {})).toEqual(AGREES);
    },
  );

  test(
    'the sort control orders the list like the API',
    { tag: '@regression', annotation: testId('TC-00257') },
    async ({ page, config, contentCourse, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;
      void contentCourse;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      await studioHomePage.goto();

      // Each of the four sorts shows the cards in the API's order for it
      // (comparing the rendered subset, so pagination does not matter).
      for (const [kind, order] of SORTS) {
        await studioHomePage.sortBy(kind);
        await expect
          .poll(() => listAgreement(studioHomePage, api, config, { order }), {
            message: `sorted ${kind}`,
          })
          .toEqual(AGREES);
        expect((await studioHomePage.renderedCourseKeys()).length).toBeGreaterThan(1);
      }
    },
  );

  test(
    'the status filter refines the list without a search',
    { tag: '@regression', annotation: testId('TC-00257') },
    async ({ page, config, authoredCourse, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      await studioHomePage.goto();

      // Active: only courses the API lists as active, the worker course among them.
      await studioHomePage.filterBy('active');
      await expect
        .poll(() => listAgreement(studioHomePage, api, config, { activeOnly: true }))
        .toEqual(AGREES);

      // Archived: only courses whose end has passed, so not the worker course;
      // with none to show, the notice stands in for the cards. (Its "Clear
      // filters" is driven under TC-00256, where the empty result is certain.)
      await studioHomePage.filterBy('archived');
      await expect
        .poll(() => archivedAgreement(studioHomePage, api, config, authoredCourse.courseKey))
        .toEqual(ARCHIVED_AGREES);

      // Back to every course.
      await studioHomePage.filterBy('all');
      await expect.poll(() => listAgreement(studioHomePage, api, config, {})).toEqual(AGREES);
    },
  );
});

/** A page size no author's course list reaches, so one API read holds every match. */
const ALL = 500;

/** The sort menu's four options and the `order` each one asks the API for. */
const SORTS = [
  ['az', 'display_name'],
  ['za', '-display_name'],
  ['newest', '-created'],
  ['oldest', 'created'],
] as const;

/** {@link listAgreement} when the cards are the query's, in its order. */
const AGREES = { shown: true, fromQuery: true, inQueryOrder: true, notice: false };

/** {@link archivedAgreement} when the Archived filter shows what it should. */
const ARCHIVED_AGREES = { onlyArchived: true, activeCourseShown: false, noticeMatchesCount: true };

/**
 * Compares the rendered cards with the API's answer to the same query: that
 * cards are shown at all, that each is one the query returns, that they stand
 * in the order the query asks for, and whether the no-results notice is up. One reading,
 * for a single `expect.poll`.
 */
async function listAgreement(
  home: StudioHomePage,
  api: APIRequestContext,
  config: AppConfig,
  query: StudioCourseListQuery,
): Promise<typeof AGREES> {
  const rendered = await home.renderedCourseKeys();
  const apiKeys = (await listStudioCourses(api, config, { ...query, pageSize: ALL })).courses.map(
    (course) => course.courseKey,
  );
  return {
    shown: rendered.length > 0,
    fromQuery: rendered.every((key) => apiKeys.includes(key)),
    // Judged only for a query that names an order: the page's own default
    // sort is not the API's.
    inQueryOrder:
      query.order === undefined ||
      rendered.join() === apiKeys.filter((key) => rendered.includes(key)).join(),
    notice: await home.noResultsAlert.isVisible(),
  };
}

/**
 * The Archived filter's reading: every card is a course the API lists as
 * archived, an active course is not among them, and the no-results notice
 * stands in for the cards exactly when the API has no archived course to list.
 */
async function archivedAgreement(
  home: StudioHomePage,
  api: APIRequestContext,
  config: AppConfig,
  activeCourseKey: string,
  search?: string,
): Promise<typeof ARCHIVED_AGREES> {
  const archived = await listStudioCourses(api, config, {
    ...(search === undefined ? {} : { search }),
    archivedOnly: true,
    pageSize: ALL,
  });
  const rendered = await home.renderedCourseKeys();
  return {
    onlyArchived: rendered.every((key) =>
      archived.courses.some((course) => course.courseKey === key && !course.isActive),
    ),
    activeCourseShown: rendered.includes(activeCourseKey),
    noticeMatchesCount: (await home.noResultsAlert.isVisible()) === (archived.count === 0),
  };
}
