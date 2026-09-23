import { randomUUID } from 'node:crypto';

import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  DEFAULT_PASSWORD,
  fetchLearnerHome,
  learnerHomeCourse,
  loginSession,
  sendCourseEmail,
  type LearnerHome,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { waitForMail } from '../../../src/steps';

/**
 * A course's e-mail settings from the learner dashboard (TC-00044). The
 * dashboard offers them only where course e-mail is on, which a default install
 * leaves off, so `courseEmailEnabled` turns it on for the content course alone.
 * The learner's own dashboard data (`hasOptedOutOfEmail`) decides; under
 * `@email-inbox` a course e-mail then reaches a learner who stayed opted in and
 * not the one who opted out.
 */
test.describe(
  'Course e-mail settings on the dashboard',
  { tag: ['@regression', '@studio', '@author', '@mfe-learner-dashboard'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    const optedOut = async (
      learner: { request: Parameters<typeof fetchLearnerHome>[0]; courseKey: string },
      config: Parameters<typeof fetchLearnerHome>[1],
    ) =>
      learnerHomeCourse(
        (await fetchLearnerHome(learner.request, config)) as LearnerHome,
        learner.courseKey,
      )?.enrollment;

    test(
      'turns course e-mails off, and leaves them alone on "Never mind"',
      { annotation: testId('TC-00044') },
      async ({ config, courseEmailEnabled, roundTripLearner }) => {
        void courseEmailEnabled;
        const learner = roundTripLearner;
        await expect.poll(async () => (await optedOut(learner, config))?.isEmailEnabled).toBe(true);

        await learner.dashboardPage.goto();
        await learner.dashboardPage.openEmailSettings(learner.courseKey);
        await expect(learner.dashboardPage.emailSwitch).toBeChecked();
        await checkA11y(learner.page, { label: 'dashboard-email-settings' });
        await learner.dashboardPage.emailSwitch.setChecked(false);
        expect((await learner.dashboardPage.saveEmailSettings()).ok()).toBe(true);
        expect((await optedOut(learner, config))?.hasOptedOutOfEmail).toBe(true);

        // Changing the switch and backing out changes nothing.
        await learner.dashboardPage.openEmailSettings(learner.courseKey);
        await expect(learner.dashboardPage.emailSwitch).not.toBeChecked();
        await learner.dashboardPage.emailSwitch.setChecked(true);
        await learner.dashboardPage.dismissDialog();
        expect((await optedOut(learner, config))?.hasOptedOutOfEmail).toBe(true);
      },
    );

    test(
      'keeps course e-mails from a learner who opted out',
      { tag: '@email-inbox', annotation: testId('TC-00044') },
      async ({
        playwright,
        config,
        contentCourse,
        workerAuthor,
        courseEmailEnabled,
        mailboxLearner,
      }) => {
        void courseEmailEnabled;
        const subject = await mailboxLearner();
        const sentinel = await mailboxLearner();
        await expect.poll(async () => (await optedOut(subject, config))?.isEmailEnabled).toBe(true);

        await subject.dashboardPage.goto();
        await subject.dashboardPage.openEmailSettings(subject.courseKey);
        await subject.dashboardPage.emailSwitch.setChecked(false);
        expect((await subject.dashboardPage.saveEmailSettings()).ok()).toBe(true);

        // Course e-mail is an LMS session-auth view: the instructor signs in
        // afresh on a throwaway context, as for the cohort views.
        const title = `E2E course e-mail ${randomUUID().slice(0, 8)}`;
        const instructor = await playwright.request.newContext();
        try {
          await loginSession(instructor, config, {
            emailOrUsername: workerAuthor!.identity.username,
            password: DEFAULT_PASSWORD,
          });
          await sendCourseEmail(instructor, config, contentCourse.courseKey, {
            subject: title,
            message: `<p>${title}</p>`,
          });
        } finally {
          await instructor.dispose();
        }

        // The sentinel's copy proves the send ran; only then is absence read.
        const bySubject = (message: { subject: string }) => message.subject.includes(title);
        const delivered = await waitForMail(sentinel.inbox, sentinel.request, bySubject);
        expect(
          delivered.found,
          `sentinel saw: ${JSON.stringify(delivered.subjects)}`,
        ).toBeDefined();
        const silent = await waitForMail(subject.inbox, subject.request, bySubject, 0);
        expect(silent.found).toBeUndefined();
      },
    );
  },
);
