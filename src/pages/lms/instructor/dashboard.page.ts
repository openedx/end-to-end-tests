import type { Locator, Page, Response } from '@playwright/test';

import {
  INSTRUCTOR_DASHBOARD_SELECTORS,
  TIMEOUTS,
  instructorTabLink,
  instructorTabPath,
  type AppConfig,
  type InstructorTabId,
} from '../../../config';
import { INSTRUCTOR_API_V2_PATH } from '../../../api';
import { waitForWrite, type WriteMatch } from '../../studio/wait-for-write';

/**
 * The instructor dashboard MFE's shell: navigating to a tab by URL, the tab
 * nav, and the Paragon modal / dropdown plumbing every tab shares. Each tab has
 * its own page object built on this one.
 *
 * Tabs are reached by **URL** (`/instructor-dashboard/<key>/<tab_id>`), never by
 * clicking a localized title; the nav link for a tab id is how a spec asserts
 * the tab is offered. Actions wait for the exact instructor-API request they
 * fire — the MFE ships no test ids, so the request is what proves the right
 * control was pressed.
 */
export class InstructorDashboardPage {
  protected readonly s = INSTRUCTOR_DASHBOARD_SELECTORS;
  readonly main: Locator;
  readonly tabNav: Locator;
  readonly activeTabLink: Locator;
  readonly dialog: Locator;
  readonly pendingTasks: Locator;

  constructor(
    protected readonly page: Page,
    protected readonly config: AppConfig,
  ) {
    this.main = page.locator(this.s.main);
    this.tabNav = page.locator(this.s.tabNav);
    this.activeTabLink = page.locator(this.s.activeTabLink);
    this.dialog = page.locator(this.s.dialog);
    this.pendingTasks = page.locator(this.s.pendingTasks);
  }

  url(courseKey: string, tabId?: InstructorTabId): string {
    return `${this.config.baseUrls.apps}${instructorTabPath(courseKey, tabId)}`;
  }

  /**
   * Opens one tab and waits for the dashboard model request every tab makes
   * (`GET /api/instructor/v2/courses/<key>`), so the nav has what it needs to
   * render, then for the nav itself.
   */
  async goto(courseKey: string, tabId?: InstructorTabId): Promise<void> {
    await this.waitForApi(
      { method: 'GET', urlIncludes: `${INSTRUCTOR_API_V2_PATH}/${courseKey}` },
      () => this.page.goto(this.url(courseKey, tabId)),
    );
    await this.tabNav.waitFor();
  }

  /** The nav link for a tab — present only when the user may see that tab. */
  tabLink(courseKey: string, tabId: InstructorTabId): Locator {
    return this.page.locator(instructorTabLink(courseKey, tabId));
  }

  /**
   * Runs `action` and returns the instructor-API response it triggers. `match`
   * narrows by method and a URL fragment under `/api/instructor/v2/…` (or the
   * legacy `/instructor/api/…`), so a mis-located control fails here rather than
   * doing something else quietly.
   */
  async waitForApi(match: WriteMatch, action: () => Promise<unknown>): Promise<Response> {
    return waitForWrite(this.page, { timeout: TIMEOUTS.navigation, ...match }, action);
  }

  /** The open dialog's confirming action — its footer's last primary button. */
  protected dialogConfirmButton(): Locator {
    return this.dialog.locator(this.s.dialogPrimaryButton).last();
  }

  /** Closes whatever dialog is open — its close button, else Escape. */
  async closeDialog(): Promise<void> {
    if (!(await this.dialog.count())) return;
    const close = this.dialog.locator(this.s.dialogCloseButton);
    if (await close.count()) await close.first().click();
    else await this.page.keyboard.press('Escape');
    await this.dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
  }

  /** Items of the dropdown menu currently open. */
  protected openMenuItems(): Locator {
    return this.page.locator(this.s.openDropdownMenu).locator(this.s.dropdownItem);
  }

  /** A `DataTable` row whose cells contain a value the test supplied (a username). */
  rowFor(value: string): Locator {
    return this.main.locator(this.s.dataTableRow).filter({ hasText: value });
  }

  /** Every `DataTable` row on the tab. */
  rows(): Locator {
    return this.main.locator(this.s.dataTableRow);
  }
}
