import type { Locator, Page, Response } from '@playwright/test';

import { TEAMS_SELECTORS, teamThread, teamsTopicLink, type AppConfig } from '../../../config';

/**
 * The course Teams page (the LMS's Backbone page, `/courses/<key>/teams/`).
 * Locators and single-surface actions; each action returns the team API or
 * discussion response it caused, for the spec to read back through the API.
 */
export class TeamsPage {
  readonly discussion: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.discussion = page.locator(TEAMS_SELECTORS.discussion);
  }

  url(courseKey: string): string {
    return `${this.config.baseUrls.lms}/courses/${courseKey}/teams/`;
  }

  /** Opens the Teams page on its topic list. */
  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.page.locator(TEAMS_SELECTORS.topicCard).first().waitFor();
  }

  /** Opens one team's page directly, and waits for its discussion. */
  async gotoTeam(courseKey: string, topicId: string, teamId: string): Promise<void> {
    await this.page.goto(`${this.url(courseKey)}#teams/${topicId}/${teamId}`);
    await this.discussion.waitFor();
  }

  /** Opens a topic from its card on the topic list. */
  async openTopic(topicId: string): Promise<void> {
    await this.page.locator(teamsTopicLink(topicId)).click();
    await this.page.locator(TEAMS_SELECTORS.createTeam).waitFor();
  }

  /**
   * Creates a team from the open topic's "Create a new team" form and waits
   * for the team API's answer, returning it; the page then shows the new team.
   */
  async createTeam(name: string, description: string): Promise<Response> {
    await this.page.locator(TEAMS_SELECTORS.createTeam).click();
    await this.page.locator(TEAMS_SELECTORS.teamName).fill(name);
    await this.page.locator(TEAMS_SELECTORS.teamDescription).fill(description);
    const created = this.teamApiCall('POST', '/api/team/v0/teams/');
    await this.page.locator(TEAMS_SELECTORS.formSubmit).click();
    const response = await created;
    await this.discussion.waitFor();
    return response;
  }

  /** Leaves the team whose page is open, confirming the page's prompt. */
  async leave(): Promise<Response> {
    const left = this.teamApiCall('DELETE', '/api/team/v0/team_membership/');
    await this.page.locator(TEAMS_SELECTORS.leaveTeam).click();
    await this.page.locator(TEAMS_SELECTORS.confirmPrompt).first().click();
    const response = await left;
    await this.page.locator(TEAMS_SELECTORS.joinTeam).waitFor();
    return response;
  }

  /** Joins the team whose page is open. */
  async join(): Promise<Response> {
    const joined = this.teamApiCall('POST', '/api/team/v0/team_membership/');
    await this.page.locator(TEAMS_SELECTORS.joinTeam).click();
    const response = await joined;
    await this.page.locator(TEAMS_SELECTORS.leaveTeam).waitFor();
    return response;
  }

  /**
   * Posts in the team's discussion from its "Add a Post" form and waits for
   * the thread it creates, returning that response (its body carries the id).
   */
  async addPost(title: string, body: string): Promise<Response> {
    await this.page.locator(TEAMS_SELECTORS.newPost).click();
    await this.page.locator(TEAMS_SELECTORS.postTitle).fill(title);
    await this.page.locator(TEAMS_SELECTORS.postBody).fill(body);
    const created = this.page.waitForResponse(
      (r) => r.url().includes('/threads/create') && r.request().method() === 'POST',
    );
    await this.page.locator(TEAMS_SELECTORS.postSubmit).click();
    return created;
  }

  /** A thread as the team's discussion lists it. */
  thread(threadId: string): Locator {
    return this.page.locator(teamThread(threadId));
  }

  private teamApiCall(method: string, path: string): Promise<Response> {
    return this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${this.config.baseUrls.lms}${path}`) && r.request().method() === method,
    );
  }
}
