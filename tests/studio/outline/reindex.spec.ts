import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  buildSection,
  fetchCourseIndex,
  searchCourseDiscovery,
  updateAdvancedSettings,
} from '../../../src/api';
import { StudioCourseOutlinePage } from '../../../src/pages/studio/course-outline.page';
import { testId } from '../../../src/reporting';

/**
 * Course reindex (TC-00174): the course's title changes in Advanced Settings, a
 * global-staff user clicks "Reindex" in the course outline, and the LMS catalog
 * search then finds the course by its new name.
 *
 * Gated on `catalog-search`: the catalog's search (the LMS course-discovery
 * endpoint this spec reads) exists only with `ENABLE_COURSE_DISCOVERY` on, and
 * a Tutor install loses that flag through the `FEATURES` flattening
 * (`TUTOR-001`). Courseware indexing must be on as well, or the outline has no
 * Reindex button and the spec fails on it.
 *
 * The Reindex control is global-staff-only, so it is clicked on `adminPage` (the
 * administrator signed into Studio in a browser of its own) and the staff-only
 * `reindex_link` is read off that same session. The author renames the course
 * and publishes content — setup, through the API — and the search read uses the
 * author's session. The search term is the course's new, test-unique name
 * (test-owned data, not platform copy).
 */
test.describe(
  'Course outline reindex',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@catalog-search'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'reindexes a renamed course so the catalog search finds its new name',
      { annotation: testId('TC-00174') },
      async ({ page, config, authoringCourse, studioAuthorSession, adminPage }, testInfo) => {
        void studioAuthorSession;
        const courseKey = authoringCourse.courseKey;
        // A name sharing no word with the old one, so only the reindexed entry matches.
        const token = `reidx${testInfo.testId.slice(-6).replace(/\W/g, '')}r${testInfo.retry}`;
        const newName = `E2E ${token}`;

        // Author content so the course carries something to index, then change
        // its title in Advanced Settings.
        await buildSection(
          page.request,
          config,
          courseKey,
          `E2E reindex ${testInfo.testId.slice(-6)}`,
          {
            subsections: [{ units: [{ blocks: ['html'] }] }],
            publish: true,
          },
        );
        const settings = await updateAdvancedSettings(page.request, config, courseKey, {
          display_name: newName,
        });
        expect(settings.display_name?.value).toBe(newName);

        // The staff-only Reindex control is offered (indexing is on) and clicking
        // it fires the reindex.
        expect(
          (await fetchCourseIndex(adminPage.request, config, courseKey)).reindex_link,
        ).not.toBeNull();
        const adminOutline = new StudioCourseOutlinePage(adminPage, config);
        await adminOutline.goto(courseKey);
        expect((await adminOutline.reindex()).ok()).toBe(true);

        // The catalog search finds the course under its new name.
        await expect
          .poll(
            async () =>
              (await searchCourseDiscovery(page.request, config, token)).find(
                (hit) => hit.id === courseKey,
              )?.display_name,
            { timeout: TIMEOUTS.contentPublish },
          )
          .toBe(newName);
      },
    );
  },
);
