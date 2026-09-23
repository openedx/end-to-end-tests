import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  createThread,
  deleteThread,
  fetchCourseMetadata,
  listThreads,
  type DiscussionThread,
  uniquePostTitle,
} from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { knownGap, testId } from '../../../src/reporting';
import { DISCUSSIONS_A11Y_BASELINE, DISCUSSION_TAGS } from './helpers';

/**
 * A learner's tour of the Discussion tab (TC-00311): the tab is on the course,
 * its four views show what they say, and the post actions behave — like,
 * follow, the actions each post offers by who wrote it, report, and copy link.
 * "Tour" is the sheet's walk-through, not a product tour (none is configured on
 * a default install).
 *
 * Every action is read back from the discussion API; the menus are compared by
 * their items' test ids, never their labels. "Copy link" is held separately:
 * it writes through the Clipboard API, which a browser offers only in a secure
 * context, and the targets this suite runs against in CI are `http://`.
 */
test.describe(
  'Discussion tab',
  { tag: ['@regression', '@mfe-discussions', ...DISCUSSION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a learner explores the Discussion tab and acts on posts',
      { annotation: testId('TC-00311') },
      async ({ config, forumCourse, forumCast, notificationRecipient }) => {
        const courseKey = forumCourse.courseKey;
        const learner = await notificationRecipient();
        const poster = await forumCast('poster');
        const { discussions } = learner;

        const tabs = (await fetchCourseMetadata(learner.request, config, courseKey)).tabs;
        expect(tabs.map((tab) => tab.tab_id)).toContain('discussion');

        const mine = await createThread(learner.request, config, {
          courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniquePostTitle('mine'),
          body: 'My post.',
        });
        const theirs = await createThread(poster.request, config, {
          courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniquePostTitle('theirs'),
          body: 'Their post.',
          following: false,
        });
        const threads: [DiscussionThread, typeof learner][] = [
          [mine, learner],
          [theirs, poster],
        ];
        try {
          // All posts lists both; My posts lists only mine.
          await discussions.goto(courseKey, 'posts');
          await expect(discussions.postListItem(mine.id)).toBeVisible();
          await expect(discussions.postListItem(theirs.id)).toBeVisible();
          await checkA11y(learner.page, {
            label: 'discussions-posts',
            additionalBaseline: DISCUSSIONS_A11Y_BASELINE,
          });
          await discussions.openView(courseKey, 'my-posts');
          await expect(discussions.postListItem(mine.id)).toBeVisible();
          await expect(discussions.postListItem(theirs.id)).toBeHidden();
          await discussions.openView(courseKey, 'topics');
          await discussions.openView(courseKey, 'learners');

          // Like and follow someone else's post.
          await discussions.goto(courseKey, 'posts');
          await discussions.openPost(theirs.id);
          const liked = (await (await discussions.likePost(theirs.id)).json()) as DiscussionThread;
          expect(liked).toMatchObject({ voted: true, vote_count: 1 });
          const followed = (await (
            await discussions.followPost(theirs.id)
          ).json()) as DiscussionThread;
          expect(followed.following).toBe(true);

          // Someone else's post offers copy-link and report; my own adds edit and delete.
          await discussions.openActionsMenu({ threadId: theirs.id });
          expect(await discussions.actionsMenuItemIds()).toEqual(['copy-link', 'report']);
          await learner.page.keyboard.press('Escape');

          // Report it: the platform records the flag.
          const reported = (await (
            await discussions.reportPost(theirs.id)
          ).json()) as DiscussionThread;
          expect(reported.abuse_flagged).toBe(true);

          await discussions.goto(courseKey, 'posts');
          await discussions.openPost(mine.id);
          await discussions.openActionsMenu({ threadId: mine.id });
          expect(await discussions.actionsMenuItemIds()).toEqual(
            expect.arrayContaining(['copy-link', 'edit', 'delete']),
          );
          await learner.page.keyboard.press('Escape');

          // The API agrees on what the learner's own posts are.
          expect(
            (
              await listThreads(learner.request, config, courseKey, {
                author: learner.identity.username,
              })
            ).map((row) => row.id),
          ).toEqual([mine.id]);
        } finally {
          for (const [thread, by] of threads) {
            await deleteThread(by.request, config, thread.id);
          }
        }
      },
    );

    // "Copy link" writes the post's URL through the Clipboard API, which exists
    // only in a secure context: on an `http://` target (the CI Tutor stack, a
    // local sandbox) neither the MFE nor a test can use it, and the suite does
    // not relax browser security to get one.
    test.fixme(
      '"Copy link" puts a link to the post on the clipboard',
      {
        annotation: [
          testId('TC-00311'),
          knownGap(
            'Copy link uses the Clipboard API, which browsers offer only on https:// origins; ' +
              'the CI and local targets are http://.',
          ),
        ],
      },
      async ({ config, forumCourse, forumCast, notificationRecipient }) => {
        const learner = await notificationRecipient();
        const poster = await forumCast('poster');
        const thread = await createThread(poster.request, config, {
          courseKey: forumCourse.courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniquePostTitle('copy-link'),
          body: 'A post to link to.',
        });
        try {
          await learner.context.grantPermissions(['clipboard-read', 'clipboard-write']);
          await learner.discussions.goto(forumCourse.courseKey, 'posts');
          await learner.discussions.openPost(thread.id);
          const link = await learner.discussions.copyPostLink(thread.id);
          expect(new URL(link).pathname).toBe(
            `/discussions/${forumCourse.courseKey}/posts/${thread.id}`,
          );
          await learner.page.goto(link);
          await expect(learner.discussions.post(thread.id)).toBeVisible();
        } finally {
          await deleteThread(poster.request, config, thread.id);
        }
      },
    );
  },
);
