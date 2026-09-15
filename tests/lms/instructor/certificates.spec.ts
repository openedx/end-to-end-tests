import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  downloadReport,
  listCertificateGenerationHistory,
  listIssuedCertificates,
  type LearnerListResult,
} from '../../../src/api';
import {
  mintCertificateByException,
  waitForLearnerProgress,
  waitForReport,
} from '../../../src/steps';
import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS } from './helpers';

/**
 * Certificate administration (TC-00536–TC-00538) plus the certificates report
 * with a real row (TC-00530), on the worker's certificate-ready course with a
 * learner of each test's own.
 *
 * Gated on `@certificates`; `certificateGenerationEnabled` turns the platform
 * switch on (or skips without an admin). The instructor's `certificates/issued`
 * filters and the learner's own `certificate_data.cert_status` decide pass/fail.
 */
test.describe(
  'Instructor dashboard certificates',
  { tag: ['@regression', '@certificates', ...INSTRUCTOR_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'grants a certificate exception to a learner',
      { annotation: testId('TC-00536') },
      async ({
        page,
        config,
        certificateCourse,
        certificateLearner,
        certificateGenerationEnabled,
        instructorCertificates,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        void certificateGenerationEnabled;
        const courseKey = certificateCourse.courseKey;
        const username = certificateLearner.identity.username;
        await instructorCertificates.gotoTab(courseKey);
        // The tab's tools are really there (a declared capability the target lacks fails here).
        await expect(instructorCertificates.disabledAlert).toHaveCount(0);
        await expect(instructorCertificates.issuedTab).toBeVisible();

        const granted = (await (
          await instructorCertificates.grantException(
            username,
            `E2E ${test.info().testId.slice(-6)}`,
          )
        ).json()) as LearnerListResult;
        expect(granted.success).toContain(username);
        expect(granted.errors).toEqual([]);

        await instructorCertificates.filter('granted_exceptions');
        await expect(instructorCertificates.rowFor(username)).toBeVisible();
        const listed = await listIssuedCertificates(page.request, config, courseKey, {
          filter: 'granted_exceptions',
        });
        expect(listed.results.find((r) => r.username === username)).toMatchObject({
          special_case: 'Exception',
        });

        await checkA11y(page, {
          label: 'instructor-certificates',
          additionalBaseline: INSTRUCTOR_A11Y_BASELINE,
        });
      },
    );

    test(
      'generates certificates for granted exceptions',
      { annotation: testId('TC-00537') },
      async ({
        page,
        config,
        certificateCourse,
        certificateLearner,
        certificateGenerationEnabled,
        instructorCertificates,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        void certificateGenerationEnabled;
        const courseKey = certificateCourse.courseKey;
        const username = certificateLearner.identity.username;

        // Grant + "generate exception certificates" (regeneration for allowlisted
        // learners without one), then the learner's own reading turns downloadable.
        const minted = await mintCertificateByException(
          page.request,
          certificateLearner.request,
          config,
          courseKey,
          username,
          `E2E ${test.info().testId.slice(-6)}`,
        );
        expect(minted.downloadable, JSON.stringify(minted)).toBe(true);
        expect(minted.taskState).toBe('completed');

        await instructorCertificates.gotoTab(courseKey);
        await instructorCertificates.filter('granted_exceptions');
        await expect(instructorCertificates.rowFor(username)).toBeVisible();
        const issued = await listIssuedCertificates(page.request, config, courseKey, {
          filter: 'granted_exceptions',
        });
        expect(issued.results.find((r) => r.username === username)).toMatchObject({
          certificate_status: 'downloadable',
          special_case: 'Exception',
        });
        // Once a certificate exists the regenerate action is offered.
        await expect(instructorCertificates.regenerateButton).toBeEnabled();
        // The generation shows in the history tab and API.
        await instructorCertificates.historyTab.click();
        await expect(instructorCertificates.rows().first()).toBeVisible();
        expect(
          (await listCertificateGenerationHistory(page.request, config, courseKey)).count,
        ).toBeGreaterThan(0);
      },
    );

    test(
      'invalidates a learner’s certificate',
      { annotation: testId('TC-00538') },
      async ({
        page,
        config,
        certificateCourse,
        certificateLearner,
        certificateGenerationEnabled,
        instructorCertificates,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        void certificateGenerationEnabled;
        const courseKey = certificateCourse.courseKey;
        const username = certificateLearner.identity.username;
        const minted = await mintCertificateByException(
          page.request,
          certificateLearner.request,
          config,
          courseKey,
          username,
          'E2E precondition',
        );
        expect(minted.downloadable, JSON.stringify(minted)).toBe(true);

        await instructorCertificates.gotoTab(courseKey);
        const invalidated = (await (
          await instructorCertificates.invalidate(username, `E2E ${test.info().testId.slice(-6)}`)
        ).json()) as LearnerListResult;
        expect(invalidated.success).toContain(username);
        expect(invalidated.errors).toEqual([]);

        await instructorCertificates.filter('invalidated');
        await expect(instructorCertificates.rowFor(username)).toBeVisible();
        expect(
          (
            await listIssuedCertificates(page.request, config, courseKey, { filter: 'invalidated' })
          ).results.some((r) => r.username === username),
        ).toBe(true);
        const learnerSees = await waitForLearnerProgress(
          certificateLearner.request,
          config,
          courseKey,
          (p) => p.certificateStatus === 'invalidated',
        );
        expect(learnerSees.satisfied, learnerSees.last.certificateStatus).toBe(true);
      },
    );

    test(
      'the issued certificates report lists a certified learner',
      { annotation: testId('TC-00530') },
      async ({
        page,
        config,
        certificateCourse,
        certificateLearner,
        certificateGenerationEnabled,
        instructorDataDownloads,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        void certificateGenerationEnabled;
        const courseKey = certificateCourse.courseKey;
        const username = certificateLearner.identity.username;
        const minted = await mintCertificateByException(
          page.request,
          certificateLearner.request,
          config,
          courseKey,
          username,
          'E2E precondition',
        );
        expect(minted.downloadable, JSON.stringify(minted)).toBe(true);

        await instructorDataDownloads.gotoTab(courseKey);
        const since = new Date();
        expect((await instructorDataDownloads.generate('issued_certificates')).status()).toBe(200);
        const outcome = await waitForReport(
          page.request,
          config,
          courseKey,
          'issued_certificates',
          since,
        );
        expect(outcome.report, JSON.stringify(outcome)).toBeDefined();
        const file = await downloadReport(
          page.request,
          config,
          outcome.report as NonNullable<typeof outcome.report>,
        );
        expect(file.headers()['content-type']).toContain('text/csv');
        // The report is an aggregate per certificate type (course id, type, total
        // issued, date run), not a per-learner list: with one certificate minted it
        // carries a data row for this course's honor track.
        const rows = (await file.text()).split(/\r?\n/).filter((line) => line.trim() !== '');
        expect(rows.length).toBeGreaterThan(1);
        expect(rows.slice(1).join('\n')).toContain(courseKey);
        expect(rows.slice(1).join('\n')).toContain('honor');
      },
    );
  },
);
