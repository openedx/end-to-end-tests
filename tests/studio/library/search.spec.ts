import { setObjectTags } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { testId } from '../../../src/reporting';
import { TAG } from '../../../src/steps';
import { LIBRARY_TAGS } from './helpers';

/**
 * Searching and filtering a content library (TC-00328, TC-00330, TC-00331,
 * TC-00332). The library MFE searches Meilisearch directly with a per-user
 * token, so the oracle is the rendered card set for the test's **own** titles
 * (the seeded library's items), never a suite-side search client.
 * Every assertion is a `toHaveCount`, which retries while the index answers.
 *
 * TC-00329 (refine by tags) tags one seeded block with an org taxonomy, then
 * refines the search by that tag; the taxonomy fixture gates it on an admin.
 */
test.describe('Content library search', { tag: ['@regression', ...LIBRARY_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'searches by free text and clears the search',
    { annotation: testId('TC-00328') },
    async ({ studioAuthorSession, seededLibrary, libraryPage }) => {
      void studioAuthorSession;
      const { text, problem } = seededLibrary.blocks;
      await libraryPage.goto(seededLibrary.libraryKey, 'components');
      await expect(libraryPage.cardFor(text.display_name)).toHaveCount(1, {
        timeout: TIMEOUTS.librarySearch,
      });
      await expect(libraryPage.cards).toHaveCount(Object.keys(seededLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });

      // The last word alone: the shared label prefix would match every card.
      await libraryPage.search(text.display_name.split(' ').pop() ?? '');
      await expect(libraryPage.cardFor(text.display_name)).toHaveCount(1, {
        timeout: TIMEOUTS.librarySearch,
      });
      await expect(libraryPage.cardFor(problem.display_name)).toHaveCount(0, {
        timeout: TIMEOUTS.librarySearch,
      });
      await expect(libraryPage.cards).toHaveCount(1);

      await libraryPage.clearSearch();
      await expect(libraryPage.cards).toHaveCount(Object.keys(seededLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });
    },
  );

  test(
    'refines results by content type and clears the filter',
    { annotation: testId('TC-00330') },
    async ({ studioAuthorSession, seededLibrary, libraryPage }) => {
      void studioAuthorSession;
      const { problem, text } = seededLibrary.blocks;
      await libraryPage.goto(seededLibrary.libraryKey, 'components');
      await expect(libraryPage.cards).toHaveCount(Object.keys(seededLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });

      await libraryPage.toggleTypeFilter('problem');
      await expect(libraryPage.cardFor(problem.display_name)).toHaveCount(1, {
        timeout: TIMEOUTS.librarySearch,
      });
      await expect(libraryPage.cardFor(text.display_name)).toHaveCount(0);
      await expect(libraryPage.cards).toHaveCount(1);

      await libraryPage.clearFilter('type');
      await libraryPage.dismissMenu();
      await expect(libraryPage.cards).toHaveCount(Object.keys(seededLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });
    },
  );

  test(
    'refines results by publish status and clears the filter',
    { annotation: testId('TC-00331') },
    async ({ studioAuthorSession, seededLibrary, libraryPage }) => {
      void studioAuthorSession;
      await libraryPage.goto(seededLibrary.libraryKey, 'components');
      await expect(libraryPage.cards).toHaveCount(Object.keys(seededLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });

      // The seeded library is fully published: nothing is "never published".
      await libraryPage.togglePublishStatusFilter('never');
      await expect(libraryPage.cards).toHaveCount(0, { timeout: TIMEOUTS.librarySearch });
      await libraryPage.togglePublishStatusFilter('never');
      await libraryPage.togglePublishStatusFilter('published');
      await expect(libraryPage.cards).toHaveCount(Object.keys(seededLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });

      await libraryPage.clearFilter('publishStatus');
      await libraryPage.dismissMenu();
      await expect(libraryPage.cards).toHaveCount(Object.keys(seededLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });
    },
  );

  test(
    'sorts results by title in both directions',
    { annotation: testId('TC-00332') },
    async ({ studioAuthorSession, seededLibrary, libraryPage }) => {
      void studioAuthorSession;
      const titles = Object.values(seededLibrary.blocks).map((b) => b.display_name);
      const ascending = [...titles].sort((a, b) => a.localeCompare(b));
      await libraryPage.goto(seededLibrary.libraryKey, 'components');
      await expect(libraryPage.cards).toHaveCount(Object.keys(seededLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });

      await libraryPage.sortBy('titleAZ');
      await expect
        .poll(() => libraryPage.cardTitles.allInnerTexts(), {
          timeout: TIMEOUTS.librarySearch,
        })
        .toEqual(ascending);

      await libraryPage.sortBy('titleZA');
      await expect
        .poll(() => libraryPage.cardTitles.allInnerTexts(), {
          timeout: TIMEOUTS.librarySearch,
        })
        .toEqual([...ascending].reverse());
    },
  );

  test(
    'refines results by tags and clears the filter',
    { tag: '@taxonomies', annotation: testId('TC-00329') },
    async ({ page, config, studioAuthorSession, workerLibrary, workerTaxonomy, libraryPage }) => {
      void studioAuthorSession;
      const { text } = workerLibrary.blocks;
      // Tag one seeded block through the API; the UI drives the refinement, the
      // search index decides the card set. The taxonomy is assigned to the
      // library's org, so it surfaces as the root facet on the library search;
      // selecting that taxonomy node filters to the content tagged in it.
      await setObjectTags(page.request, config, text.id, workerTaxonomy.taxonomy.id, [
        TAG.parentOne,
      ]);

      await libraryPage.goto(workerLibrary.libraryKey, 'components');
      await expect(libraryPage.cards).toHaveCount(Object.keys(workerLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });

      await libraryPage.toggleTagFilterByValue(workerTaxonomy.taxonomy.name);
      await expect(libraryPage.cardFor(text.display_name)).toHaveCount(1, {
        timeout: TIMEOUTS.librarySearch,
      });
      await expect(libraryPage.cards).toHaveCount(1, { timeout: TIMEOUTS.librarySearch });

      await libraryPage.clearFilter('tags');
      await libraryPage.dismissMenu();
      await expect(libraryPage.cards).toHaveCount(Object.keys(workerLibrary.blocks).length, {
        timeout: TIMEOUTS.librarySearch,
      });
    },
  );
});
