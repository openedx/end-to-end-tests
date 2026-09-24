import type { Response } from '@playwright/test';

import { INSTRUCTOR_TAB_IDS } from '../../../config';
import type { CourseTeamRoleV2 } from '../../../api';
import { InstructorDashboardPage } from './dashboard.page';

/**
 * The Course Team tab: add a member to a role through its modal. The action
 * returns the v2 `POST …/team` request it fires; the spec reads the team back
 * from `GET …/team?role=`.
 */
export class InstructorCourseTeamPage extends InstructorDashboardPage {
  async gotoTab(courseKey: string): Promise<void> {
    await this.waitForApi({ method: 'GET', urlIncludes: '/team?' }, () =>
      this.goto(courseKey, INSTRUCTOR_TAB_IDS.courseTeam),
    );
  }

  /** "Add Team Member" → identifiers and a role (by its key) → submit. */
  async addMember(identifier: string, role: CourseTeamRoleV2): Promise<Response> {
    await this.main.locator(this.s.courseTeamAddButton).first().click();
    await this.dialog.waitFor();
    await this.dialog.locator(this.s.teamMemberIdentifiers).fill(identifier);
    await this.dialog.locator(this.s.teamMemberRole).selectOption(role);
    const response = await this.waitForApi({ method: 'POST', urlIncludes: '/team' }, () =>
      this.dialog.locator(this.s.teamMemberSave).last().click(),
    );
    await this.dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
    return response;
  }
}
