import { checkA11y } from '../../../src/a11y';
import {
  createCertificate,
  fetchCertificateConfiguration,
  resetCertificates,
} from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Certificates (authoring MFE), on the worker's own course.
 *
 * The MFE renders its authoring form only once the course has a certificate-bearing
 * mode (`STUDIO-006`), which the `certificateCourseMode` fixture adds with the
 * staff session. The MFE drives each change; Studio's certificate API decides the
 * outcome. There is no per-run course teardown and certificates accumulate, so
 * each test resets the course's certificates first.
 */
test.describe('Certificates', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  const signatory = (name: string) => ({ name, title: 'Chair', organization: 'Open edX' });

  test(
    'sets up a certificate with three signatories',
    { tag: '@regression', annotation: testId('TC-00275') },
    async ({
      page,
      request,
      config,
      authoredCourse,
      certificatesPage,
      studioAuthorSession,
      certificateCourseMode,
    }) => {
      void studioAuthorSession;
      void certificateCourseMode;
      const { courseKey } = authoredCourse;
      await resetCertificates(request, config, courseKey);

      await certificatesPage.goto(courseKey);
      const created = await certificatesPage.createCertificate(courseKey, [
        signatory('Ada Lovelace'),
        signatory('Alan Turing'),
        signatory('Grace Hopper'),
      ]);
      expect(created.status).toBe(201);

      await expect
        .poll(async () => {
          const cfg = await fetchCertificateConfiguration(request, config, courseKey);
          return cfg.certificates[0]?.signatories.length;
        })
        .toBe(3);

      await checkA11y(page, { label: 'studio-certificates' });
      await resetCertificates(request, config, courseKey);
    },
  );

  test(
    'previews the certificate',
    { tag: '@regression', annotation: testId('TC-00276') },
    async ({
      request,
      config,
      authoredCourse,
      certificatesPage,
      studioAuthorSession,
      certificateCourseMode,
    }) => {
      void studioAuthorSession;
      void certificateCourseMode;
      const { courseKey } = authoredCourse;
      await resetCertificates(request, config, courseKey);
      await createCertificate(request, config, courseKey, {
        name: 'Certificate',
        signatories: [signatory('Ada Lovelace')],
      });

      await certificatesPage.goto(courseKey);
      const cfg = await fetchCertificateConfiguration(request, config, courseKey);
      // The preview link points at the LMS certificate web view the API reports.
      // The API gives a protocol-relative URL; the page renders it scheme-qualified.
      const previewUrl = `${new URL(config.baseUrls.lms).protocol}${cfg.certificateWebViewUrl}`;
      await expect(certificatesPage.previewLink).toHaveAttribute('href', previewUrl);

      // That web view is reachable.
      const response = await request.get(previewUrl);
      expect(response.status()).toBeLessThan(400);

      await resetCertificates(request, config, courseKey);
    },
  );

  test(
    'activates the course certificate',
    { tag: '@regression', annotation: testId('TC-00279') },
    async ({
      request,
      config,
      authoredCourse,
      certificatesPage,
      studioAuthorSession,
      certificateCourseMode,
    }) => {
      void studioAuthorSession;
      void certificateCourseMode;
      const { courseKey } = authoredCourse;
      await resetCertificates(request, config, courseKey);
      await createCertificate(request, config, courseKey, {
        name: 'Certificate',
        signatories: [signatory('Ada Lovelace')],
      });

      await certificatesPage.goto(courseKey);
      expect((await certificatesPage.activate(courseKey)).status).toBe(200);

      await expect
        .poll(
          async () => (await fetchCertificateConfiguration(request, config, courseKey)).isActive,
        )
        .toBe(true);

      await resetCertificates(request, config, courseKey);
    },
  );

  // TC-00277 (enable automatic certificate generation) toggles the
  // `certificates.auto_certificate_generation` waffle switch in Django admin, not
  // a control the authoring MFE exposes — the suite cannot drive it. A `fixme`
  // until there is a supported way to set it.
  test.fixme(
    'enables automatic certificate generation',
    { tag: '@regression', annotation: testId('TC-00277') },
    async ({ request, config, authoredCourse }) => {
      const cfg = await fetchCertificateConfiguration(request, config, authoredCourse.courseKey);
      expect(cfg.hasCertificateModes).toBe(true);
    },
  );

  // TC-00278 (complete the course as a student and receive the certificate) needs
  // gradable content the course does not have — Epic 8. Cross-references the Epic 6
  // certificate annotation in `tests/lms/course-home/progress.spec.ts`.
  test.fixme(
    'a student who passes receives the certificate',
    { tag: '@regression', annotation: testId('TC-00278') },
    async ({ request, config, authoredCourse }) => {
      const cfg = await fetchCertificateConfiguration(request, config, authoredCourse.courseKey);
      expect(cfg.isActive).toBe(true);
    },
  );
});
