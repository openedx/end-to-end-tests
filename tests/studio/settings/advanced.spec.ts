import { checkA11y } from '../../../src/a11y';
import {
  ApiError,
  enrollInCourseViaApi,
  fetchAdvancedSettings,
  fetchCourseDetail,
  fetchCourseEnrollmentDetails,
  fetchCourseMetadata,
  fetchCoursewareCourse,
  fetchLearnerHome,
  isCourseHiddenFromCatalog,
  isEnrolled,
  learnerHomeCourse,
  updateAdvancedSettings,
} from '../../../src/api';
import { newCleanBrowserContext } from '../../../src/auth';
import { getRunId, TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { CatalogPage } from '../../../src/pages/lms/catalog/catalog.page';
import { CourseAboutPage } from '../../../src/pages/lms/catalog/course-about.page';
import { testId } from '../../../src/reporting';
import { isCourseListedInCatalog } from '../../../src/steps';

/**
 * Advanced Settings (authoring MFE), on the worker's own course.
 *
 * Each setting is a JSON `<textarea>` keyed by its camelCase policy name. The MFE
 * drives the edit; Studio's `advanced_settings` echo and the LMS course /
 * enrollment / course-home APIs decide the outcome. Each test resets the setting
 * it touches through the API first, so the tests are independent.
 */

/** The value of one Advanced Setting as Studio echoes it back. */
const settingValue = async (
  request: Parameters<typeof fetchAdvancedSettings>[0],
  config: Parameters<typeof fetchAdvancedSettings>[1],
  courseKey: string,
  name: string,
): Promise<unknown> => (await fetchAdvancedSettings(request, config, courseKey))[name]?.value;

test.describe('Advanced Settings', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  test(
    'updates the course display name',
    { tag: '@smoke', annotation: testId('TC-00267') },
    async ({ page, config, authoredCourse, advancedSettingsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      const name = `E2E Renamed ${getRunId()}`;

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('displayName', name);
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => ({
          studio: await settingValue(api, config, courseKey, 'display_name'),
          lms: (await fetchCourseDetail(api, config, courseKey)).name,
        }))
        .toEqual({ studio: name, lms: name });

      await checkA11y(page, { label: 'studio-advanced' });
    },
  );

  test(
    'sets the maximum student enrollment',
    { tag: '@regression', annotation: testId('TC-00268') },
    async ({ page, config, authoredCourse, advancedSettingsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateAdvancedSettings(api, config, courseKey, {
        max_student_enrollments_allowed: null,
      });

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('maxStudentEnrollmentsAllowed', 250);
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(() => settingValue(api, config, courseKey, 'max_student_enrollments_allowed'))
        .toBe(250);

      await updateAdvancedSettings(api, config, courseKey, {
        max_student_enrollments_allowed: null,
      });
    },
  );

  test(
    'controls catalog visibility',
    { tag: '@regression', annotation: testId('TC-00269') },
    async ({
      page,
      browser,
      config,
      authoredCourse,
      advancedSettingsPage,
      studioAuthorSession,
      newLearner,
    }) => {
      test.setTimeout(TIMEOUTS.contentTest);
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateAdvancedSettings(api, config, courseKey, { catalog_visibility: 'both' });

      // Two learners, neither staff (staff bypass the visibility, as the case
      // notes): one enrolled while the course is visible, and a newcomer who
      // browses the catalog and the About page in a browser of their own.
      const enrolled = await newLearner();
      await enrollInCourseViaApi(enrolled.request, config, courseKey);
      const newcomer = await newLearner();
      const context = await newCleanBrowserContext(browser);
      await context.addCookies((await newcomer.request.storageState()).cookies);
      const newcomerPage = await context.newPage();
      const catalog = new CatalogPage(newcomerPage, config);
      const about = new CourseAboutPage(newcomerPage, config);

      const setVisibility = async (value: 'none' | 'about' | 'both') => {
        await advancedSettingsPage.goto(courseKey);
        await advancedSettingsPage.setField('catalogVisibility', value);
        expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);
      };
      // What the newcomer finds: the course in the catalog or not, and how the
      // Course Detail API answers them. One reading, so it can be polled while
      // the catalog's index catches up with the setting.
      const found = async () => ({
        studio: await settingValue(api, config, courseKey, 'catalog_visibility'),
        listed: await isCourseListedInCatalog(catalog, config, courseKey, authoredCourse.number),
        hidden: await isCourseHiddenFromCatalog(
          newcomer.request,
          config,
          courseKey,
          newcomer.identity.username,
        ),
      });
      const catchUp = { timeout: TIMEOUTS.contentPublish };

      try {
        // "none": not in the catalog, and the About page has no course to show
        // the newcomer — while the enrolled learner keeps the course on their
        // dashboard.
        await setVisibility('none');
        await expect.poll(found, catchUp).toEqual({ studio: 'none', listed: false, hidden: true });
        expect(await about.gotoReadingCourse(courseKey)).not.toBe(200);
        await expect(about.enrollButton).toHaveCount(0);
        const dashboard = await fetchLearnerHome(enrolled.request, config);
        expect('courses' in dashboard && learnerHomeCourse(dashboard, courseKey)).toBeTruthy();

        // "about": still not in the catalog, but the About page serves anyone
        // who has its address, with its enroll call to action.
        await setVisibility('about');
        await expect
          .poll(async () => ({
            studio: await settingValue(api, config, courseKey, 'catalog_visibility'),
            listed: await isCourseListedInCatalog(
              catalog,
              config,
              courseKey,
              authoredCourse.number,
            ),
          }))
          .toEqual({ studio: 'about', listed: false });
        await about.gotoRendered(courseKey);
        await expect(about.enrollButton).toBeVisible();

        // "both": listed in the catalog, and its card leads to the About page.
        await setVisibility('both');
        await expect.poll(found, catchUp).toEqual({ studio: 'both', listed: true, hidden: false });
        await catalog.openCourseAbout(courseKey);
        await expect(about.enrollButton).toBeVisible();
      } finally {
        await context.close();
        await updateAdvancedSettings(api, config, courseKey, { catalog_visibility: 'both' });
      }
    },
  );

  test(
    'enables invitation-only enrollment',
    { tag: '@regression', annotation: testId('TC-00271') },
    async ({
      page,
      config,
      authoredCourse,
      advancedSettingsPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateAdvancedSettings(api, config, courseKey, { invitation_only: false });

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('invitationOnly', true);
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);

      // The LMS marks the course invitation-only, and a self-enroll is refused.
      await expect
        .poll(async () => ({
          studio: await settingValue(api, config, courseKey, 'invitation_only'),
          lms: (await fetchCourseDetail(api, config, courseKey)).invitationOnly,
          enrollLms: (await fetchCourseEnrollmentDetails(api, config, courseKey)).inviteOnly,
        }))
        .toEqual({ studio: true, lms: true, enrollLms: true });
      const learner = await newLearner();
      await expect(enrollInCourseViaApi(learner.request, config, courseKey)).rejects.toThrow(
        ApiError,
      );
      expect(await isEnrolled(learner.request, config, courseKey)).toBe(false);

      await updateAdvancedSettings(api, config, courseKey, { invitation_only: false });
    },
  );

  test(
    'makes the course available on mobile',
    { tag: '@regression', annotation: testId('TC-00272') },
    async ({ page, config, authoredCourse, advancedSettingsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateAdvancedSettings(api, config, courseKey, { mobile_available: false });

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('mobileAvailable', true);
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);

      await expect.poll(() => settingValue(api, config, courseKey, 'mobile_available')).toBe(true);
      await updateAdvancedSettings(api, config, courseKey, { mobile_available: false });
    },
  );

  test(
    'enables the calculator',
    { tag: '@regression', annotation: testId('TC-00273') },
    async ({
      page,
      config,
      authoredCourse,
      advancedSettingsPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateAdvancedSettings(api, config, courseKey, { show_calculator: false });
      const learner = await newLearner();
      await enrollInCourseViaApi(learner.request, config, courseKey);

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('showCalculator', true);
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);

      // Studio saved it, and an enrolled learner's courseware now offers the
      // calculator (the learning MFE's toggle reads this flag; TC-00039 uses it).
      await expect
        .poll(async () => ({
          studio: await settingValue(api, config, courseKey, 'show_calculator'),
          learner: (await fetchCoursewareCourse(learner.request, config, courseKey))
            .show_calculator,
        }))
        .toEqual({ studio: true, learner: true });
      await updateAdvancedSettings(api, config, courseKey, { show_calculator: false });
    },
  );

  test(
    'enables the word cloud advanced module',
    { tag: '@regression', annotation: testId('TC-00300') },
    async ({ page, config, authoredCourse, advancedSettingsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateAdvancedSettings(api, config, courseKey, { advanced_modules: [] });

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('advancedModules', ['word_cloud']);
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(() => settingValue(api, config, courseKey, 'advanced_modules'))
        .toEqual(['word_cloud']);
      await updateAdvancedSettings(api, config, courseKey, { advanced_modules: [] });
    },
  );

  test(
    'enables the Teams feature',
    { tag: ['@regression', '@teams'], annotation: testId('TC-00274') },
    async ({
      page,
      config,
      authoredCourse,
      advancedSettingsPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      // The Teams tab is driven by the course's `teams_configuration` (its
      // `enabled` flag, or the presence of team sets — `TeamsConfig.is_enabled` in
      // edx-platform), not by `advanced_modules`. A single open team set is the
      // smallest configuration Studio accepts.
      const teamsOff = { enabled: false, team_sets: [] };
      await updateAdvancedSettings(api, config, courseKey, { teams_configuration: teamsOff });
      const teamSet = {
        id: `e2e-${getRunId()}`,
        name: 'E2E team set',
        description: 'Authored by the e2e suite.',
        type: 'open',
        max_team_size: 5,
      };
      const teamsOn = { enabled: true, team_sets: [teamSet] };

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('teamsConfiguration', teamsOn);
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);
      await expect
        .poll(() => settingValue(api, config, courseKey, 'teams_configuration'))
        .toMatchObject({ enabled: true, team_sets: [{ id: teamSet.id }] });

      // A Teams tab appears in the learner's course navigation. The tab list comes
      // off the CourseOverview, which the CMS worker refreshes on the publish the
      // save triggers — so the reading is polled under the publish budget.
      const learner = await newLearner();
      await enrollInCourseViaApi(learner.request, config, courseKey);
      await expect
        .poll(
          async () => {
            const meta = await fetchCourseMetadata(learner.request, config, courseKey);
            return meta.tabs.some((tab) => tab.tab_id === 'teams');
          },
          { timeout: TIMEOUTS.contentPublish },
        )
        .toBe(true);

      await updateAdvancedSettings(api, config, courseKey, { teams_configuration: teamsOff });
    },
  );
});
