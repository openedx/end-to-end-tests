import { randomUUID } from 'node:crypto';

import { expect, test } from '../../../src/fixtures';
import { DISCUSSIONS_SELECTORS, TIMEOUTS } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  createComment,
  createThread,
  deleteThread,
  listThreads,
  type DiscussionComment,
  type DiscussionThread,
} from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { DiscussionsPage } from '../../../src/pages/lms/discussions/discussions.page';
import { testId } from '../../../src/reporting';
import { DISCUSSIONS_A11Y_BASELINE, DISCUSSION_TAGS } from './helpers';

/**
 * Forum basics (TC-00029) and search (TC-00030).
 *
 * TC-00029 runs in the learning MFE's in-unit discussions sidebar, on a unit of
 * the test's own with an in-context topic: a learner posts, responds, edits
 * and deletes, and each step is read back from the discussion API. TC-00030
 * searches the full discussions MFE for words from a post's body and from a
 * response, and gets the post back — asserted from the API's `text_search` and
 * from the rendered list (search is indexed asynchronously, so both poll).
 */
test.describe(
  'Forum basics',
  { tag: ['@regression', '@mfe-discussions', '@mfe-learning', ...DISCUSSION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a learner posts, responds, edits and deletes from the unit sidebar',
      { annotation: testId('TC-00029') },
      async ({ config, forumUnit, notificationRecipient }) => {
        const learner = await notificationRecipient();
        const { courseKey, topicId } = forumUnit;
        const token = randomUUID().slice(0, 8);

        await learner.unitPage.goto(courseKey, forumUnit.sequentialId, forumUnit.unitId);
        await learner.unitPage.openDiscussionsSidebar();
        const sidebar = new DiscussionsPage(
          learner.page,
          config,
          learner.unitPage.discussionsFrame,
        );

        const editor = await sidebar.startPost();
        // The sidebar's editor is fixed to the unit's topic.
        await editor.fill({
          title: `E2E sidebar post ${token}`,
          body: 'Posted in a unit.',
        });
        const thread = (await (await editor.submit()).json()) as DiscussionThread;
        try {
          expect(thread.topic_id).toBe(topicId);
          expect(
            (await listThreads(learner.request, config, courseKey, { topicId })).map(
              (row) => row.id,
            ),
          ).toContain(thread.id);
          await expect(sidebar.post(thread.id)).toBeVisible();

          const response = (await (
            await sidebar.respondToPost(thread.id, `A response ${token}`)
          ).json()) as DiscussionComment;
          expect(response.thread_id).toBe(thread.id);

          const edited = (await (
            await sidebar.editPostTitle(thread.id, `E2E sidebar post ${token} edited`)
          ).json()) as DiscussionThread;
          expect(edited.title).toBe(`E2E sidebar post ${token} edited`);

          expect((await sidebar.deletePost(thread.id)).status()).toBe(204);
          expect(
            (await listThreads(learner.request, config, courseKey, { topicId })).map(
              (row) => row.id,
            ),
          ).not.toContain(thread.id);
        } finally {
          // Already gone when the case passed; best-effort otherwise.
          await deleteThread(learner.request, config, thread.id).catch(() => undefined);
        }
      },
    );

    test(
      'search finds a post by words in its body and in a response',
      { annotation: testId('TC-00030') },
      async ({ config, forumCourse, forumCast, notificationRecipient }) => {
        const learner = await notificationRecipient();
        const poster = await forumCast('poster');
        const bodyWord = `body${randomUUID().replace(/-/g, '').slice(0, 10)}`;
        const responseWord = `reply${randomUUID().replace(/-/g, '').slice(0, 10)}`;
        const thread = await createThread(poster.request, config, {
          courseKey: forumCourse.courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: 'E2E searchable post',
          body: `A post about ${bodyWord}.`,
        });
        try {
          await createComment(poster.request, config, {
            threadId: thread.id,
            body: `A response about ${responseWord}.`,
          });

          await learner.discussions.goto(forumCourse.courseKey);
          for (const word of [bodyWord, responseWord]) {
            await expect
              .poll(
                async () =>
                  (
                    await listThreads(learner.request, config, forumCourse.courseKey, {
                      textSearch: word,
                    })
                  ).map((row) => row.id),
                { timeout: TIMEOUTS.forumSearch },
              )
              .toEqual([thread.id]);
            await learner.discussions.searchFor(word);
            await expect(learner.discussions.postListItem(thread.id)).toBeVisible();
            await expect(learner.discussions.postListItems).toHaveCount(1);
          }
          await checkA11y(learner.page, {
            label: 'discussions-search',
            additionalBaseline: DISCUSSIONS_A11Y_BASELINE,
            include: DISCUSSIONS_SELECTORS.anyPostListItem,
          });
        } finally {
          await deleteThread(poster.request, config, thread.id);
        }
      },
    );
  },
);
