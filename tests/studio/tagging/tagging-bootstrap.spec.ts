import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, getRunId } from '../../../src/config';
import { TAG, taxonomyImportFile } from '../../../src/steps';
import {
  DEFAULT_COURSE_ORG,
  buildSection,
  deleteTaxonomy,
  fetchObjectTagCounts,
  fetchObjectTags,
  fetchTaxonomy,
  importTaxonomy,
  listTaxonomies,
  listTaxonomyTags,
  setObjectTags,
  setTaxonomyOrgs,
  tagCountFor,
} from '../../../src/api';

/**
 * The tagging layer's own contract (Epic 11 plan §3 step 1): the
 * `content_tagging/v1/` client works end to end **with no UI**, so a broken
 * session, a changed API shape or a permission regression is reported here
 * rather than as a confusing failure in a drawer spec. No BTR case maps to
 * these.
 *
 * Two personas, measured as its two readings (plan headline decision 2):
 * managing a taxonomy is admin-only, and an author tags a course it created.
 */
test.describe(
  'Content tagging bootstrap',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test('the admin imports, assigns, reads and deletes a taxonomy', async ({
      adminApi,
      config,
    }) => {
      const org = config.org ?? DEFAULT_COURSE_ORG;
      const name = `E2E ${getRunId()} bootstrap ${test.info().testId.slice(-6)}`;

      const created = await importTaxonomy(adminApi, config, {
        name,
        description: 'E2E bootstrap taxonomy',
        file: taxonomyImportFile(),
      });
      expect(created.tagsCount).toBe(8);

      // The admin may create taxonomies; the list carries the new one.
      const list = await listTaxonomies(adminApi, config);
      expect(list.canAddTaxonomy).toBe(true);
      expect(list.taxonomies.map((t) => t.name)).toContain(name);

      // Assigning an org sticks, and the imported tags (parents and children) read back.
      await setTaxonomyOrgs(adminApi, config, created.id, [org]);
      expect((await fetchTaxonomy(adminApi, config, created.id)).orgs).toContain(org);
      expect((await listTaxonomyTags(adminApi, config, created.id)).map((t) => t.value)).toEqual(
        expect.arrayContaining([TAG.parentOne, TAG.childOneA, TAG.childOneB]),
      );

      // Delete removes it: a subsequent read is a 404.
      await deleteTaxonomy(adminApi, config, created.id);
      await expect(fetchTaxonomy(adminApi, config, created.id)).rejects.toMatchObject({
        status: 404,
      });
    });

    test('the worker author tags a course it created and reads the tags back', async ({
      page,
      config,
      workerTaxonomy,
      authoringCourse,
      // Resolved last so it primes the browser session *after* the admin and
      // course-provisioning work, whose re-auth would otherwise evict it.
      studioAuthorSession,
    }) => {
      void studioAuthorSession;
      const request = page.request;
      const { taxonomy, org } = workerTaxonomy;

      // The author sees the org-assigned taxonomy but may not manage it.
      const listed = await listTaxonomies(request, config, { org });
      expect(listed.canAddTaxonomy).toBe(false);
      expect(listed.taxonomies.map((t) => t.name)).toContain(taxonomy.name);

      const section = await buildSection(
        request,
        config,
        authoringCourse.courseKey,
        `E2E tag boot ${test.info().testId.slice(-6)}`,
      );

      // Tag the section with a child value: the API records it with the parent
      // first in its lineage (the "child implies parent" oracle).
      const applied = await setObjectTags(request, config, section.usageKey, taxonomy.id, [
        TAG.childOneA,
      ]);
      const appliedEntry = applied.find((t) => t.taxonomyId === taxonomy.id);
      expect(appliedEntry?.tags.map((t) => t.value)).toEqual([TAG.childOneA]);
      expect(appliedEntry?.tags[0]?.lineage).toEqual([TAG.parentOne, TAG.childOneA]);

      // Reading back agrees; the implicit count includes the implied parent (2),
      // the explicit count does not (1).
      const read = await fetchObjectTags(request, config, section.usageKey);
      expect(read.find((t) => t.taxonomyId === taxonomy.id)?.tags.map((t) => t.value)).toEqual([
        TAG.childOneA,
      ]);
      expect(
        tagCountFor(
          await fetchObjectTagCounts(request, config, [section.usageKey], { implicit: true }),
          section.usageKey,
        ),
      ).toBe(2);
      expect(
        tagCountFor(
          await fetchObjectTagCounts(request, config, [section.usageKey]),
          section.usageKey,
        ),
      ).toBe(1);

      // A value not in the taxonomy is rejected.
      await expect(
        setObjectTags(request, config, section.usageKey, taxonomy.id, ['E2E not a real tag']),
      ).rejects.toMatchObject({ status: 400 });

      // Clearing removes the tags (and the implied parent) — the object is untagged.
      await setObjectTags(request, config, section.usageKey, taxonomy.id, []);
      expect(await fetchObjectTags(request, config, section.usageKey)).toEqual([]);
    });
  },
);
