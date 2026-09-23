import { randomUUID } from 'node:crypto';

import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  createTeam,
  fetchTeam,
  joinTeam,
  listTeamThreadIds,
  listTeamsOf,
  type Team,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Course teams (TC-00034, TC-00035), gated on `@teams`, in the content course
 * with a topic of the suite's own (`teamsCourse`). A learner creates a team and
 * is its member, leaves and re-joins it; a teammate's post in the team's
 * discussion is listed for the other member. The team API and the team
 * discussion's own listing decide; the Teams page is the rendering.
 */
test.describe('Course teams', { tag: ['@regression', '@studio', '@author', '@teams'] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'creates a team, is its member, and leaves and re-joins it',
    { annotation: testId('TC-00034') },
    async ({ config, teamsCourse, roundTripLearner }) => {
      const learner = roundTripLearner;
      const { username } = learner.identity;
      const name = `E2E team ${randomUUID().slice(0, 8)}`;

      await learner.teamsPage.goto(teamsCourse.courseKey);
      await checkA11y(learner.page, { label: 'teams' });
      await learner.teamsPage.openTopic(teamsCourse.topicId);
      const created = (await (
        await learner.teamsPage.createTeam(name, 'An end-to-end team')
      ).json()) as Team;
      expect(created.name).toBe(name);
      expect(await listTeamsOf(learner.request, config, teamsCourse.courseKey, username)).toEqual([
        created.id,
      ]);

      expect((await learner.teamsPage.leave()).ok()).toBe(true);
      expect(await listTeamsOf(learner.request, config, teamsCourse.courseKey, username)).toEqual(
        [],
      );

      expect((await learner.teamsPage.join()).ok()).toBe(true);
      expect(await listTeamsOf(learner.request, config, teamsCourse.courseKey, username)).toEqual([
        created.id,
      ]);
    },
  );

  test(
    'lists a teammate’s post in the team discussion',
    { tag: '@discussions', annotation: testId('TC-00035') },
    async ({ config, teamsCourse, roundTripLearners }) => {
      const [member, teammate] = roundTripLearners;
      const team = await createTeam(member.request, config, {
        courseKey: teamsCourse.courseKey,
        topicId: teamsCourse.topicId,
        name: `E2E team ${randomUUID().slice(0, 8)}`,
      });
      await joinTeam(teammate.request, config, team.id, teammate.identity.username);
      const { discussion_topic_id: topic } = await fetchTeam(member.request, config, team.id);

      // The teammate posts from the team page, as a learner does.
      await teammate.teamsPage.gotoTeam(teamsCourse.courseKey, teamsCourse.topicId, team.id);
      const title = `E2E team post ${randomUUID().slice(0, 8)}`;
      const posted = await teammate.teamsPage.addPost(title, `${title} body`);
      expect(posted.ok()).toBe(true);
      // The team page's create answers `{ content: <the thread> }`.
      const threadId = String(
        ((await posted.json()) as { content: { id: string | number } }).content.id,
      );

      // The other member's team page lists it.
      expect(
        await listTeamThreadIds(member.request, config, teamsCourse.courseKey, topic),
      ).toContain(threadId);
      await member.teamsPage.gotoTeam(teamsCourse.courseKey, teamsCourse.topicId, team.id);
      await expect(member.teamsPage.thread(threadId)).toBeVisible();
    },
  );
});
