import { fetchStudioHome, listStudioCourses } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
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
    async ({ request, config, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;
      await studioHomePage.goto();

      // The brand logo's alt is "Studio <platform name>" — the rendered slot.
      const { platformName } = await fetchStudioHome(request, config);
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
      expect(await docLinks.count()).toBeGreaterThan(0);

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
    async ({ request, config, authoredCourse, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;
      await studioHomePage.goto();
      await studioHomePage.search(authoredCourse.number);

      // The rendered result set equals the API's for the same search, and includes
      // the worker course.
      await expect
        .poll(async () => {
          const rendered = await studioHomePage.renderedCourseKeys();
          const api = (
            await listStudioCourses(request, config, { search: authoredCourse.number })
          ).courses.map((course) => course.courseKey);
          return {
            hasWorkerCourse: rendered.includes(authoredCourse.courseKey),
            matchesApi: [...rendered].sort().join() === [...api].sort().join(),
          };
        })
        .toEqual({ hasWorkerCourse: true, matchesApi: true });
    },
  );

  test(
    'the sort control orders the list like the API',
    { tag: '@regression', annotation: testId('TC-00257') },
    async ({ request, config, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;
      await studioHomePage.goto();
      await studioHomePage.sortBy('za');

      // The rendered cards appear in the same relative order as the API's
      // `-display_name` ordering (comparing the rendered subset, so pagination
      // does not matter).
      await expect
        .poll(async () => {
          const rendered = await studioHomePage.renderedCourseKeys();
          const api = (
            await listStudioCourses(request, config, { order: '-display_name' })
          ).courses.map((course) => course.courseKey);
          const renderedInApiOrder = api.filter((key) => rendered.includes(key));
          return rendered.join() === renderedInApiOrder.join();
        })
        .toBe(true);
    },
  );
});
