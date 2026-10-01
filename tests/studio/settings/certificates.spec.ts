import { checkA11y } from '../../../src/a11y';
import {
  fetchCertificateConfiguration,
  fetchCourseSettingsFlags,
  resetCertificates,
} from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Certificates (authoring MFE), on the worker's own course.
 *
 * The MFE renders its authoring form only once the course has a certificate-bearing
 * mode (`STUDIO-006`), which the `certificateCourseMode` fixture adds with the
 * staff session. The MFE drives each change; Studio's certificate API decides the
 * outcome. There is no per-run course teardown and certificates accumulate, so
 * each test resets the course's certificates first. Certificates are created
 * through the MFE, not the certificate write API: the browser's own request is the
 * one that works across releases (the legacy Studio write handler answers a
 * non-browser JSON client with HTML on older releases such as verawood; the
 * delete used by the reset does work).
 */
test.describe('Certificates', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  const signatory = (name: string) => ({ name, title: 'Chair', organization: 'Open edX' });

  test(
    'sets up a certificate with three signatories',
    { tag: '@regression', annotation: testId('TC-00275') },
    async ({
      page,
      config,
      authoredCourse,
      certificatesPage,
      studioAuthorSession,
      certificateCourseMode,
    }) => {
      void studioAuthorSession;
      void certificateCourseMode;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await resetCertificates(api, config, courseKey);

      await certificatesPage.goto(courseKey);
      const created = await certificatesPage.createCertificate(courseKey, [
        signatory('Ada Lovelace'),
        signatory('Alan Turing'),
        signatory('Grace Hopper'),
      ]);
      expect(created.status).toBe(201);

      await expect
        .poll(async () => {
          const cfg = await fetchCertificateConfiguration(api, config, courseKey);
          return cfg.certificates[0]?.signatories.length;
        })
        .toBe(3);

      await checkA11y(page, { label: 'studio-certificates' });
      await resetCertificates(api, config, courseKey).catch(() => {});
    },
  );

  test(
    'previews the certificate',
    { tag: '@regression', annotation: testId('TC-00276') },
    async ({
      page,
      config,
      authoredCourse,
      certificatesPage,
      studioAuthorSession,
      certificateCourseMode,
    }) => {
      void studioAuthorSession;
      void certificateCourseMode;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await resetCertificates(api, config, courseKey);

      // The certificate is created through the MFE (the browser's own write works
      // across releases; see the spec-level note).
      await certificatesPage.goto(courseKey);
      await certificatesPage.createCertificate(courseKey, [signatory('Ada Lovelace')]);
      const cfg = await fetchCertificateConfiguration(api, config, courseKey);
      // The preview link points at the LMS certificate web view the API reports.
      // The API gives a protocol-relative URL; the page renders it scheme-qualified.
      const previewUrl = `${new URL(config.baseUrls.lms).protocol}${cfg.certificateWebViewUrl}`;
      await expect(certificatesPage.previewLink).toHaveAttribute('href', previewUrl);

      // That web view is reachable.
      const response = await api.get(previewUrl);
      expect(response.status()).toBeLessThan(400);

      await resetCertificates(api, config, courseKey).catch(() => {});
    },
  );

  test(
    'activates the course certificate',
    { tag: '@regression', annotation: testId('TC-00279') },
    async ({
      page,
      config,
      authoredCourse,
      certificatesPage,
      studioAuthorSession,
      certificateCourseMode,
    }) => {
      void studioAuthorSession;
      void certificateCourseMode;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await resetCertificates(api, config, courseKey);

      await certificatesPage.goto(courseKey);
      await certificatesPage.createCertificate(courseKey, [signatory('Ada Lovelace')]);
      expect((await certificatesPage.activate(courseKey)).status).toBe(200);

      await expect
        .poll(async () => (await fetchCertificateConfiguration(api, config, courseKey)).isActive)
        .toBe(true);

      await resetCertificates(api, config, courseKey).catch(() => {});
    },
  );

  // TC-00277: automatic certificate generation is the platform-wide
  // `certificates.auto_certificate_generation` waffle switch, set in the Django
  // admin rather than in Studio. Its Studio-side effect is that an
  // instructor-paced course's Schedule & Details offers a "Certificates
  // available" date. The switch is global, so `certificateSwitch` holds it
  // exclusively. (TC-00278, a learner receiving the certificate, is in
  // `tests/lms/course-home/certificate.spec.ts`.)
  test(
    'enables automatic certificate generation',
    { tag: ['@regression', '@certificates'], annotation: testId('TC-00277') },
    async ({
      page,
      config,
      authoredCourse,
      scheduleDetailsPage,
      studioAuthorSession,
      certificateSwitch,
    }) => {
      void studioAuthorSession;
      const api = page.request;
      const { courseKey } = authoredCourse;
      const offered = async () =>
        (await fetchCourseSettingsFlags(api, config, courseKey))
          .canShowCertificateAvailableDateField;
      expect(await offered()).toBe(false);
      await scheduleDetailsPage.goto(courseKey);
      await expect(scheduleDetailsPage.certificateBehaviorDropdown).toHaveCount(0);

      await certificateSwitch.turnOn();
      await expect.poll(offered, { timeout: TIMEOUTS.contentPublish }).toBe(true);
      await scheduleDetailsPage.goto(courseKey);
      await expect(scheduleDetailsPage.certificateBehaviorDropdown).toBeVisible();
    },
  );
});
