import { expect, test, type CertificateCourse, type RoundTripLearner } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  fetchCourseDetail,
  listLearnerCertificates,
  type LearnerCertificate,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import {
  earnCertificate,
  passCertificateCourse,
  submitProblem,
  waitForLearnerProgress,
} from '../../../src/steps';

/**
 * A learner's certificate, from their side (TC-00032, TC-00033, TC-00114,
 * TC-00278), on the worker's certificate-ready course with an honor enrollment
 * of each test's own. The learner's progress API decides the certificate's
 * state; the Progress tab is the rendering the cases describe.
 *
 * With the platform's auto-generation switch off (the default), a learner who
 * passes is offered "Request certificate"; with it on, the certificate is
 * generated when they pass. The switch is global, so the cases that turn it on
 * hold `certificateAutoGeneration`'s lock exclusively and every other
 * certificate case holds it shared.
 */
test.describe(
  'Learner certificates',
  { tag: ['@regression', '@studio', '@author', '@certificates', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'offers a passing learner "Request certificate", and issues it on request',
      { tag: '@smoke', annotation: testId('TC-00032') },
      async ({ config, certificateCourse, certificateLearner }) => {
        const learner = certificateLearner;
        const passed = await passCertificateCourse(
          learner.request,
          config,
          learner.courseKey,
          certificateCourse.problem,
        );
        expect(passed.satisfied, `progress: ${JSON.stringify(passed.last?.courseGrade)}`).toBe(
          true,
        );
        expect(passed.last?.certificateStatus).toBe('requesting');

        const progress = learner.progressPage;
        await progress.goto(learner.courseKey);
        expect(await progress.certificateCase()).toBe('requestable');
        expect((await progress.requestCertificate()).ok()).toBe(true);

        const issued = await waitForLearnerProgress(
          learner.request,
          config,
          learner.courseKey,
          (p) => p.certificateStatus === 'downloadable',
        );
        expect(issued.satisfied, `status: ${issued.last?.certificateStatus}`).toBe(true);
      },
    );

    test(
      'links "View my certificate" to the issued certificate',
      { annotation: testId('TC-00033') },
      async ({ config, certificateCourse, certificateLearner }) => {
        const learner = certificateLearner;
        const webView = await earnedWebView(learner, config, certificateCourse);
        await learner.progressPage.goto(learner.courseKey);
        expect(await learner.progressPage.certificateCase()).toBe('downloadable');
        await expect(learner.progressPage.certificateAction).toHaveAttribute('href', webView);

        // The certificate the learner can download is that one.
        const certificates = await listLearnerCertificates(
          learner.request,
          config,
          learner.identity.username,
        );
        const mine = (certificates as readonly LearnerCertificate[]).find(
          (c) => c.course_id === learner.courseKey,
        );
        expect(mine?.download_url, 'the certificate has a download link').toBeTruthy();
        expect(new URL(mine!.download_url!, config.baseUrls.lms).toString()).toBe(webView);
      },
    );

    // CERT-002: on a default install the certificate web view answers 500 — its
    // footer template needs a marketing "About" URL the platform only defines
    // when one is configured.
    test(
      'renders the certificate for the learner and the course',
      { annotation: testId('TC-00033') },
      async ({ config, certificateCourse, certificateLearner }) => {
        test.fail(true, 'CERT-002: the certificate web view 500s without a marketing About URL');
        const learner = certificateLearner;
        const webView = await earnedWebView(learner, config, certificateCourse);
        const page = await learner.request.get(webView);
        expect(page.status()).toBe(200);
        const html = await page.text();
        expect(html).toContain(learner.identity.name);
        expect(html).toContain(
          (await fetchCourseDetail(learner.request, config, learner.courseKey)).name,
        );
      },
    );

    test(
      'generates the certificate by itself once automatic generation is switched on',
      { annotation: testId('TC-00114') },
      async ({ config, certificateCourse, certificateAutoGeneration }) => {
        const { learner, turnOn } = certificateAutoGeneration;
        const passed = await passCertificateCourse(
          learner.request,
          config,
          learner.courseKey,
          certificateCourse.problem,
        );
        expect(passed.last?.certificateStatus).toBe('requesting');
        await learner.progressPage.goto(learner.courseKey);
        expect(await learner.progressPage.certificateCase()).toBe('requestable');

        // Switched on, the next grading of the passing learner generates the
        // certificate without a request.
        await turnOn();
        await submitProblem(
          learner.request,
          config,
          learner.courseKey,
          certificateCourse.problem,
          certificateCourse.problem.correct,
        );
        const issued = await waitForLearnerProgress(
          learner.request,
          config,
          learner.courseKey,
          (p) => p.certificateStatus === 'downloadable',
        );
        expect(issued.satisfied, `status: ${issued.last?.certificateStatus}`).toBe(true);
        await learner.progressPage.goto(learner.courseKey);
        expect(await learner.progressPage.certificateCase()).toBe('downloadable');
      },
    );

    test(
      'gives a learner who passes the certificate with no request, under automatic generation',
      { annotation: testId('TC-00278') },
      async ({ config, certificateCourse, certificateAutoGeneration }) => {
        const { learner, turnOn } = certificateAutoGeneration;
        await turnOn();
        await passCertificateCourse(
          learner.request,
          config,
          learner.courseKey,
          certificateCourse.problem,
        );
        const issued = await waitForLearnerProgress(
          learner.request,
          config,
          learner.courseKey,
          (p) => p.certificateStatus === 'downloadable',
        );
        expect(issued.satisfied, `status: ${issued.last?.certificateStatus}`).toBe(true);
        await learner.progressPage.goto(learner.courseKey);
        expect(await learner.progressPage.certificateCase()).toBe('downloadable');
      },
    );
  },
);

/** Earns the learner's certificate and returns its web-view URL. */
async function earnedWebView(
  learner: RoundTripLearner,
  config: AppConfig,
  course: CertificateCourse,
): Promise<string> {
  const issued = await earnCertificate(
    learner.request,
    learner.progressPage,
    config,
    learner.courseKey,
    course.problem,
  );
  expect(issued.satisfied, `status: ${issued.last?.certificateStatus}`).toBe(true);
  return new URL(issued.last.certificateWebViewUrl ?? '', config.baseUrls.lms).toString();
}
