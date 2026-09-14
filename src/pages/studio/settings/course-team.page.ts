import type { Locator, Page } from '@playwright/test';

import { STUDIO_COURSE_TEAM_SELECTORS, type AppConfig } from '../../../config';
import { studioOrigin } from '../../../api';

/**
 * Course Team in the authoring MFE (`/course_team/<key>` on Studio, redirected to
 * the MFE). Locators and single-surface actions; the spec asserts, against
 * `fetchCourseTeam` and the member's own course list. Members are identified by
 * the email the test supplied (a `mailto:` link), never by the localized role
 * badge — the role is read from the API.
 */
export class StudioCourseTeamPage {
  readonly page: Page;
  readonly members: Locator;
  readonly newMemberButton: Locator;
  readonly emailInput: Locator;
  readonly addSubmitButton: Locator;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    const s = STUDIO_COURSE_TEAM_SELECTORS;
    this.members = page.locator(s.member);
    this.newMemberButton = page.locator(s.newMemberButton).first();
    this.emailInput = page.locator(s.emailInput);
    this.addSubmitButton = page.locator(s.addSubmitButton);
  }

  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/course_team/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.page.locator(STUDIO_COURSE_TEAM_SELECTORS.page).waitFor();
    await this.members.first().waitFor();
  }

  /** The row for the member with `email` (the test-supplied address). */
  memberRow(email: string): Locator {
    return this.members.filter({ has: this.page.locator(`a[href="mailto:${email}"]`) });
  }

  /**
   * Adds a member by email: opens the form, fills it, submits, and waits for the
   * row to appear. The account must already exist on the target.
   */
  async addMember(email: string): Promise<void> {
    await this.newMemberButton.click();
    await this.emailInput.fill(email);
    // The submit enables once the email is valid; it is then the only enabled
    // primary action (the header "New team member" button is disabled meanwhile).
    await this.addSubmitButton.click();
    await this.memberRow(email).waitFor();
  }

  /** Promotes a member to Admin (staff→instructor) or demotes them, via the row toggle. */
  async toggleAdmin(email: string): Promise<void> {
    const row = this.memberRow(email);
    await row.waitFor();
    await row.locator(STUDIO_COURSE_TEAM_SELECTORS.roleToggleButton).click();
  }

  /** Removes a member and waits for their row to detach. */
  async removeMember(email: string): Promise<void> {
    const row = this.memberRow(email);
    await row.waitFor();
    await row.locator(STUDIO_COURSE_TEAM_SELECTORS.deleteButton).click();
    // Deletion is confirmed in a modal.
    await this.page.locator(STUDIO_COURSE_TEAM_SELECTORS.deleteConfirmButton).click();
    await row.waitFor({ state: 'detached' });
  }
}
