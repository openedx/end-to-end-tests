import { expect, test } from '../../../src/fixtures';
import { NOTIFICATION_TRAY_SELECTORS, TIMEOUTS } from '../../../src/config';
import { GENERAL_TOPIC_ID, createThread, deleteThread } from '../../../src/api';
import { aboutThread, waitForNotification } from '../../../src/steps';
import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_TAGS, trayHostUrl, uniqueTitle } from './helpers';

/**
 * New-post notifications (TC-00457, TC-00458, TC-00459): another actor posts in
 * a course the recipient is enrolled in, and the post reaches the recipient's
 * Discussions tab.
 *
 * New posts and questions are off in the tray by default (measured), so the
 * recipient turns the preference on first — the sheet's "Given I've turned ON
 * the web toggle". Instructor posts with "Notify all learners" are on by
 * default. Each case is decided by the recipient's own notification list, keyed
 * to the test's thread, and then shown in the tray.
 */
test.describe(
  'Notifications for new posts',
  { tag: ['@regression', '@discussions', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    for (const { id, type, preference } of [
      { id: 'TC-00457', type: 'discussion', preference: 'new_discussion_post' },
      { id: 'TC-00458', type: 'question', preference: 'new_question_post' },
    ] as const) {
      test(
        `a new ${type} post reaches a learner who turned its preference on`,
        { annotation: testId(id) },
        async ({ config, forumCourse, forumCast, notificationRecipient }) => {
          const recipient = await notificationRecipient({
            preferences: [{ app: 'discussion', type: preference, channel: 'web', value: true }],
          });
          const poster = await forumCast('poster');
          const thread = await createThread(poster.request, config, {
            courseKey: forumCourse.courseKey,
            topicId: GENERAL_TOPIC_ID,
            type,
            title: uniqueTitle(type),
            body: 'A post for the course.',
          });
          try {
            const { found, rows } = await waitForNotification(
              recipient.request,
              config,
              aboutThread(preference, thread.id),
              { app: 'discussion' },
            );
            expect(
              found,
              `rows seen: ${JSON.stringify(rows.map((row) => row.notification_type))}`,
            ).toBeDefined();
            expect(found!.course_id).toBe(forumCourse.courseKey);

            // The tray shows it under Discussions, linking to the post.
            await recipient.page.goto(trayHostUrl(config));
            await recipient.notificationTray.open('discussion');
            const row = recipient.notificationTray.row(found!.id);
            await expect(row).toBeVisible();
            await expect(row).toHaveAttribute('href', found!.content_url);
            await checkA11y(recipient.page, {
              label: 'notification-tray',
              include: NOTIFICATION_TRAY_SELECTORS.tray,
            });
          } finally {
            await deleteThread(poster.request, config, thread.id);
          }
        },
      );
    }

    test(
      'an instructor post with "Notify all learners" reaches a learner with default preferences',
      { annotation: testId('TC-00459') },
      async ({ page, config, forumCourse, notificationRecipient, studioAuthorSession }) => {
        void studioAuthorSession;
        const recipient = await notificationRecipient();
        // The worker author is the course's instructor.
        const thread = await createThread(page.request, config, {
          courseKey: forumCourse.courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniqueTitle('instructor'),
          body: 'An announcement for every learner.',
          notifyAllLearners: true,
        });
        try {
          const { found } = await waitForNotification(
            recipient.request,
            config,
            aboutThread('new_instructor_all_learners_post', thread.id),
            { app: 'discussion' },
          );
          expect(found).toBeDefined();

          await recipient.page.goto(trayHostUrl(config));
          await recipient.notificationTray.open('discussion');
          await expect(recipient.notificationTray.row(found!.id)).toBeVisible();
        } finally {
          await deleteThread(page.request, config, thread.id);
        }
      },
    );
  },
);
