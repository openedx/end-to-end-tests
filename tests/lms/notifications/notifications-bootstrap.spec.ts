import { randomUUID } from 'node:crypto';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  NOTIFICATION_APPS,
  createComment,
  createThread,
  deleteThread,
  fetchNotificationCount,
  fetchNotificationPreferences,
  listNotifications,
  markNotificationsRead,
  markNotificationsSeen,
  setNotificationPreference,
} from '../../../src/api';
import { NOTIFICATION_TAGS } from './helpers';

/**
 * Proof-of-life for the notifications API, with no UI: the model this tree
 * asserts (verawood onward — on by default, v3 preferences, the three apps) is
 * what the target serves, a preference round-trips, and one notification
 * travels from one learner's action to another learner's list, where seen and
 * read behave as measured. The fastest signal that a target's notifications
 * are as the suite expects; every tray and e-mail case builds on it.
 */
test.describe('Notifications bootstrap', { tag: ['@smoke', ...NOTIFICATION_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('serves the verawood notification model to a learner', async ({
    config,
    roundTripLearner,
  }) => {
    const { request } = roundTripLearner;

    const count = await fetchNotificationCount(request, config);
    expect(count.show_notifications_tray).toBe(true);
    expect(Object.keys(count.count_by_app_name).sort()).toEqual([...NOTIFICATION_APPS].sort());

    const preferences = await fetchNotificationPreferences(request, config);
    expect(preferences.show_preferences).toBe(true);
    expect(Object.keys(preferences.data).sort()).toEqual([...NOTIFICATION_APPS].sort());
    const discussion = preferences.data.discussion.notification_types;
    // A plain learner holds no forum or course role: the role-gated types are absent.
    expect(Object.keys(discussion)).not.toContain('content_reported');
    expect(Object.keys(preferences.data.grading.notification_types)).not.toContain(
      'ora_staff_notifications',
    );
    // New posts and questions stay out of the tray until the learner opts in.
    expect(discussion.new_discussion_post?.web).toBe(false);
    expect(discussion.new_question_post?.web).toBe(false);
  });

  test('round-trips a preference', async ({ config, roundTripLearner }) => {
    const { request } = roundTripLearner;
    const read = async () =>
      (await fetchNotificationPreferences(request, config)).data.discussion.notification_types
        .new_question_post?.web;

    await setNotificationPreference(request, config, {
      app: 'discussion',
      type: 'new_question_post',
      channel: 'web',
      value: true,
    });
    expect(await read()).toBe(true);

    await setNotificationPreference(request, config, {
      app: 'discussion',
      type: 'new_question_post',
      channel: 'web',
      value: false,
    });
    expect(await read()).toBe(false);
  });

  test(
    "delivers another learner's response, and keeps seen apart from read",
    { tag: '@discussions' },
    async ({ config, contentCourse, roundTripLearners }) => {
      const [author, replier] = roundTripLearners;
      const thread = await createThread(author.request, config, {
        courseKey: contentCourse.courseKey,
        topicId: GENERAL_TOPIC_ID,
        type: 'discussion',
        title: `E2E bootstrap ${randomUUID().slice(0, 8)}`,
        body: 'Notification bootstrap thread.',
      });
      try {
        await createComment(replier.request, config, { threadId: thread.id, body: 'A response.' });

        // Keyed to this test's thread: the row routes to its post.
        const ours = async () =>
          (await listNotifications(author.request, config, { app: 'discussion' })).results.find(
            (row) =>
              row.notification_type === 'new_response' &&
              row.content_url.endsWith(`/posts/${thread.id}`),
          );
        await expect
          .poll(async () => (await ours())?.notification_type, {
            timeout: TIMEOUTS.notificationDelivery,
          })
          .toBe('new_response');
        const row = (await ours())!;
        expect(row.course_id).toBe(contentCourse.courseKey);
        expect(row.last_read).toBeNull();
        expect(row.last_seen).toBeNull();
        const unseen = async () =>
          (await fetchNotificationCount(author.request, config)).count_by_app_name.discussion;
        expect(await unseen()).toBeGreaterThanOrEqual(1);

        // Reading a row clears its unread dot but not the unseen count …
        await markNotificationsRead(author.request, config, { notificationId: row.id });
        expect((await ours())?.last_read).not.toBeNull();
        expect(await unseen()).toBeGreaterThanOrEqual(1);

        // … which only opening the tab (mark-seen) resets.
        await markNotificationsSeen(author.request, config, 'discussion');
        expect(await unseen()).toBe(0);
        expect((await ours())?.last_seen).not.toBeNull();
      } finally {
        await deleteThread(author.request, config, thread.id);
      }
    },
  );
});
