import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { lmsGet, lmsWrite } from './lms-json';

/**
 * Course teams (`lms/djangoapps/teams`): teams, their memberships, and each
 * team's own discussion. The team API authenticates by **session or Bearer**
 * only (a JWT alone is refused), so these calls take the learner's own
 * signed-in context. A learner creates, joins and leaves teams but cannot
 * delete one; teams accumulate in the course, keyed by run-unique names.
 */
const teamApi = (config: AppConfig) => `${config.baseUrls.lms}/api/team/v0`;

export interface Team {
  readonly id: string;
  readonly name: string;
  readonly topic_id: string;
  readonly course_id: string;
  /** The team's own discussion topic, which the team page shows. */
  readonly discussion_topic_id: string;
}

export async function fetchTeam(
  request: APIRequestContext,
  config: AppConfig,
  teamId: string,
): Promise<Team> {
  return lmsGet(request, `${teamApi(config)}/teams/${teamId}`, `Reading team ${teamId}`);
}

/** Creates a team in a topic; a learner creating a team joins it. */
export async function createTeam(
  request: APIRequestContext,
  config: AppConfig,
  team: { readonly courseKey: string; readonly topicId: string; readonly name: string },
): Promise<Team> {
  return lmsWrite(request, config, 'POST', `${teamApi(config)}/teams/`, 'Creating a team', {
    data: {
      course_id: team.courseKey,
      topic_id: team.topicId,
      name: team.name,
      description: `${team.name} — created by the end-to-end suite`,
    },
  });
}

/** Adds a user to a team (a learner may add themselves to an open team). */
export async function joinTeam(
  request: APIRequestContext,
  config: AppConfig,
  teamId: string,
  username: string,
): Promise<void> {
  await lmsWrite(request, config, 'POST', `${teamApi(config)}/team_membership/`, 'Joining a team', {
    data: { team_id: teamId, username },
  });
}

/** The ids of the teams a user belongs to in a course. */
export async function listTeamsOf(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  username: string,
): Promise<readonly string[]> {
  const query = new URLSearchParams({ username, course_id: courseKey });
  const page = await lmsGet<{
    readonly results: readonly {
      readonly team: { readonly id?: string; readonly team_id?: string };
    }[];
  }>(request, `${teamApi(config)}/team_membership/?${query}`, `Listing the teams of "${username}"`);
  // Collapsed, a membership's team is a reference keyed `team_id`; expanded,
  // it is the whole team, keyed `id`.
  return page.results.map(({ team }) => team.team_id ?? team.id ?? '');
}

/**
 * The ids of the threads a team page lists: the LMS's inline discussion view
 * for the team's topic, which is what the team page renders from. It lists
 * the team's own (standalone) threads — those posted from the team page.
 */
export async function listTeamThreadIds(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  discussionTopicId: string,
): Promise<readonly string[]> {
  const query = new URLSearchParams({ page: '1', sort_key: 'activity', sort_order: 'desc' });
  const body = await lmsGet<{ readonly discussion_data: readonly { readonly id: string }[] }>(
    request,
    `${config.baseUrls.lms}/courses/${courseKey}/discussion/forum/${discussionTopicId}/inline?${query}`,
    'Listing a team discussion',
  );
  return body.discussion_data.map((thread) => thread.id);
}
