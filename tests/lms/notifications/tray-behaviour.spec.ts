import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  createComment,
  createThread,
  deleteThread,
  fetchNotificationCount,
  listNotifications,
  listOraSubmissions,
  submitOraResponse,
  type DiscussionThread,
  uniquePostTitle,
} from '../../../src/api';
import { aboutOra, aboutThread, waitForNotification } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_TAGS, trayHostUrl } from './helpers';

/**
 * How the tray behaves (TC-00474, TC-00475, TC-00476): grouping, unseen
 * counts, read state and paging, and where the bell is.
 *
 * Measured behaviour the cases rely on: a notification merges into an older
 * **unseen** row of the same group (posts by different authors in one course;
 * submissions to one ORA) instead of adding a row; the unseen count is cleared
 * only by opening the tab (`mark-seen`), while clicking a row or "Mark all as
 * read" clears unread dots (`read`); the tray pages ten rows at a time.
 */
test.describe('Notifications tray', { tag: ['@regression', ...NOTIFICATION_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'groups unseen notifications of one kind and context into one row',
    { annotation: testId('TC-00474'), tag: ['@discussions', '@ora'] },
    async ({
      page,
      config,
      forumCourse,
      forumCast,
      oraUnit,
      notificationRecipient,
      studioAuthorSession,
    }) => {
      void studioAuthorSession;
      const recipient = await notificationRecipient({
        preferences: [
          { app: 'discussion', type: 'new_discussion_post', channel: 'web', value: true },
        ],
      });
      const posters = [await forumCast('poster'), await forumCast('moderator')];
      const threads: { thread: DiscussionThread; by: (typeof posters)[number] }[] = [];
      try {
        // Two new posts in one course, by two authors, while the first is unseen.
        for (const by of posters) {
          const thread = await createThread(by.request, config, {
            courseKey: forumCourse.courseKey,
            topicId: GENERAL_TOPIC_ID,
            type: 'discussion',
            title: uniquePostTitle('grouped'),
            body: 'One of two posts.',
          });
          threads.push({ thread, by });
          expect(
            (
              await waitForNotification(
                recipient.request,
                config,
                aboutThread('new_discussion_post', thread.id),
              )
            ).found,
          ).toBeDefined();
        }
        const posts = (
          await listNotifications(recipient.request, config, { app: 'discussion' })
        ).results.filter(
          (row) =>
            row.notification_type === 'new_discussion_post' &&
            row.course_id === forumCourse.courseKey,
        );
        expect(posts).toHaveLength(1);
        expect(posts[0]!.content_context.grouped).toBe(true);

        await recipient.page.goto(trayHostUrl(config));
        await recipient.notificationTray.open('discussion');
        await expect(recipient.notificationTray.rows('discussion')).toHaveCount(1);
      } finally {
        for (const { thread, by } of threads) {
          await deleteThread(by.request, config, thread.id);
        }
      }

      // Two submissions to one staff-graded ORA reach the staff as one row.
      for (const learner of [await notificationRecipient(), await notificationRecipient()]) {
        await submitOraResponse(
          learner.request,
          config,
          oraUnit.courseKey,
          oraUnit.oraUsageKey,
          'An essay.',
        );
      }
      const ofThisOra = aboutOra('ora_staff_notifications', oraUnit.oraUsageKey);
      await expect
        .poll(
          async () => (await listOraSubmissions(page.request, config, oraUnit.oraUsageKey)).length,
        )
        .toBe(2);
      const { found } = await waitForNotification(
        page.request,
        config,
        (row) => ofThisOra(row) && row.content_context.grouped === true,
        { app: 'grading' },
      );
      expect(found).toBeDefined();
      const oraRows = (
        await listNotifications(page.request, config, { app: 'grading', pageSize: 50 })
      ).results.filter(ofThisOra);
      expect(oraRows).toHaveLength(1);
    },
  );

  test(
    'shows unseen counts, read state and more notifications on demand',
    { annotation: testId('TC-00475'), tag: '@discussions' },
    async ({ config, forumCourse, forumCast, notificationRecipient }) => {
      const recipient = await notificationRecipient();
      const poster = await forumCast('poster');
      // Eleven responses on eleven of the recipient's posts: eleven rows (one per
      // thread, so none group), one more than the tray's first page.
      const threads: DiscussionThread[] = [];
      try {
        for (let i = 0; i < 11; i += 1) {
          const thread = await createThread(recipient.request, config, {
            courseKey: forumCourse.courseKey,
            topicId: GENERAL_TOPIC_ID,
            type: 'discussion',
            title: uniquePostTitle(`paged-${i}`),
            body: 'A post that will get a response.',
          });
          threads.push(thread);
          await createComment(poster.request, config, { threadId: thread.id, body: 'A response.' });
        }
        const unseen = async () =>
          (await fetchNotificationCount(recipient.request, config)).count_by_app_name.discussion;
        await expect.poll(unseen, { timeout: TIMEOUTS.notificationDelivery }).toBe(11);

        // The bell shows the unseen count.
        const { notificationTray: tray } = recipient;
        await recipient.page.goto(trayHostUrl(config));
        await expect
          .poll(async () => ({
            badge: await tray.bellBadge.textContent(),
            api: String(await unseen()),
          }))
          .toEqual({ badge: '11', api: '11' });

        // Opening the tab marks its rows seen: the count clears, the dots stay.
        await tray.open('discussion');
        await expect.poll(unseen).toBe(0);
        await expect(tray.bellBadge).toBeHidden();
        const rows = (await listNotifications(recipient.request, config, { app: 'discussion' }))
          .results;
        const first = rows[0]!;
        await expect(tray.unreadDot(first.id)).toBeVisible();

        // Clicking a row reads it (and opens its post).
        const { opened } = await tray.openRow(first.id);
        expect(opened.url()).toBe(first.content_url);
        await opened.close();
        await expect(tray.unreadDot(first.id)).toBeHidden();

        // "Mark all as read" reads the rest.
        await tray.markAllRead();
        await expect
          .poll(
            async () =>
              (
                await listNotifications(recipient.request, config, {
                  app: 'discussion',
                  pageSize: 50,
                })
              ).results.filter((row) => row.last_read === null).length,
          )
          .toBe(0);

        // Ten rows a page; "Load more" fetches the eleventh and ends the list.
        await expect(tray.rows('discussion')).toHaveCount(10);
        await tray.loadMore('discussion', 2);
        await expect(tray.rows('discussion')).toHaveCount(11);
        await expect(tray.listComplete).toBeVisible();
        await expect(tray.loadMoreButton).toBeHidden();
      } finally {
        for (const thread of threads) {
          await deleteThread(recipient.request, config, thread.id);
        }
      }
    },
  );

  test(
    'puts the bell on Studio, the dashboard, course home, discussions and account pages',
    { annotation: testId('TC-00476'), tag: '@discussions' },
    async ({
      page,
      config,
      forumCourse,
      notificationRecipient,
      notificationTray,
      studioAuthorSession,
    }) => {
      void studioAuthorSession;
      const learner = await notificationRecipient();
      const { apps, studio } = config.baseUrls;

      for (const url of [
        `${apps}/learner-dashboard/`,
        `${apps}/learning/course/${forumCourse.courseKey}/home`,
        `${apps}/discussions/${forumCourse.courseKey}/posts`,
        `${apps}/account/`,
      ]) {
        await learner.page.goto(url);
        await expect(learner.notificationTray.bell, url).toBeVisible();
      }

      // A learner with no notifications still gets a tray, with its empty state.
      await learner.notificationTray.open('discussion');
      await expect(learner.notificationTray.emptyList).toBeVisible();

      // Studio's header has it too (the author's page is signed in to Studio).
      await page.goto(`${studio}/home`);
      await expect(notificationTray.bell).toBeVisible();
      await notificationTray.open('discussion');
      await expect(notificationTray.tray).toBeVisible();
    },
  );
});
