import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  createComment,
  createThread,
  deleteThread,
  fetchDiscussionCourse,
  grantCourseTeamRole,
  updateComment,
  updateThread,
} from '../../../src/api';
import { aboutThread, waitForNotification } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_TAGS, trayHostUrl, uniqueTitle } from './helpers';

/**
 * Notifications that involve the forum's moderators (TC-00460, TC-00466):
 * reported content reaches every moderator, and a moderator's endorsement
 * reaches the author of the response and of the post.
 */
test.describe(
  'Notifications for moderation',
  { tag: ['@regression', '@discussions', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a moderator is notified when a learner reports a post',
      { annotation: testId('TC-00460') },
      async ({
        page,
        config,
        forumCourse,
        forumCast,
        notificationRecipient,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        // The recipient is a fresh moderator, so its tray is its own; the
        // course's instructor grants the role.
        const recipient = await notificationRecipient();
        await grantCourseTeamRole(
          page.request,
          config,
          forumCourse.courseKey,
          [recipient.identity.email],
          'Moderator',
        );
        expect(
          (await fetchDiscussionCourse(recipient.request, config, forumCourse.courseKey))
            .has_moderation_privileges,
        ).toBe(true);

        const author = await forumCast('moderator');
        const reporter = await forumCast('poster');
        const thread = await createThread(author.request, config, {
          courseKey: forumCourse.courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniqueTitle('reported'),
          body: 'A post someone will report.',
        });
        try {
          await updateThread(reporter.request, config, thread.id, { abuse_flagged: true });

          const { found, rows } = await waitForNotification(
            recipient.request,
            config,
            aboutThread('content_reported', thread.id),
            { app: 'discussion' },
          );
          expect(
            found,
            `rows seen: ${JSON.stringify(rows.map((row) => row.notification_type))}`,
          ).toBeDefined();

          await recipient.page.goto(trayHostUrl(config));
          await recipient.notificationTray.open('discussion');
          await expect(recipient.notificationTray.row(found!.id)).toBeVisible();
        } finally {
          await deleteThread(author.request, config, thread.id);
        }
      },
    );

    test(
      "a moderator's endorsement reaches the response's author and the post's author",
      { annotation: testId('TC-00466') },
      async ({ config, forumCourse, forumCast, notificationRecipient }) => {
        const recipient = await notificationRecipient();
        const poster = await forumCast('poster');
        const moderator = await forumCast('moderator');
        const courseKey = forumCourse.courseKey;
        const threads: { id: string; by: typeof poster }[] = [];
        try {
          // My response, endorsed by a moderator → `response_endorsed`.
          const theirs = await createThread(poster.request, config, {
            courseKey,
            topicId: GENERAL_TOPIC_ID,
            type: 'discussion',
            title: uniqueTitle('endorse-mine'),
            body: 'A post I will respond to.',
          });
          threads.push({ id: theirs.id, by: poster });
          const myResponse = await createComment(recipient.request, config, {
            threadId: theirs.id,
            body: 'My response.',
          });
          await updateComment(moderator.request, config, myResponse.id, { endorsed: true });

          // Someone else's response on my post, endorsed → `response_endorsed_on_thread`.
          const mine = await createThread(recipient.request, config, {
            courseKey,
            topicId: GENERAL_TOPIC_ID,
            type: 'discussion',
            title: uniqueTitle('endorse-thread'),
            body: 'My post.',
          });
          threads.push({ id: mine.id, by: recipient });
          const theirResponse = await createComment(poster.request, config, {
            threadId: mine.id,
            body: 'A response to your post.',
          });
          await updateComment(moderator.request, config, theirResponse.id, { endorsed: true });

          for (const [type, threadId] of [
            ['response_endorsed', theirs.id],
            ['response_endorsed_on_thread', mine.id],
          ] as const) {
            const { found, rows } = await waitForNotification(
              recipient.request,
              config,
              aboutThread(type, threadId),
              { app: 'discussion' },
            );
            expect(
              found,
              `${type}: rows seen ${JSON.stringify(rows.map((row) => row.notification_type))}`,
            ).toBeDefined();
          }
        } finally {
          for (const thread of threads) {
            await deleteThread(thread.by.request, config, thread.id);
          }
        }
      },
    );
  },
);
