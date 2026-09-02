import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { issue, testId } from '../../../src/reporting';
import { catalogSearchTermFor, gotoDashboard, locateCourseInCatalog } from '../../../src/steps';

/**
 * Course discovery in the catalog MFE: reaching the catalog signed out and signed
 * in, finding a course in it, and opening that course's About page.
 *
 * **Two routes to a course, one of them optional.** The catalog renders a search
 * field only where the LMS enables course discovery — the `catalog-search`
 * capability. Where it does not (the default), the catalog is a plain paginated
 * list and the only route to a course is to page through it. So:
 *
 * - Tests about *reaching* a course go through `locateCourseInCatalog`, which
 *   takes whichever route the target offers, and run everywhere.
 * - Tests about *search itself* are tagged `@catalog-search`. They skip where the
 *   capability is undeclared, and where it is declared they assert the field is
 *   really there — so an installation that claims search but does not render it
 *   fails rather than quietly losing the coverage.
 *
 * The search term is the course **number** from the Course Detail API
 * (`catalogSearchTermFor`), never a title typed into the spec: it is an
 * identifier the platform does not translate, and it is data the test owns rather
 * than copy read off the page.
 */
/**
 * A search term that cannot match any course on any installation: this test's own
 * unique username, stripped to a single alphanumeric token. One token matters —
 * the search tokenizes on punctuation, so `no-such-course-<user>` would match any
 * course whose title contains the word "course".
 */
function unmatchableTerm(username: string): string {
  return `zzz${username.replace(/\W/g, '')}`;
}

