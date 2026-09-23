import { randomUUID } from 'node:crypto';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  createThread,
  deleteThread,
  fetchDiscussionCourse,
  grantCourseTeamRole,
  listDiscussionTopics,
  listThreads,
} from '../../../src/api';
import { DISCUSSION_TAGS } from './helpers';

/**
 * Proof-of-life for the forum, with no UI: the course is on the `openedx`
 * provider the `discussions` capability promises, a learner can post and find
 * the post by search, and the instructor can make a learner a moderator — the
 * three things every forum and notification case relies on. A target that
 * declares `discussions` without the forum fails here rather than passing
 * vacuously.
 */
test.describe('Forum bootstrap', { tag: ['@smoke', ...DISCUSSION_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('the course forum is on the openedx provider', async ({
    page,
    config,
    contentCourse,
    roundTripLearner,
    studioAuthorSession,
  }) => {
    void studioAuthorSession;
    const learner = await fetchDiscussionCourse(
      roundTripLearner.request,
      config,
      contentCourse.courseKey,
    );
    expect(learner.provider).toBe('openedx');
    expect(learner.is_posting_enabled).toBe(true);
    expect(learner.user_roles).toEqual(['Student']);
    expect(learner.is_notify_all_learners_enabled).toBe(false);

    // The course's instructor may notify every learner.
    const instructor = await fetchDiscussionCourse(page.request, config, contentCourse.courseKey);
    expect(instructor.is_notify_all_learners_enabled).toBe(true);

    // The topic list is synced from the course structure by a task after the
    // course is created or published, so a fresh worker course lists it late.
    await expect
      .poll(
        async () =>
          (
            await listDiscussionTopics(roundTripLearner.request, config, contentCourse.courseKey)
          ).map((topic) => topic.id),
        { timeout: TIMEOUTS.contentPublish },
      )
      .toContain(GENERAL_TOPIC_ID);
  });

  test('a post can be found by search and deleted', async ({
    config,
    contentCourse,
    roundTripLearner,
  }) => {
    const { request } = roundTripLearner;
    const token = `e2e${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const thread = await createThread(request, config, {
      courseKey: contentCourse.courseKey,
      topicId: GENERAL_TOPIC_ID,
      type: 'discussion',
      title: `E2E forum bootstrap ${token}`,
      body: `Searchable body ${token}.`,
    });
    expect(thread.following).toBe(true);

    // Search is indexed asynchronously, so the reading polls.
    const found = async () =>
      (await listThreads(request, config, contentCourse.courseKey, { textSearch: token })).map(
        (row) => row.id,
      );
    await expect.poll(found, { timeout: TIMEOUTS.forumSearch }).toEqual([thread.id]);

    await deleteThread(request, config, thread.id);
    await expect.poll(found, { timeout: TIMEOUTS.forumSearch }).toEqual([]);
  });

  test('the instructor makes a learner a forum moderator', async ({
    page,
    config,
    contentCourse,
    roundTripLearner,
    studioAuthorSession,
  }) => {
    void studioAuthorSession;
    await grantCourseTeamRole(
      page.request,
      config,
      contentCourse.courseKey,
      [roundTripLearner.identity.email],
      'Moderator',
    );

    // Read from the moderator's own session: the role list itself is closed to
    // a course instructor (403), and this is the reading the forum acts on.
    const course = await fetchDiscussionCourse(
      roundTripLearner.request,
      config,
      contentCourse.courseKey,
    );
    expect(course.has_moderation_privileges).toBe(true);
    expect(course.user_roles).toContain('Moderator');
  });
});
