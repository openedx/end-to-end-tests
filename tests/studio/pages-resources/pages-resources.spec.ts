import { checkA11y } from '../../../src/a11y';
import {
  fetchAdvancedSettings,
  fetchCourseApps,
  fetchCourseHomeOutline,
  fetchCourseMetadata,
} from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
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
    'hiding the discussion tab removes it from the course and showing it brings it back',
    { tag: ['@regression', '@discussions'], annotation: testId('TC-00240') },
    async ({ page, config, authoredCourse, pagesResourcesPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await pagesResourcesPage.goto(courseKey);

      // The Discussion page's on/off control is the "Hide discussion tab"
      // switch of its provider dialog. The learner's course tabs decide: the
      // Discussion tab goes when it is hidden and returns when it is shown.
      // (`course_apps` keeps reporting the app enabled either way, so it is
      // not the oracle here.) The tabs follow through the LMS's copy of the
      // course, refreshed by a background task, hence the longer budget.
      test.setTimeout(TIMEOUTS.contentTest);
      const refreshed = { timeout: TIMEOUTS.contentPublish };
      const hasTab = async () =>
        tabIds(await fetchCourseMetadata(api, config, courseKey)).includes('discussion');
      // A new course has the tab.
      expect(await hasTab()).toBe(true);

      expect(await pagesResourcesPage.setDiscussionTabHidden(courseKey, true)).toBeLessThan(300);
      await expect.poll(hasTab, refreshed).toBe(false);

      expect(await pagesResourcesPage.setDiscussionTabHidden(courseKey, false)).toBeLessThan(300);
      await expect.poll(hasTab, refreshed).toBe(true);
    },
  );

  test(
    'view live links to the learner-facing course',
    { tag: '@regression', annotation: testId('TC-00238') },
    async ({
      page,
      config,
      contentCourse,
      pagesResourcesPage,
      courseOutlinePage,
      studioAuthorSession,
    }) => {
      void studioAuthorSession;
      test.setTimeout(TIMEOUTS.contentTest);
      // The content course, not the settings one: a course nothing was ever
      // published in has no outline, and the learning MFE cannot render it.
      const { courseKey } = contentCourse;
      await pagesResourcesPage.goto(courseKey);

      // "View live" points at the learner-facing course home in the configured
      // learning MFE; the key is in the URL…
      const course = `${config.mfeUrls.learning}/course/${courseKey}`;
      await expect(pagesResourcesPage.viewLiveLink).toHaveAttribute(
        'href',
        new RegExp(`^${escapeRegExp(course)}`),
      );
      // …and following it lands on that course, which renders: its tabs show.
      // The MFE can render the course only once the CMS worker has written its
      // outline (`PLAT-009`: until then it shows an error).
      await expect
        .poll(
          async () => (await fetchCourseHomeOutline(page.request, config, courseKey)) !== undefined,
          {
            timeout: TIMEOUTS.contentPublish,
          },
        )
        .toBe(true);
      await page.goto((await pagesResourcesPage.viewLiveLink.getAttribute('href')) ?? '');
      await expect(page).toHaveURL((url) => url.href.startsWith(course));
      await expect(courseOutlinePage.courseTabs.first()).toBeVisible({
        timeout: TIMEOUTS.navigation,
      });
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

  test(
    'switching flexible peer grading in the ORA settings sets it on the course',
    { tag: ['@regression', '@ora'], annotation: testId('TC-00239') },
    async ({ page, config, oraUnit, pagesResourcesPage, studioAuthorSession }) => {
      void studioAuthorSession;
      test.setTimeout(TIMEOUTS.contentTest);
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      // The ORA settings are offered only by a course that holds an open
      // response assessment, which `oraUnit` authors in the content course.
      const { courseKey } = oraUnit;
      const oraState = async () => ({
        app: isEnabled(await fetchCourseApps(api, config, courseKey), 'ora_settings'),
        setting: (await fetchAdvancedSettings(api, config, courseKey))
          .force_on_flexible_peer_openassessments?.value,
      });
      expect(
        (await fetchCourseApps(api, config, courseKey)).map((app) => app.id),
        'a course with an ORA offers the ORA settings',
      ).toContain('ora_settings');
      const before = (await oraState()).app;

      // Flip it from its current state and back: the app and the course's
      // Advanced Setting follow the switch each way.
      expect(await pagesResourcesPage.setFlexiblePeerGrading(courseKey, !before)).toBeLessThan(300);
      await expect.poll(oraState).toEqual({ app: !before, setting: !before });

      expect(await pagesResourcesPage.setFlexiblePeerGrading(courseKey, before)).toBeLessThan(300);
      await expect.poll(oraState).toEqual({ app: before, setting: before });
    },
  );
});

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
