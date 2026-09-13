import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  buildSection,
  fetchCourseIndex,
  reindexCourse,
  searchCourseDiscovery,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Course reindex (TC-00174): the author publishes content, a global-staff session
 * reindexes the course through Studio's `reindex_link`, and the LMS catalog search
 * then finds the course by its (test-unique) name.
 *
 * Ungated core coverage: courseware indexing is a stock feature that is on by
 * default, so this spec passes on any conformant target. A plain Tutor `main`
 * currently (2026-09-13) leaves it off only because the `FEATURES` flattening
 * transiently drops it (fix pending upstream); CI forces the setting as
 * a stopgap until then. A target with indexing off has a `null` `reindex_link`
 * and an empty catalog, so this spec fails loudly there rather than skipping —
 * that is the intended signal, not a permanent CI-only status.
 *
 * The Reindex control is global-staff-only, so the reindex runs through the
 * `adminApi` session; the author half and the search read use their own sessions.
 * The search term is the course's own unique display name (test-owned data, not
 * platform copy).
 */
test.describe('Course outline reindex', { tag: ['@regression', '@studio', '@author'] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'reindexes a course so the catalog search finds it',
    { annotation: testId('TC-00174') },
    async ({ page, config, authoringCourse, studioAuthorSession, adminApi }) => {
      void studioAuthorSession;
      const courseKey = authoringCourse.courseKey;

      // Author and publish a section so the course carries fresh content to index.
      await buildSection(
        page.request,
        config,
        courseKey,
        `E2E reindex ${test.info().testId.slice(-6)}`,
        { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
      );

      // The staff-only Reindex link is present once indexing is on; the author
      // never sees it. Reindex through it, then the catalog search finds the
      // course by its unique name.
      const index = await fetchCourseIndex(adminApi, config, courseKey);
      expect(index.reindex_link).not.toBeNull();
      await reindexCourse(adminApi, config, index.reindex_link as string);

      await expect
        .poll(
          async () =>
            (await searchCourseDiscovery(page.request, config, authoringCourse.displayName)).map(
              (hit) => hit.id,
            ),
          { timeout: TIMEOUTS.contentPublish },
        )
        .toContain(courseKey);
    },
  );
});
