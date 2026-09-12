import type { Locator, Page } from '@playwright/test';

import { COURSE_CREATOR_ADMIN_PATH, studioOrigin, type CourseCreatorStatus } from '../../../api';
import { COURSE_CREATOR_ADMIN_SELECTORS, type AppConfig } from '../../../config';

/**
 * Studio's Django admin for course-creator rows — the only way a default install
 * grants course-creator status, and the admin half of TC-00310. Requires a page
 * whose session is a superuser.
 */
export class CourseCreatorAdminPage {
  readonly searchInput: Locator;
  readonly resultList: Locator;
  readonly resultRows: Locator;
  readonly stateSelect: Locator;
  readonly allOrganizationsCheckbox: Locator;
  readonly noteInput: Locator;
  readonly saveButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    const s = COURSE_CREATOR_ADMIN_SELECTORS;
    this.searchInput = page.locator(s.searchInput);
    this.resultList = page.locator(s.resultList);
    this.resultRows = page.locator(s.resultRow);
    this.stateSelect = page.locator(s.stateSelect);
    this.allOrganizationsCheckbox = page.locator(s.allOrganizationsCheckbox);
    this.noteInput = page.locator(s.noteInput);
    this.saveButton = page.locator(s.saveButton);
  }

  get url(): string {
    return `${studioOrigin(this.config)}${COURSE_CREATOR_ADMIN_PATH}`;
  }

  /** Opens the change list filtered to `username` (Django's `?q=` search). */
  async gotoRowsFor(username: string): Promise<void> {
    await this.page.goto(`${this.url}?q=${encodeURIComponent(username)}`);
    await this.searchInput.waitFor();
  }

  /** The change-list row for one user, anchored by the username link text. */
  rowFor(username: string): Locator {
    return this.resultRows.filter({
      has: this.page
        .locator(COURSE_CREATOR_ADMIN_SELECTORS.rowUsernameLink)
        .filter({ hasText: new RegExp(`^${username}$`) }),
    });
  }

  /** The state column of a user's row. */
  rowState(username: string): Locator {
    return this.rowFor(username).locator(COURSE_CREATOR_ADMIN_SELECTORS.rowState);
  }

  /** Opens the change form for a user's row. */
  async openChangeForm(username: string): Promise<void> {
    await this.rowFor(username).locator(COURSE_CREATOR_ADMIN_SELECTORS.rowUsernameLink).click();
    await this.stateSelect.waitFor();
  }

  /**
   * Sets the state, ticks "All organizations" (without it the form re-renders and
   * saves nothing — measured), and saves. Django answers a saved form by
   * redirecting to the change list, which is what this waits for.
   */
  async setStateAndSave(state: CourseCreatorStatus): Promise<void> {
    await this.stateSelect.selectOption(state);
    await this.allOrganizationsCheckbox.check();
    await this.noteInput.fill('Granted by the end-to-end test suite (TC-00310).');
    await Promise.all([
      this.page.waitForURL((url) => url.pathname.endsWith(COURSE_CREATOR_ADMIN_PATH)),
      this.saveButton.click(),
    ]);
  }
}
