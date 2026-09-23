import { expect, test, type RoundTripLearner } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  createComment,
  createThread,
  deleteThread,
  updateThread,
  type DiscussionThread,
} from '../../../src/api';
import { aboutThread, waitForNotification } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_TAGS, trayHostUrl, uniqueTitle } from './helpers';

/**
 * Activity notifications (TC-00461–TC-00465): responses and comments on the
 * recipient's own posts and responses, and on posts the recipient follows. They
 * are the "Activity notifications" preference (`grouped_notification`), on by
 * default, so the recipient changes nothing.
 *
 * Each case is one row of the table below: who writes the thread, what the
 * recipient does, what the other actors do, and the notification type that
 * must reach the recipient — asserted from the recipient's list, keyed to the
 * thread, then shown in the tray. The other actors are the worker's cast
 * (`poster`, `moderator`), so the recipient is the only fresh account.
 */

interface Actors {
  readonly recipient: RoundTripLearner;
  readonly poster: RoundTripLearner;
  readonly other: RoundTripLearner;
}

interface ActivityCase {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  /** Who writes the thread. */
  readonly author: keyof Actors;
  /** What happens after the thread exists. */
  readonly act: (actors: Actors, thread: DiscussionThread, config: AppConfig) => Promise<void>;
}

const respond = (by: RoundTripLearner, thread: DiscussionThread, config: AppConfig) =>
  createComment(by.request, config, { threadId: thread.id, body: 'A response.' });

const CASES: readonly ActivityCase[] = [
  {
    id: 'TC-00461',
    title: 'someone responds to my post',
    type: 'new_response',
    author: 'recipient',
    act: async ({ poster }, thread, config) => {
      await respond(poster, thread, config);
    },
  },
  {
    id: 'TC-00462',
    title: 'someone comments on a response to my post',
    type: 'new_comment',
    author: 'recipient',
    act: async ({ poster, other }, thread, config) => {
      const response = await respond(other, thread, config);
      await createComment(poster.request, config, {
        threadId: thread.id,
        parentId: response.id,
        body: 'A comment.',
      });
    },
  },
  {
    id: 'TC-00463',
    title: 'someone comments on my response',
    type: 'new_comment_on_response',
    author: 'poster',
    act: async ({ recipient, other }, thread, config) => {
      const response = await respond(recipient, thread, config);
      await createComment(other.request, config, {
        threadId: thread.id,
        parentId: response.id,
        body: 'A comment.',
      });
    },
  },
  {
    id: 'TC-00464',
    title: 'someone responds to a post I follow',
    type: 'response_on_followed_post',
    author: 'poster',
    act: async ({ recipient, other }, thread, config) => {
      await updateThread(recipient.request, config, thread.id, { following: true });
      await respond(other, thread, config);
    },
  },
  {
    id: 'TC-00465',
    title: 'someone comments on a response to a post I follow',
    type: 'comment_on_followed_post',
    author: 'poster',
    act: async ({ recipient, poster, other }, thread, config) => {
      await updateThread(recipient.request, config, thread.id, { following: true });
      const response = await respond(other, thread, config);
      await createComment(poster.request, config, {
        threadId: thread.id,
        parentId: response.id,
        body: 'A comment.',
      });
    },
  },
];

test.describe(
  'Notifications for activity on posts',
  { tag: ['@regression', '@discussions', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    for (const activity of CASES) {
      test(
        `notifies the learner when ${activity.title}`,
        { annotation: testId(activity.id) },
        async ({ config, forumCourse, forumCast, notificationRecipient }) => {
          const actors: Actors = {
            recipient: await notificationRecipient(),
            poster: await forumCast('poster'),
            other: await forumCast('moderator'),
          };
          const author = actors[activity.author];
          const thread = await createThread(author.request, config, {
            courseKey: forumCourse.courseKey,
            topicId: GENERAL_TOPIC_ID,
            type: 'discussion',
            title: uniqueTitle('activity'),
            body: 'A post with activity.',
          });
          try {
            await activity.act(actors, thread, config);

            const { found, rows } = await waitForNotification(
              actors.recipient.request,
              config,
              aboutThread(activity.type, thread.id),
              { app: 'discussion' },
            );
            expect(
              found,
              `rows seen: ${JSON.stringify(rows.map((row) => row.notification_type))}`,
            ).toBeDefined();

            await actors.recipient.page.goto(trayHostUrl(config));
            await actors.recipient.notificationTray.open('discussion');
            await expect(actors.recipient.notificationTray.row(found!.id)).toBeVisible();
          } finally {
            await deleteThread(author.request, config, thread.id);
          }
        },
      );
    }
  },
);
