import { expect, type Locator, type Page, type Response } from '@playwright/test';

import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS } from '../../config';
import { AUTHZ_BASE } from '../../api';

/** The Team Members table's columns, in the order the console renders them. */
export const TEAM_MEMBER_COLUMNS = {
  name: 0,
  email: 1,
  organization: 2,
  scope: 3,
  role: 4,
  actions: 5,
} as const;

export type TeamMemberColumn = keyof typeof TEAM_MEMBER_COLUMNS;

/** Which filter dropdown, by the order the console renders them. */
export const TEAM_MEMBER_FILTERS = { organization: 0, role: 1, scope: 2 } as const;

export type TeamMemberFilter = keyof typeof TEAM_MEMBER_FILTERS;

/**
 * The console's **Team Members** tab: one row per role assignment, a search box,
 * three filters, sortable columns and a ten-row page.
 *
 * Rows are located by the **email** they carry, which is the suite's own data
 * (a generated address), never by a rendered label. Every action waits for the
 * `assignments/` request it causes and returns that response, so a mis-located
 * control fails loudly instead of asserting against a stale table.
 */
export class TeamMembersTable {
  private readonly s = ADMIN_CONSOLE_SELECTORS;

  readonly panel: Locator;
  readonly searchInput: Locator;
  readonly table: Locator;
  readonly columnHeaders: Locator;
  readonly rows: Locator;
  readonly footer: Locator;
  readonly previousPage: Locator;
  readonly nextPage: Locator;

  constructor(readonly page: Page) {
    this.panel = page.locator(this.s.activePanel);
    this.searchInput = this.panel.locator(this.s.searchInput).first();
    this.table = this.panel.locator(this.s.table).first();
    this.columnHeaders = this.table.locator(this.s.columnHeader);
    this.rows = this.table.locator(this.s.row);
    this.footer = this.panel.locator(this.s.footer);
    this.previousPage = this.footer.locator(this.s.pagerButton).first();
    this.nextPage = this.footer.locator(this.s.pagerButton).last();
  }

  /**
   * Runs `action` and returns the assignments response it caused.
   *
   * `matches` picks the response out of the several the console may have in
   * flight — the search box debounces, so waiting for "the next assignments
   * response" would capture the one the page was already fetching.
   */
  private async withAssignments(
    action: () => Promise<void>,
    matches: (url: URL) => boolean = () => true,
  ): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes(`${AUTHZ_BASE}/assignments/`) &&
          r.request().method() === 'GET' &&
          matches(new URL(r.url())),
        { timeout: TIMEOUTS.navigation },
      ),
      action(),
    ]);
    return response;
  }

  /** Types a search term and waits for the debounced query that carries it. */
  async search(term: string): Promise<Response> {
    return this.withAssignments(
      async () => {
        await this.searchInput.fill(term);
      },
      (url) => url.searchParams.get('search') === term,
    );
  }

  /**
   * Clears the search box.
   *
   * No response to wait for: the console caches its queries, so returning to a
   * question it has already asked renders from cache and fetches nothing. The
   * caller asserts the restored table, which retries until it settles.
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.fill('');
  }

  /** Opens one filter's menu and returns its option checkboxes. */
  async openFilter(filter: TeamMemberFilter): Promise<Locator> {
    const dropdown = this.panel.locator(this.s.filterDropdown).nth(TEAM_MEMBER_FILTERS[filter]);
    await dropdown.locator(this.s.filterToggle).click();
    const menu = this.page.locator(this.s.filterMenu).first();
    await menu.waitFor({ state: 'visible', timeout: TIMEOUTS.optionalOverlay });
    return this.page.locator(this.s.filterOption);
  }

  /**
   * Ticks the first option of a filter's menu and waits for the query that
   * carries **that option**.
   *
   * The value matters: the console keeps a role-filtered request of its own in
   * flight (it asks for the library roles to build this menu), so waiting for
   * "a response with a role filter" catches the wrong one. Each checkbox
   * carries its role or organization key as its `value`.
   */
  async applyFirstFilterOption(
    filter: TeamMemberFilter,
  ): Promise<{ response: Response; value: string }> {
    const options = await this.openFilter(filter);
    const param = { organization: 'orgs', role: 'roles', scope: 'scopes' }[filter];
    const first = options.first();
    const value = (await first.getAttribute('value')) ?? '';
    const response = await this.withAssignments(
      async () => {
        await first.check();
      },
      (url) => (url.searchParams.get(param) ?? '').split(',').includes(value),
    );
    return { response, value };
  }

  /**
   * Goes to the next page and waits for the pager to say it moved.
   *
   * The wait matters: clicking straight after a row-count assertion can land
   * while the table is still re-rendering and be dropped. "Previous is now
   * usable" is the structural signal that the page turned — the pager's own
   * position text is localized.
   */
  async goToNextPage(): Promise<void> {
    await this.nextPage.click();
    await this.previousPage.waitFor({ state: 'visible' });
    await expect(this.previousPage).toBeEnabled();
  }

  /** Goes back a page, waiting for the pager to say it moved. */
  async goToPreviousPage(): Promise<void> {
    await this.previousPage.click();
    await expect(this.nextPage).toBeEnabled();
  }

  /** Sorts by a column, waiting for the re-query the console runs. */
  async sortBy(column: TeamMemberColumn): Promise<Response> {
    return this.withAssignments(async () => {
      await this.columnHeaders.nth(TEAM_MEMBER_COLUMNS[column]).click();
    });
  }

  /**
   * Every row for one account, located by the email the suite generated — our
   * own data, not a rendered label, so it is language-independent.
   */
  rowsFor(email: string): Locator {
    return this.rows.filter({ hasText: email });
  }

  /** One cell of a row. */
  cell(row: Locator, column: TeamMemberColumn): Locator {
    return row.locator(this.s.cell).nth(TEAM_MEMBER_COLUMNS[column]);
  }

  /**
   * The Role cell's role marker. The console only renders it for a role it has a
   * display name for — the migrated `course_limited_staff`,
   * `course_data_researcher` and `course_beta_tester` rows have none, so the
   * marker is absent there (`RBAC-003`).
   */
  roleMarker(row: Locator): Locator {
    return this.cell(row, 'role').locator(this.s.roleCell);
  }

  /** The "(Me)" marker the console appends to the signed-in user's own name. */
  currentUserMarker(row: Locator): Locator {
    return this.cell(row, 'name').locator(this.s.currentUserMarker);
  }

  /** The row's action control: the button that opens that user's audit view. */
  viewButton(row: Locator): Locator {
    return this.cell(row, 'actions').locator(this.s.rowActionButton).first();
  }

  /** Opens a row's audit view and waits for that user's assignments request. */
  async openAudit(row: Locator): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes(`${AUTHZ_BASE}/users/`) && r.url().includes('/assignments/'),
        { timeout: TIMEOUTS.navigation },
      ),
      this.viewButton(row).click(),
    ]);
    return response;
  }
}
