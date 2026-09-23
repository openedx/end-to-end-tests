import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  createCourseUpdate,
  createThread,
  deleteThread,
  grantCourseTeamRole,
  uniquePostTitle,
} from '../../../src/api';
import { aboutThread, checkNotificationAbsent, turnOffEveryNotification } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_TAGS, trayHostUrl } from './helpers';

/**
 * No notifications when every preference is off (TC-00477, in the tray): a
 * learner who is also course staff and a forum moderator — so every type is on
 * offer — turns every web and e-mail preference off, and activity that reaches
 * every enrolled learner reaches them no more.
 *
 * Absence is only meaningful once delivery has run, so a **sentinel** learner
 * with default preferences receives the same notifications first (the
 * `checkNotificationAbsent` rule); the subject's list is read after that. The
 * e-mail half of 477 is with the e-mail cases (`@email-inbox`).
 */
test.describe(
  'Notifications turned off',
  { tag: ['@regression', '@discussions', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a learner with every preference off receives nothing',
      { annotation: testId('TC-00477') },
      async ({ page, config, forumCourse, notificationRecipient, studioAuthorSession }) => {
        void studioAuthorSession;
        const courseKey = forumCourse.courseKey;
        const subject = await notificationRecipient();
        const sentinel = await notificationRecipient();
        for (const role of ['staff', 'Moderator'] as const) {
          await grantCourseTeamRole(
            page.request,
            config,
            courseKey,
            [subject.identity.email],
            role,
          );
        }
        const off = await turnOffEveryNotification(subject.request, config);
        expect(off).toEqual(
          expect.arrayContaining(['content_reported', 'ora_staff_notifications', 'course_updates']),
        );

        // Two notifications every enrolled learner gets: an instructor's
        // notify-all post and a course update.
        const thread = await createThread(page.request, config, {
          courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniquePostTitle('silent'),
          body: 'An announcement.',
          notifyAllLearners: true,
        });
        try {
          const token = uniquePostTitle('silent-update');
          await createCourseUpdate(page.request, config, courseKey, {
            date: 'January 1, 2026',
            content: `<p>${token}</p>`,
          });

          const post = await checkNotificationAbsent(
            subject.request,
            sentinel.request,
            config,
            aboutThread('new_instructor_all_learners_post', thread.id),
          );
          const update = await checkNotificationAbsent(
            subject.request,
            sentinel.request,
            config,
            (row) =>
              row.notification_type === 'course_updates' &&
              row.content_context.course_update_content === token,
          );
          expect(post).toEqual({ delivered: true, subjectRows: [] });
          expect(update).toEqual({ delivered: true, subjectRows: [] });

          // The subject's tray is empty in both tabs.
          await subject.page.goto(trayHostUrl(config));
          await subject.notificationTray.open('discussion');
          await expect(subject.notificationTray.emptyList).toBeVisible();
          await expect(subject.notificationTray.rows('discussion')).toHaveCount(0);
          await subject.notificationTray.openTab('updates');
          await expect(subject.notificationTray.rows('updates')).toHaveCount(0);
        } finally {
          await deleteThread(page.request, config, thread.id);
        }
      },
    );
  },
);
