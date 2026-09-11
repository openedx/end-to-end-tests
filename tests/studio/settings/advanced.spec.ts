import { checkA11y } from '../../../src/a11y';
import {
  ApiError,
  enrollInCourseViaApi,
  fetchAdvancedSettings,
  fetchCourseDetail,
  fetchCourseEnrollmentDetails,
  fetchCourseMetadata,
  isEnrolled,
  updateAdvancedSettings,
} from '../../../src/api';
import { getRunId } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

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
    { tag: '@regression', annotation: testId('TC-00267') },
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
    async ({ page, config, authoredCourse, advancedSettingsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateAdvancedSettings(api, config, courseKey, { catalog_visibility: 'both' });

      // "none" hides the course from the catalog: the public Course Detail API
      // then stops serving it entirely, so the visibility is read from Studio's
      // own echo. "both" makes it discoverable again, which the LMS confirms.
      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('catalogVisibility', 'none');
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);
      await expect
        .poll(() => settingValue(api, config, courseKey, 'catalog_visibility'))
        .toBe('none');

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('catalogVisibility', 'both');
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);
      await expect
        .poll(async () => ({
          studio: await settingValue(api, config, courseKey, 'catalog_visibility'),
          hidden: (await fetchCourseDetail(api, config, courseKey)).hidden,
        }))
        .toEqual({ studio: 'both', hidden: false });
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
    async ({ page, config, authoredCourse, advancedSettingsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateAdvancedSettings(api, config, courseKey, { show_calculator: false });

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('showCalculator', true);
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);

      await expect.poll(() => settingValue(api, config, courseKey, 'show_calculator')).toBe(true);
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
      await updateAdvancedSettings(api, config, courseKey, { advanced_modules: [] });

      await advancedSettingsPage.goto(courseKey);
      await advancedSettingsPage.setField('advancedModules', ['teams']);
      expect((await advancedSettingsPage.save(courseKey)).status).toBe(200);
      await expect
        .poll(() => settingValue(api, config, courseKey, 'advanced_modules'))
        .toEqual(['teams']);

      // A Teams tab appears in the learner's course navigation.
      const learner = await newLearner();
      await enrollInCourseViaApi(learner.request, config, courseKey);
      await expect
        .poll(async () => {
          const meta = await fetchCourseMetadata(learner.request, config, courseKey);
          return meta.tabs.some((tab) => tab.tab_id === 'teams');
        })
        .toBe(true);

      await updateAdvancedSettings(api, config, courseKey, { advanced_modules: [] });
    },
  );
});
