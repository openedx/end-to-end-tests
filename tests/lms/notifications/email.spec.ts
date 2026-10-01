import { expect, test, type NotificationRecipientOptions } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  NOTIFICATION_APPS,
  createComment,
  createThread,
  deleteThread,
  fetchNotificationPreferences,
  grantCourseTeamRole,
  uniquePostTitle,
} from '../../../src/api';
import { linkIn, linkingTo, turnOffEveryNotification, waitForMail } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_TAGS } from './helpers';

/**
 * Notification e-mail (TC-00471, TC-00481, and the e-mail halves of TC-00470,
 * TC-00472 and TC-00477), read from the configured mailbox (`@email-inbox`).
 *
 * A mail is recognised by what it links to — the post, the preference centre,
 * the one-click unsubscribe — and by the test's own post title, never by its
 * localized copy. Only a learner's **first** immediate mail is sent at once
 * (later ones are batched for the platform's buffer window), so every case
 * uses fresh mailbox learners and waits for exactly one mail each.
 */

/** "Activity notifications" by e-mail, immediately (on by default, daily). */
const IMMEDIATE_ACTIVITY: NotificationRecipientOptions = {
  cadences: [{ app: 'discussion', type: 'grouped_notification', cadence: 'Immediately' }],
};

const toPost = (threadId: string) => (url: URL) => url.pathname.endsWith(`/posts/${threadId}`);
const toPreferences = (url: URL) => url.pathname === '/account/' && url.hash === '#notifications';
const toUnsubscribe = (url: URL) => url.pathname.includes('/preferences-unsubscribe/');

test.describe(
  'Notification e-mail',
  { tag: ['@regression', '@email-inbox', '@discussions', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'an immediate-cadence mail arrives and its link opens the post',
      { annotation: [testId('TC-00471'), testId('TC-00470')] },
      async ({ config, forumCourse, forumCast, mailboxLearner }) => {
        const learner = await mailboxLearner(IMMEDIATE_ACTIVITY);
        const poster = await forumCast('poster');
        const thread = await createThread(learner.request, config, {
          courseKey: forumCourse.courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniquePostTitle('mailed'),
          body: 'A post that will get a response.',
        });
        try {
          await createComment(poster.request, config, { threadId: thread.id, body: 'A response.' });

          const { found, subjects } = await waitForMail(
            learner.inbox,
            learner.request,
            linkingTo(toPost(thread.id)),
          );
          expect(found, `mail seen: ${JSON.stringify(subjects)}`).toBeDefined();
          // The mail names the post by its title — the test's own text.
          expect(`${found!.subject} ${found!.text} ${found!.html}`).toContain(thread.title);

          // Its link routes to the post (TC-00470, from the mail).
          await learner.page.goto(linkIn(found!, toPost(thread.id))!);
          await expect(learner.discussions.post(thread.id)).toBeVisible();
        } finally {
          await deleteThread(learner.request, config, thread.id);
        }
      },
    );

    test(
      'the mail links to the preference centre and unsubscribes in one click',
      { annotation: [testId('TC-00481'), testId('TC-00472')] },
      async ({ browser, config, forumCourse, forumCast, mailboxLearner }) => {
        const learner = await mailboxLearner(IMMEDIATE_ACTIVITY);
        const poster = await forumCast('poster');
        const thread = await createThread(learner.request, config, {
          courseKey: forumCourse.courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniquePostTitle('unsubscribe'),
          body: 'A post that will get a response.',
        });
        try {
          await createComment(poster.request, config, { threadId: thread.id, body: 'A response.' });
          const { found, subjects } = await waitForMail(
            learner.inbox,
            learner.request,
            linkingTo(toPost(thread.id)),
          );
          expect(found, `mail seen: ${JSON.stringify(subjects)}`).toBeDefined();

          // "Notification settings" opens the preference centre (TC-00472).
          const settings = linkIn(found!, toPreferences);
          expect(settings).toBe(learner.notificationPreferences.url());
          await learner.page.goto(settings!);
          await expect(learner.notificationPreferences.section).toBeVisible();

          // One-click unsubscribe needs no session: follow it signed out.
          const unsubscribe = linkIn(found!, toUnsubscribe);
          expect(unsubscribe).toBeDefined();
          const anonymous = await browser.newContext();
          try {
            const page = await anonymous.newPage();
            await page.goto(unsubscribe!);
            await expect
              .poll(async () => {
                const preferences = await fetchNotificationPreferences(learner.request, config);
                return NOTIFICATION_APPS.flatMap((app) =>
                  Object.entries(preferences.data[app].notification_types)
                    .filter(([, type]) => type.email)
                    .map(([name]) => name),
                );
              })
              .toEqual([]);
          } finally {
            await anonymous.close();
          }
        } finally {
          await deleteThread(learner.request, config, thread.id);
        }
      },
    );

    test(
      'a learner with every preference off receives no mail',
      { annotation: testId('TC-00477') },
      async ({ page, config, forumCourse, mailboxLearner, studioAuthorSession }) => {
        void studioAuthorSession;
        const courseKey = forumCourse.courseKey;
        const subject = await mailboxLearner();
        const sentinel = await mailboxLearner({
          cadences: [
            { app: 'discussion', type: 'new_instructor_all_learners_post', cadence: 'Immediately' },
          ],
        });
        for (const role of ['staff', 'Moderator'] as const) {
          await grantCourseTeamRole(
            page.request,
            config,
            courseKey,
            [subject.identity.email],
            role,
          );
        }
        await turnOffEveryNotification(subject.request, config);

        // An instructor's notify-all post, which mails every enrolled learner.
        const thread = await createThread(page.request, config, {
          courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniquePostTitle('silent-mail'),
          body: 'An announcement.',
          notifyAllLearners: true,
        });
        try {
          const toThisPost = linkingTo(toPost(thread.id));
          // The sentinel's mail proves delivery ran; only then is absence read.
          const delivered = await waitForMail(sentinel.inbox, sentinel.request, toThisPost);
          expect(
            delivered.found,
            `sentinel saw: ${JSON.stringify(delivered.subjects)}`,
          ).toBeDefined();
          const silent = await waitForMail(subject.inbox, subject.request, toThisPost, 0);
          expect(silent.found).toBeUndefined();
        } finally {
          await deleteThread(page.request, config, thread.id);
        }
      },
    );
  },
);
