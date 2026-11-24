import {
  libraryOlx,
  publishLibraryBlock,
  setLibraryBlockOlx,
  setObjectTags,
} from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { testId } from '../../../src/reporting';
import { TAG } from '../../../src/steps';
import { LIBRARY_TAGS, authorTextBlock, label } from './helpers';

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
      const term = text.display_name.split(' ').pop() ?? '';
      await libraryPage.search(term);
      await expect(libraryPage.cardFor(text.display_name)).toHaveCount(1, {
        timeout: TIMEOUTS.librarySearch,
      });
      await expect(libraryPage.cardFor(problem.display_name)).toHaveCount(0, {
        timeout: TIMEOUTS.librarySearch,
      });
      await expect(libraryPage.cards).toHaveCount(1);
      // The match is highlighted in the card: the typed word, marked.
      await expect(libraryPage.highlightsIn(text.display_name).first()).toHaveText(term, {
        ignoreCase: true,
      });

      // The field's own "×" clears the search.
      await libraryPage.resetSearch();
      await expect(libraryPage.searchInput).toHaveValue('');
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
    'sorts results by newest, oldest and most recently modified',
    { annotation: testId('TC-00332') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      // Three blocks of this test's own, created in order; then the second is
      // edited, so it is the most recently modified while first in neither
      // creation order — each sort below gives an order of its own.
      const base = label('sort', testInfo.testId);
      const blocks = [];
      for (const suffix of ['one', 'two', 'three']) {
        blocks.push(
          await authorTextBlock(page.request, config, authoringLibrary.id, `${base} ${suffix}`),
        );
      }
      const [first, second, third] = blocks;
      await setLibraryBlockOlx(
        page.request,
        config,
        second!.id,
        libraryOlx.html(second!.display_name, `${second!.display_name} edited`),
      );
      const created = blocks.map((b) => b.display_name);
      const modified = [second!, third!, first!].map((b) => b.display_name);
      const titles = () => libraryPage.cardTitles.allInnerTexts();

      await libraryPage.goto(authoringLibrary.id, 'components');
      await expect(libraryPage.cards).toHaveCount(blocks.length, {
        timeout: TIMEOUTS.librarySearch,
      });
      await libraryPage.sortBy('newest');
      await expect
        .poll(titles, { timeout: TIMEOUTS.librarySearch })
        .toEqual([...created].reverse());
      await libraryPage.sortBy('oldest');
      await expect.poll(titles, { timeout: TIMEOUTS.librarySearch }).toEqual(created);
      await libraryPage.sortBy('recentlyModified');
      await expect.poll(titles, { timeout: TIMEOUTS.librarySearch }).toEqual(modified);

      // Recently published: published one at a time, in an order no other sort
      // gives, the last one published leads.
      const publishOrder = [third!, first!, second!];
      for (const block of publishOrder) {
        await publishLibraryBlock(page.request, config, block.id);
      }
      await libraryPage.sortBy('recentlyPublished');
      await expect
        .poll(titles, { timeout: TIMEOUTS.librarySearch })
        .toEqual([...publishOrder].reverse().map((b) => b.display_name));
    },
  );

  test(
    'sorts search results by relevance',
    { annotation: testId('TC-00332') },
    async ({ page, config, studioAuthorSession, authoringLibrary, libraryPage }, testInfo) => {
      void studioAuthorSession;
      // One word of this test's own, in the title of the middle block and only
      // in the body of the other two. A title match outranks a body match, so
      // relevance leads with the middle block — which is first in neither
      // creation order nor modification order.
      const base = label('rank', testInfo.testId);
      const word = `relevant${testInfo.testId.slice(-6)}`;
      const bodyFirst = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        `${base} one`,
        `body ${word}`,
      );
      const titled = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        `${base} ${word}`,
        'body',
      );
      const bodyLast = await authorTextBlock(
        page.request,
        config,
        authoringLibrary.id,
        `${base} three`,
        `body ${word}`,
      );
      const titles = () => libraryPage.cardTitles.allInnerTexts();

      await libraryPage.goto(authoringLibrary.id, 'components');
      await expect(libraryPage.cards).toHaveCount(3, { timeout: TIMEOUTS.librarySearch });
      await libraryPage.search(word);
      await expect(libraryPage.cards).toHaveCount(3, { timeout: TIMEOUTS.librarySearch });

      // With a term typed the sort menu gains "Most Relevant" and uses it.
      await expect
        .poll(async () => (await titles())[0], { timeout: TIMEOUTS.librarySearch })
        .toBe(titled.display_name);
      await libraryPage.sortBy('oldest');
      await expect
        .poll(titles, { timeout: TIMEOUTS.librarySearch })
        .toEqual([bodyFirst, titled, bodyLast].map((b) => b.display_name));
      await libraryPage.sortBy('mostRelevant');
      await expect
        .poll(async () => (await titles())[0], { timeout: TIMEOUTS.librarySearch })
        .toBe(titled.display_name);
    },
  );

  test(
    'refines results by tags and clears the filter',
    { tag: '@taxonomies', annotation: testId('TC-00329') },
    async ({ page, config, studioAuthorSession, seededLibrary, workerTaxonomy, libraryPage }) => {
      void studioAuthorSession;
      const { text, problem } = seededLibrary.blocks;
      const taxonomy = workerTaxonomy.taxonomy;
      const all = Object.keys(seededLibrary.blocks).length;
      // Tag two seeded blocks through the API — one with a nested tag, one with
      // a top-level tag of another branch; the UI drives the refinement, the
      // search index decides the card set. The taxonomy is assigned to the
      // library's org, so it surfaces as the root facet on the library search.
      await setObjectTags(page.request, config, text.id, taxonomy.id, [TAG.childOneA]);
      await setObjectTags(page.request, config, problem.id, taxonomy.id, [TAG.parentTwo]);
      const onlyCard = async (title: string) => {
        await expect(libraryPage.cardFor(title)).toHaveCount(1, {
          timeout: TIMEOUTS.librarySearch,
        });
        await expect(libraryPage.cards).toHaveCount(1, { timeout: TIMEOUTS.librarySearch });
      };
      const cleared = async () => {
        await libraryPage.clearFilter('tags');
        await expect(libraryPage.cards).toHaveCount(all, { timeout: TIMEOUTS.librarySearch });
      };

      await libraryPage.goto(seededLibrary.libraryKey, 'components');
      await expect(libraryPage.cards).toHaveCount(all, { timeout: TIMEOUTS.librarySearch });

      // The taxonomy itself: everything tagged in it.
      await libraryPage.toggleTagFilterByPath([taxonomy.name]);
      await expect(libraryPage.cardFor(text.display_name)).toHaveCount(1, {
        timeout: TIMEOUTS.librarySearch,
      });
      await expect(libraryPage.cardFor(problem.display_name)).toHaveCount(1);
      await expect(libraryPage.cards).toHaveCount(2, { timeout: TIMEOUTS.librarySearch });
      await cleared();

      // A top-level tag, from the taxonomy's drop-down.
      await libraryPage.toggleTagFilterByPath([taxonomy.name, TAG.parentTwo]);
      await onlyCard(problem.display_name);
      await cleared();

      // A nested tag, two drop-downs deep.
      await libraryPage.toggleTagFilterByPath([taxonomy.name, TAG.parentOne, TAG.childOneA]);
      await onlyCard(text.display_name);
      await cleared();
      await libraryPage.dismissMenu();
    },
  );
});
