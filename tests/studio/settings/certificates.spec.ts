import { fetchCertificateConfiguration } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Certificates (authoring MFE), on the worker's own course.
 *
 * `STUDIO-006` (see `.private/findings.md`): a fresh course has only the `audit`
 * mode, which bears no certificate, so the MFE renders the certificates page with
 * **no create control** — the authoring cases cannot be driven through the UI.
 * Giving the course a certificate-bearing mode (`honor`) is an LMS-staff action
 * the `author` session may not perform (`POST course_modes` → 403). These stay
 * `fixme` until the worker course carries a certificate-bearing mode; the shared
 * API client (`src/api/certificates.ts`) is in place for when they can run.
 */
test.describe('Certificates', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  test.fixme(
    'sets up a certificate with three signatories',
    { tag: '@regression', annotation: testId('TC-00275') },
    async ({ request, config, authoredCourse }) => {
      const cfg = await fetchCertificateConfiguration(request, config, authoredCourse.courseKey);
      expect(cfg.certificates[0]?.signatories).toHaveLength(3);
    },
  );

  test.fixme(
    'previews the certificate',
    { tag: '@regression', annotation: testId('TC-00276') },
    async ({ request, config, authoredCourse }) => {
      const cfg = await fetchCertificateConfiguration(request, config, authoredCourse.courseKey);
      expect(cfg.certificateWebViewUrl).not.toBeNull();
    },
  );

  test.fixme(
    'enables automatic certificate generation',
    { tag: '@regression', annotation: testId('TC-00277') },
    async ({ request, config, authoredCourse }) => {
      const cfg = await fetchCertificateConfiguration(request, config, authoredCourse.courseKey);
      expect(cfg.hasCertificateModes).toBe(true);
    },
  );

  test.fixme(
    'activates the course certificate',
    { tag: '@regression', annotation: testId('TC-00279') },
    async ({ request, config, authoredCourse }) => {
      const cfg = await fetchCertificateConfiguration(request, config, authoredCourse.courseKey);
      expect(cfg.isActive).toBe(true);
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