test.describe('Course catalog discovery', () => {
  test(
    'is reachable and lists courses for an anonymous visitor',
    { tag: '@regression', annotation: testId('TC-00014') },
    async ({ page, config, catalogPage, courseDetail, courseKey }) => {
      await locateCourseInCatalog(
        catalogPage,
        config,
        courseKey,
        catalogSearchTermFor(courseDetail),
      );

      await expect(catalogPage.courseCard(courseKey)).toBeVisible();
      // Signed out, the header offers the catalog but no dashboard link.
      await expect(catalogPage.navDashboardLink).toHaveCount(0);

      await checkA11y(page, { label: 'catalog-anonymous' });
    },
  );

  test(
    'the page chrome labels its brand link',
    { tag: '@regression', annotation: testId('TC-00014') },
    async ({ page, catalogPage }) => {
      // The frontend-base shell's header and footer each wrap the site logo in a
      // link with no accessible name, so every page served in that shell fails
      // `image-alt` (critical) and `link-name` (serious) — the catalog is simply
      // where the suite meets it first. Both rules are in the global known-debt
      // baseline, so the scans above pass; this scan opts out of the baseline
      // entirely to assert the state we actually want, and passing here is the
      // signal to drop those two entries from `src/a11y/baseline.ts`.
      test.fixme(
        true,
        "BASE-001: the shell's header and footer brand links wrap an unlabelled logo image.",
      );

      await catalogPage.goto();

      await checkA11y(page, { label: 'shell-chrome', baseline: new Set(['color-contrast']) });
    },
  );

  test(
    'offers a search field where the installation enables course discovery',
    { tag: ['@regression', '@catalog-search'], annotation: testId('TC-00014') },
    async ({ catalogPage }) => {
      // The capability gate means this only runs where CAPABILITIES declares
      // catalog-search, so a missing field here is a real defect on that target —
      // which is the whole point of asserting it separately from the test above.
      await catalogPage.goto();

      await expect(catalogPage.searchInput).toBeVisible();
    },
  );

  test(
    'is reachable from the header for a signed-in learner',
    { tag: ['@regression', '@authenticated'], annotation: testId('TC-00015') },
    async ({ page, config, catalogPage, courseDetail, courseLearner }) => {
      const { courseKey } = courseLearner;

      // Start on the dashboard and use the header's catalog link — the journey the
      // test case describes, rather than a direct navigation.
      await gotoDashboard(page, config.baseUrls.lms);
      await catalogPage.gotoViaNavLink();

      await expect(catalogPage.resultsStatusBar).toBeVisible();
      // Already on the catalog, so this only takes the search-or-page route to the
      // course; the nav-link journey above is what the test case is about.
      await locateCourseInCatalog(
        catalogPage,
        config,
        courseKey,
        catalogSearchTermFor(courseDetail),
      );
      await expect(catalogPage.courseCard(courseKey)).toBeVisible();

      await checkA11y(page, { label: 'catalog' });
    },
  );

  test(
    'filters results by search term and restores them when cleared',
    { tag: ['@regression', '@authenticated', '@catalog-search'], annotation: testId('TC-00016') },
    async ({ catalogPage, courseDetail, courseKey }) => {
      await catalogPage.goto();
      // `goto` waits for the result status bar, which renders before the cards do,
      // so settle on the grid being populated before counting it — `count()` does
      // not retry.
      await expect(catalogPage.courseCards.first()).toBeVisible();
      const unfilteredCount = await catalogPage.courseCards.count();
      expect(unfilteredCount).toBeGreaterThan(0);

      await catalogPage.search(catalogSearchTermFor(courseDetail));

      // The searched course is among the results, and the result list is a subset
      // of the unfiltered one — the search actually narrowed something.
      await expect(catalogPage.courseCard(courseKey)).toBeVisible();
      expect(await catalogPage.courseCards.count()).toBeLessThanOrEqual(unfilteredCount);
      // Results present, so the MFE renders no empty-state region.
      await expect(catalogPage.noResultsAlert).toHaveCount(0);

      await catalogPage.clearSearch();
      await expect(catalogPage.searchInput).toHaveValue('');
    },
  );

  test(
    'reports an empty state when nothing matches',
    { tag: ['@regression', '@authenticated', '@catalog-search'], annotation: testId('TC-00016') },
    async ({ catalogPage, courseLearner }) => {
      await catalogPage.gotoWithSearch(unmatchableTerm(courseLearner.identity.username));

      await expect(catalogPage.courseCards).toHaveCount(0);
      // The empty-state copy is localized; that the region exists is not. Note the
      // region this passes on is currently the *wrong* message and the field is
      // gone with it — that half of TC-00016 is the fixme below (catalog#161).
      await expect(catalogPage.noResultsAlert).toBeVisible();
    },
  );

  test(
    'clears stale results when an in-page search matches nothing',
    {
      tag: ['@regression', '@authenticated', '@catalog-search'],
      annotation: [
        testId('TC-00016'),
        issue('https://github.com/openedx/frontend-app-catalog/issues/161'),
      ],
    },
    async ({ catalogPage, courseLearner }) => {
      // Searching from the field for a term with no matches updates the URL and
      // the empty-state message but leaves the previous result cards rendered, so
      // the page shows courses and "no results" at once. That stale list is step 3
      // of catalog#161's repro. Deep-linking the same query clears the cards
      // correctly, which the test above covers.
      test.fixme(
        true,
        'Stale result cards survive an in-page empty search: ' +
          'https://github.com/openedx/frontend-app-catalog/issues/161',
      );

      await catalogPage.goto();
      await expect(catalogPage.courseCards.first()).toBeVisible();

      await catalogPage.search(unmatchableTerm(courseLearner.identity.username));

      await expect(catalogPage.courseCards).toHaveCount(0);
      await expect(catalogPage.noResultsAlert).toBeVisible();
    },
  );

  test(
    'keeps the search field usable when a search matches nothing',
    {
      tag: ['@regression', '@authenticated', '@catalog-search'],
      annotation: [
        testId('TC-00016'),
        issue('https://github.com/openedx/frontend-app-catalog/issues/161'),
      ],
    },
    async ({ catalogPage, courseLearner }) => {
      // The empty state drops the search and filter UI altogether and shows a
      // "no courses available in the catalog" block — wrong, since the catalog is
      // not empty, and a dead end, since the learner has no field left to correct
      // the term in. TC-00016 requires the search remain usable, so this asserts
      // the intended behaviour and stays fixme until catalog#161 lands.
      test.fixme(
        true,
        'The empty search state removes the search UI and reports the wrong error: ' +
          'https://github.com/openedx/frontend-app-catalog/issues/161',
      );

      await catalogPage.gotoWithSearch(unmatchableTerm(courseLearner.identity.username));

      await expect(catalogPage.courseCards).toHaveCount(0);
      // Still able to search again without leaving the page.
      await expect(catalogPage.searchInput).toBeVisible();
      await expect(catalogPage.searchInput).toHaveValue(
        unmatchableTerm(courseLearner.identity.username),
      );
    },
  );

  test(
    "the About page's course content distinguishes links without colour",
    { tag: ['@regression', '@authenticated'], annotation: testId('TC-00018') },
    async ({ page, config, catalogPage, courseAboutPage, courseDetail, courseKey }) => {
      // The seeded course's authored overview HTML carries a link distinguished by
      // colour alone — 1.72:1 contrast against the surrounding text and no
      // underline — failing axe `link-in-text-block` (serious, WCAG 1.4.1). That is
      // a fix to the course content rather than to the MFE, so it is tracked
      // outside this repo. The TC-00018 test below tolerates the rule for this one
      // screen; this asserts the state we actually want.
      test.fixme(true, 'Seeded course overview links are distinguished by colour alone.');

      await locateCourseInCatalog(
        catalogPage,
        config,
        courseKey,
        catalogSearchTermFor(courseDetail),
      );
      await catalogPage.openCourseAbout(courseKey);
      await expect(courseAboutPage.enrollButton).toBeVisible();

      await checkA11y(page, { label: 'course-about-content' });
    },
  );

  test(
    'clears the search in a single click of its reset control',
    {
      tag: ['@regression', '@authenticated', '@catalog-search'],
      annotation: [
        testId('TC-00016'),
        issue('https://github.com/openedx/frontend-app-catalog/issues/160'),
      ],
    },
    async ({ catalogPage, courseDetail }) => {
      // The search field's wrapper paints above the reset button, so a mouse user
      // needs two clicks — one to move focus, one to activate. `clearSearch()`
      // uses the keyboard and passes today (see the filtering test above); this
      // covers the pointer path the defect breaks.
      test.fixme(
        true,
        'The clear-search button needs two clicks: ' +
          'https://github.com/openedx/frontend-app-catalog/issues/160',
      );

      await catalogPage.goto();
      await catalogPage.search(catalogSearchTermFor(courseDetail));

      await catalogPage.clearSearchByClick();

      await expect(catalogPage.searchInput).toHaveValue('');
    },
  );

  test(
    "opens a course's About page from its catalog result",
    { tag: ['@regression', '@authenticated'], annotation: testId('TC-00018') },
    async ({ page, config, catalogPage, courseAboutPage, courseDetail, courseKey }) => {
      // Reached by search where the target has it, by paging the catalog where it
      // does not — the card is the same card either way, and it is opening the
      // card that this test case is about.
      await locateCourseInCatalog(
        catalogPage,
        config,
        courseKey,
        catalogSearchTermFor(courseDetail),
      );
      await catalogPage.openCourseAbout(courseKey);

      expect(page.url()).toBe(courseAboutPage.url(courseKey));
      await expect(courseAboutPage.enrollButton).toBeVisible();
      // The details sidebar renders as label/value pairs.
      await expect(courseAboutPage.detailsItemLabels.first()).toBeVisible();
      await expect(courseAboutPage.detailsItemValues).toHaveCount(
        await courseAboutPage.detailsItemLabels.count(),
      );

      // Tolerated for this screen only, so the rule still fails everywhere else:
      // the one failing node is in the course's *authored* overview HTML, not in the
      // MFE. The fixme test above asserts the untolerated behaviour; drop the two
      // together once the course content is fixed.
      await checkA11y(page, {
        label: 'course-about',
        additionalBaseline: ['link-in-text-block'],
      });
    },
  );
});
