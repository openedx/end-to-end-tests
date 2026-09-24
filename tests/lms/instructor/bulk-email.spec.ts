import { randomUUID } from 'node:crypto';

import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import { fetchInstructorCourse, grantCourseTeamRole } from '../../../src/api';
import type { MailboxLearner } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { waitForMail } from '../../../src/steps';

/**
 * Sending a course e-mail (TC-00540): course staff write it in the
 * communications MFE — where the instructor dashboard's Bulk Email tab links —
 * and it reaches the groups they chose. The sheet's "learners and admins
 * should receive an email" are the form's "All learners" and "Staff and
 * instructors" groups. The sender is a learner granted course staff with an
 * inbox of the configured mailbox provider: the form reads LMS session-authed
 * views, which the worker author's JWT-only browser cannot, and a staff member
 * is the sheet's "admin" recipient too.
 *
 * Mail is matched by its subject, the test's own. That the groups are kept
 * apart is shown with a sentinel: the learner's copy of a learners-only e-mail
 * proves the send ran, and only then is the staff inbox read, once.
 */

/**
 * Accessibility debt of the form's message editor (TinyMCE, `COMMS-001`),
 * reported but not failed on this scan only: its status bar's path item is a
 * `role="button"` carrying `aria-level` (critical `aria-allowed-attr`), and
 * its editable body carries an `aria-label` it may not (serious
 * `aria-prohibited-attr`).
 */
const COMMUNICATIONS_A11Y_BASELINE = ['aria-allowed-attr', 'aria-prohibited-attr'];

/** A mailbox learner made course staff, and the Bulk Email tab's URL as they are offered it. */
async function staffSender(
  author: Parameters<typeof grantCourseTeamRole>[0],
  config: AppConfig,
  courseKey: string,
  staff: MailboxLearner,
): Promise<string> {
  await grantCourseTeamRole(author, config, courseKey, [staff.identity.username], 'staff');
  let url: string | undefined;
  await expect
    .poll(async () => {
      const { tabs } = await fetchInstructorCourse(staff.request, config, courseKey);
      url = tabs.find((tab) => tab.tab_id === 'bulk_email')?.url;
      return url;
    })
    .toBeDefined();
  return url!;
}

const bySubject = (subject: string) => (message: { subject: string }) =>
  message.subject.includes(subject);

test.describe(
  'Course e-mail from the communications MFE',
  { tag: ['@regression', '@studio', '@author', '@email-inbox', '@mfe-communications'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a course e-mail to learners and staff reaches both',
      { annotation: testId('TC-00540') },
      async ({ page, config, contentCourse, courseEmailEnabled, mailboxLearner }) => {
        void courseEmailEnabled;
        const { courseKey } = contentCourse;
        const learner = await mailboxLearner();
        const staff = await mailboxLearner();
        try {
          await staff.bulkEmailPage.goto(await staffSender(page.request, config, courseKey, staff));
          await checkA11y(staff.page, {
            label: 'communications-bulk-email',
            additionalBaseline: COMMUNICATIONS_A11Y_BASELINE,
          });
          const subject = `E2E course e-mail ${randomUUID().slice(0, 8)}`;
          const sent = await staff.bulkEmailPage.send({
            to: ['learners', 'staff'],
            subject,
            body: subject,
          });
          expect(sent.ok()).toBe(true);
          expect(await sent.json()).toMatchObject({ success: true });

          const toLearner = await waitForMail(learner.inbox, learner.request, bySubject(subject));
          expect(
            toLearner.found,
            `learner saw: ${JSON.stringify(toLearner.subjects)}`,
          ).toBeDefined();
          const toStaff = await waitForMail(staff.inbox, staff.request, bySubject(subject));
          expect(toStaff.found, `staff saw: ${JSON.stringify(toStaff.subjects)}`).toBeDefined();
        } finally {
          await grantCourseTeamRole(
            page.request,
            config,
            courseKey,
            [staff.identity.username],
            'staff',
            'revoke',
          );
        }
      },
    );

    test(
      'a course e-mail to learners only does not reach staff',
      { annotation: testId('TC-00540') },
      async ({ page, config, contentCourse, courseEmailEnabled, mailboxLearner }) => {
        void courseEmailEnabled;
        const { courseKey } = contentCourse;
        const learner = await mailboxLearner();
        const staff = await mailboxLearner();
        try {
          await staff.bulkEmailPage.goto(await staffSender(page.request, config, courseKey, staff));
          const subject = `E2E learners-only e-mail ${randomUUID().slice(0, 8)}`;
          expect(
            (await staff.bulkEmailPage.send({ to: ['learners'], subject, body: subject })).ok(),
          ).toBe(true);

          // The learner's copy proves the send ran; only then is the staff inbox read.
          const toLearner = await waitForMail(learner.inbox, learner.request, bySubject(subject));
          expect(
            toLearner.found,
            `learner saw: ${JSON.stringify(toLearner.subjects)}`,
          ).toBeDefined();
          const toStaff = await waitForMail(staff.inbox, staff.request, bySubject(subject), 0);
          expect(toStaff.found).toBeUndefined();
        } finally {
          await grantCourseTeamRole(
            page.request,
            config,
            courseKey,
            [staff.identity.username],
            'staff',
            'revoke',
          );
        }
      },
    );
  },
);
