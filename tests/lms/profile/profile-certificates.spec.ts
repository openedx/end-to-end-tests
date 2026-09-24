import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  ADULT_YEAR_OF_BIRTH,
  listLearnerCertificates,
  updateAccount,
  updatePreferences,
} from '../../../src/api';
import { issue, knownGap, testId } from '../../../src/reporting';
import { earnCertificate } from '../../../src/steps';

/**
 * Certificate privacy on the learner profile (TC-00067): the learner decides
 * whether other learners see their certificates ("Everyone on {site}" or "Just
 * me"). The certificates API, read by another learner, decides who can see
 * them.
 *
 * The profile offers no control for it on any current release
 * (`PROF-002`, wg-build-test-release#582), so the setting is made through the
 * preference the profile page itself writes (`visibility.course_certificates`)
 * and the case of changing it on the page is held with a `fixme`.
 */
test.describe(
  'Certificate privacy on the profile',
  { tag: ['@regression', '@studio', '@author', '@certificates', '@mfe-profile'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'shows the certificate to other learners only while it is visible to everyone',
      { annotation: testId('TC-00067') },
      async ({ config, certificateCourse, certificateLearner, profileViewer }) => {
        const learner = certificateLearner;
        const { username } = learner.identity;
        const issued = await earnCertificate(
          learner.request,
          learner.progressPage,
          config,
          learner.courseKey,
          certificateCourse.problem,
        );
        expect(
          issued.satisfied,
          `status: ${issued.last?.certificateStatus}, passing: ${issued.last?.courseGrade.isPassing}`,
        ).toBe(true);
        // A profile can only be shared once the account has an adult year of birth.
        await updateAccount(learner.request, config, username, {
          year_of_birth: ADULT_YEAR_OF_BIRTH,
        });

        const seenBy = async () => listLearnerCertificates(profileViewer.request, config, username);
        await updatePreferences(learner.request, config, username, {
          account_privacy: 'custom',
          'visibility.course_certificates': 'all_users',
        });
        const shared = await seenBy();
        expect('forbidden' in shared ? [] : shared.map((c) => c.course_id)).toContain(
          learner.courseKey,
        );

        await updatePreferences(learner.request, config, username, {
          'visibility.course_certificates': 'private',
        });
        expect(await seenBy()).toEqual({ forbidden: true });
      },
    );

    // PROF-002: the profile renders no certificate-visibility control — its
    // certificates section only says it is "visible to you" (wg#582).
    test.fixme(
      'sets certificate visibility from the profile page',
      {
        annotation: [
          testId('TC-00067'),
          issue('https://github.com/openedx/wg-build-test-release/issues/582'),
          knownGap(
            'PROF-002: the profile offers no control for certificate visibility (wg-build-test-release#582)',
          ),
        ],
      },
      async ({ profilePage, profileLearner }) => {
        await profilePage.goto(profileLearner.identity.username);
        await expect(profilePage.certificatesVisibility).toBeVisible();
      },
    );
  },
);
