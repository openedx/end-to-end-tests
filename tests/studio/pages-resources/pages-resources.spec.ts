import { checkA11y } from '../../../src/a11y';
import { fetchCourseApps, fetchCourseMetadata } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Pages & Resources (authoring MFE), on the worker's own course.
 *
 * Each app is switched through its settings modal; Studio's `course_apps` API
 * decides whether the switch took, and the LMS course-home tabs decide what the
 * learner sees. Every toggle flips the app to the opposite of its current state
 * (read from the API first), so the Save always makes a real change, and restores
 * it, leaving the shared worker course as it found it. Apps are keyed by id, never
 * by the localized card title.
 */
test.describe('Pages & Resources', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  const isEnabled = (apps: Awaited<ReturnType<typeof fetchCourseApps>>, id: string): boolean =>
    apps.find((app) => app.id === id)?.enabled ?? false;

  const tabIds = (metadata: Awaited<ReturnType<typeof fetchCourseMetadata>>): string[] =>
    metadata.tabs.map((tab) => tab.tab_id);

  test(
    'toggling the progress app adds and removes its tab',
    { tag: '@regression', annotation: testId('TC-00241') },
    async ({ page, config, authoredCourse, pagesResourcesPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;

      await pagesResourcesPage.goto(courseKey);
      expect(await pagesResourcesPage.isPermissionDenied()).toBe(false);

      // Turn progress off: the app reports disabled and its tab disappears.
      expect(await pagesResourcesPage.setAppEnabled(courseKey, 'progress', false)).toBeLessThan(
        300,
      );
      await expect
        .poll(async () => ({
          enabled: isEnabled(await fetchCourseApps(api, config, courseKey), 'progress'),
          hasTab: tabIds(await fetchCourseMetadata(api, config, courseKey)).includes('progress'),
        }))
        .toEqual({ enabled: false, hasTab: false });

      await checkA11y(page, { label: 'studio-pages-resources' });

      // Turn it back on: the app reports enabled and its tab returns.
      expect(await pagesResourcesPage.setAppEnabled(courseKey, 'progress', true)).toBeLessThan(300);
      await expect
        .poll(async () => ({
          enabled: isEnabled(await fetchCourseApps(api, config, courseKey), 'progress'),
          hasTab: tabIds(await fetchCourseMetadata(api, config, courseKey)).includes('progress'),
        }))
        .toEqual({ enabled: true, hasTab: true });
    },
  );

  test(
    'toggling the wiki app adds and removes its tab',
    { tag: ['@regression', '@wiki'], annotation: testId('TC-00240') },
    async ({ page, config, authoredCourse, pagesResourcesPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await pagesResourcesPage.goto(courseKey);

      // The wiki tab tracks the app: flip it from its current state and back, and
      // the LMS tab appears and disappears with it (leaving the course as found).
      const wikiState = async () => ({
        enabled: isEnabled(await fetchCourseApps(api, config, courseKey), 'wiki'),
        hasTab: tabIds(await fetchCourseMetadata(api, config, courseKey)).includes('wiki'),
      });
      const before = (await wikiState()).enabled;

      expect(await pagesResourcesPage.setAppEnabled(courseKey, 'wiki', !before)).toBeLessThan(300);
      await expect.poll(wikiState).toEqual({ enabled: !before, hasTab: !before });

      expect(await pagesResourcesPage.setAppEnabled(courseKey, 'wiki', before)).toBeLessThan(300);
      await expect.poll(wikiState).toEqual({ enabled: before, hasTab: before });
    },
  );

  test(
    'view live links to the learner-facing course',
    { tag: '@regression', annotation: testId('TC-00238') },
    async ({ authoredCourse, pagesResourcesPage, studioAuthorSession }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      await pagesResourcesPage.goto(courseKey);

      // "View live" points at the learner-facing course home; the key is in the URL.
      await expect(pagesResourcesPage.viewLiveLink).toHaveAttribute(
        'href',
        new RegExp(`/learning/course/${courseKey.replace(/[+:]/g, '\\$&')}`),
      );
    },
  );

  test(
    'toggling the calculator app switches it on the course',
    { tag: '@regression', annotation: testId('TC-00239') },
    async ({ page, config, authoredCourse, pagesResourcesPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;

      // The calculator is a courseware tool, not a tab, so `course_apps` is the
      // authoritative read. Flip it from its current state and back.
      const before = isEnabled(await fetchCourseApps(api, config, courseKey), 'calculator');

      expect(await pagesResourcesPage.setAppEnabled(courseKey, 'calculator', !before)).toBeLessThan(
        300,
      );
      await expect
        .poll(async () => isEnabled(await fetchCourseApps(api, config, courseKey), 'calculator'))
        .toBe(!before);

      expect(await pagesResourcesPage.setAppEnabled(courseKey, 'calculator', before)).toBeLessThan(
        300,
      );
      await expect
        .poll(async () => isEnabled(await fetchCourseApps(api, config, courseKey), 'calculator'))
        .toBe(before);
    },
  );
});
