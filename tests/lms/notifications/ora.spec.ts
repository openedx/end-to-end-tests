import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  ORA_POINTS_POSSIBLE,
  listOraSubmissions,
  staffAssessOra,
  submitOraResponse,
} from '../../../src/api';
import { aboutOra, waitForNotification } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_TAGS, trayHostUrl } from './helpers';

/**
 * Grading notifications (TC-00468, TC-00469) on an ORA whose only step is a
 * required staff assessment: a learner's submission reaches the course's staff
 * (the worker author) under the tray's Grading tab, and the staff grade reaches
 * the learner. Both rows are keyed to the test's own ORA through their links —
 * the staff grader's route for the first, the LMS `jump_to` for the second.
 */
test.describe(
  'Notifications for ORA grading',
  { tag: ['@regression', '@ora', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'course staff are notified of a submission awaiting staff grading',
      { annotation: testId('TC-00468') },
      async ({
        page,
        config,
        oraUnit,
        notificationRecipient,
        notificationTray,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const learner = await notificationRecipient();
        await submitOraResponse(
          learner.request,
          config,
          oraUnit.courseKey,
          oraUnit.oraUsageKey,
          'My essay.',
        );

        // The worker author is the course's staff: the recipient here.
        const { found, rows } = await waitForNotification(
          page.request,
          config,
          aboutOra('ora_staff_notifications', oraUnit.oraUsageKey),
          { app: 'grading' },
        );
        expect(
          found,
          `rows seen: ${JSON.stringify(rows.map((row) => row.notification_type))}`,
        ).toBeDefined();
        expect(found!.content_context.ora_name).toBe(oraUnit.displayName);

        await page.goto(trayHostUrl(config));
        await notificationTray.open('discussion');
        await notificationTray.openTab('grading');
        await expect(notificationTray.row(found!.id)).toBeVisible();
      },
    );

    test(
      'a learner is notified of the staff grade on their submission',
      { annotation: testId('TC-00469') },
      async ({ page, config, oraUnit, notificationRecipient, studioAuthorSession }) => {
        void studioAuthorSession;
        const learner = await notificationRecipient();
        await submitOraResponse(
          learner.request,
          config,
          oraUnit.courseKey,
          oraUnit.oraUsageKey,
          'My essay.',
        );
        const submission = (
          await listOraSubmissions(page.request, config, oraUnit.oraUsageKey)
        ).find((candidate) => candidate.username === learner.identity.username);
        expect(submission).toBeDefined();
        await staffAssessOra(
          page.request,
          config,
          oraUnit.courseKey,
          oraUnit.oraUsageKey,
          submission!.submissionUUID,
        );

        const { found, rows } = await waitForNotification(
          learner.request,
          config,
          aboutOra('ora_grade_assigned', oraUnit.oraUsageKey),
          { app: 'grading' },
        );
        expect(
          found,
          `rows seen: ${JSON.stringify(rows.map((row) => row.notification_type))}`,
        ).toBeDefined();
        expect(found!.content_context).toMatchObject({
          points_earned: ORA_POINTS_POSSIBLE,
          points_possible: ORA_POINTS_POSSIBLE,
        });

        await learner.page.goto(trayHostUrl(config));
        await learner.notificationTray.open('discussion');
        await learner.notificationTray.openTab('grading');
        await expect(learner.notificationTray.row(found!.id)).toBeVisible();
      },
    );
  },
);
