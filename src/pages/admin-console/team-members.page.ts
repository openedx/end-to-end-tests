import type { Locator, Page, Response } from '@playwright/test';

import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS } from '../../config';
import { AUTHZ_BASE, teamMembersGroupingOf, type TeamMembersGrouping } from '../../api';

/**
 * The Team Members table's columns, by position, in each grouping.
 *
 * Grouped by user (`main`), one cell carries the first role together with its
 * scope and organization, and a column of its own holds the "+N more roles"
 * toggle — so `organization`, `scope` and `role` all name that one cell.
 */
export const TEAM_MEMBER_COLUMNS = {
  assignment: { name: 0, email: 1, organization: 2, scope: 3, role: 4, actions: 5 },
  user: { name: 0, email: 1, organization: 2, scope: 2, role: 2, moreRoles: 3, actions: 4 },
} as const;

export type TeamMemberColumn = keyof (typeof TEAM_MEMBER_COLUMNS)['assignment'];

/** How many columns the table renders in each grouping. */
export const TEAM_MEMBER_COLUMN_COUNT: Readonly<Record<TeamMembersGrouping, number>> = {
  assignment: 6,
  user: 5,
};

/** Which filter dropdown, by the order the console renders them. */
export const TEAM_MEMBER_FILTERS = { organization: 0, role: 1, scope: 2 } as const;

export type TeamMemberFilter = keyof typeof TEAM_MEMBER_FILTERS;

/**
 * The console's **Team Members** tab: a search box, three filters, sortable
 * columns and a ten-row page.
 *
 * What a row *is* depends on the console's generation ({@link grouping}): one
 * row per role assignment read from `assignments/` (`verawood`), or one row per
 * user read from `users/` (`main`). This object detects which from the
 * list request it makes and takes either as its own, so a spec stays generation-free
 * by counting against `listTeamMembers` under the grouping this reports.
 *
 * Rows are located by the **email** they carry, which is the suite's own data
 * (a generated address), never by a rendered label. Every action waits for the
 * list request it causes and returns that response, so a mis-located control
 * fails loudly instead of asserting against a stale table.
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
    // The first list request the page makes says which grouping it renders.
    // Later visits may render from the console's cache and fetch nothing, so
    // the request is recorded as it happens rather than awaited on demand.
    page.on('request', (request) => {
      const grouping = teamMembersGroupingOf(request.url());
      if (grouping !== undefined && request.method() === 'GET') this.seen ??= grouping;
    });
  }

  private seen: TeamMembersGrouping | undefined;

  /**
   * Which grouping this console renders, read from the list request it made to
   * render the table — `assignments/` or `users/`, the change itself rather
   * than any styling that came with it. Call it once the table has loaded on
   * this page; the object must exist before that first load to see the request.
   */
  async grouping(): Promise<TeamMembersGrouping> {
    await this.table.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    if (this.seen === undefined) {
      // The table's frame can render before its first list request leaves: the
      // console after `verawood` asks what the viewer may see first and only
      // then queries the list. Give that request the chance to be made; the
      // listener above records it.
      await this.page
        .waitForRequest(
          (request) =>
            request.method() === 'GET' && teamMembersGroupingOf(request.url()) !== undefined,
          { timeout: TIMEOUTS.action },
        )
        .catch(() => undefined);
    }
    if (this.seen === undefined) {
      throw new Error(
        'The Team Members table rendered without this page object seeing its list request ' +
          '(GET authz assignments/ or users/), so its grouping is unknown. Construct the ' +
          'TeamMembersTable before the page first opens the console.',
      );
    }
    return this.seen;
  }

  /**
   * Runs `action` and returns the list response it caused.
   *
   * `matches` picks the response out of the several the console may have in
   * flight — the search box debounces, so waiting for "the next list
   * response" would capture the one the page was already fetching.
   */
  private async withList(
    action: () => Promise<void>,
    matches: (url: URL) => boolean = () => true,
    timeout: number = TIMEOUTS.navigation,
  ): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          teamMembersGroupingOf(r.url()) !== undefined &&
          r.request().method() === 'GET' &&
          matches(new URL(r.url())),
        { timeout },
      ),
      action(),
    ]);
    return response;
  }

  /** Types a search term and waits for the debounced query that carries it. */
  async search(term: string): Promise<Response> {
    return this.withList(
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
    const response = await this.withList(
      async () => {
        await first.check();
      },
      (url) => (url.searchParams.get(param) ?? '').split(',').includes(value),
    );
    return { response, value };
  }

  /**
   * Turns to a page and waits for the query that page change causes.
   *
   * The request is the discriminator, not the pager's own state: a click that
   * lands while the footer is being re-rendered is dropped silently, so a first
   * attempt that produces no query is retried once — and a genuine failure then
   * reports the request that never came rather than a confusing disabled button.
   */
  private async turnPage(control: Locator, wantedPage: string): Promise<Response> {
    const matches = (url: URL) => (url.searchParams.get('page') ?? '1') === wantedPage;
    try {
      return await this.withList(() => control.click(), matches, TIMEOUTS.optionalOverlay);
    } catch {
      return await this.withList(() => control.click(), matches);
    }
  }

  /** Goes to the second page. */
  async goToNextPage(): Promise<Response> {
    return this.turnPage(this.nextPage, '2');
  }

  /** Sorts by a column, waiting for the re-query the console runs. */
  async sortBy(column: TeamMemberColumn): Promise<Response> {
    const index = TEAM_MEMBER_COLUMNS[await this.grouping()][column];
    return this.withList(async () => {
      await this.columnHeaders.nth(index).click();
    });
  }

  /**
   * Every row for one account, located by the email the suite generated — our
   * own data, not a rendered label, so it is language-independent.
   */
  rowsFor(email: string): Locator {
    return this.rows.filter({ hasText: email });
  }

  /** One cell of a row, in the table's current grouping. */
  async cell(row: Locator, column: TeamMemberColumn): Promise<Locator> {
    return row.locator(this.s.cell).nth(TEAM_MEMBER_COLUMNS[await this.grouping()][column]);
  }

  /** The role a row shows: the Role cell (by assignment) or the first role's badge (by user). */
  roleMarker(row: Locator): Locator {
    return row.locator(this.s.roleCell);
  }

  /**
   * Whether the row shows a display name for its role, rather than nothing
   * (by assignment) or the bare role key (by user) — the two ways the console
   * renders a role it cannot name (`RBAC-003`). `roleKey` is the role the row
   * is known to carry: the API's data, not a label.
   */
  async namesRole(row: Locator, roleKey: string): Promise<boolean> {
    const marker = this.roleMarker(row).first();
    if ((await this.grouping()) === 'assignment') {
      return ((await marker.getAttribute('data-role')) ?? '') !== '';
    }
    return ((await marker.textContent()) ?? '').trim() !== roleKey;
  }

  /**
   * Whether the console marks the row as the signed-in user's own. By
   * assignment it adds a "(Me)" element; by user it adds the same words as bare
   * text beside the username — read as "the cell says more than `username`",
   * which compares against the suite's own data, never the localized marker.
   */
  async isMarkedAsCurrentUser(row: Locator, username: string): Promise<boolean> {
    const name = await this.cell(row, 'name');
    if ((await this.grouping()) === 'assignment') {
      return (await name.locator(this.s.currentUserMarker).count()) > 0;
    }
    return ((await name.textContent()) ?? '').trim() !== username;
  }

  /** User-grouped only: the toggle that reveals the rest of a user's roles. */
  moreRolesToggle(row: Locator): Locator {
    return row.locator(this.s.moreRolesToggle);
  }

  /** The row's action control: the button that opens that user's audit view. */
  async viewButton(row: Locator): Promise<Locator> {
    return (await this.cell(row, 'actions')).locator(this.s.rowActionButton).first();
  }

  /** Opens a row's audit view and waits for that user's assignments request. */
  async openAudit(row: Locator): Promise<Response> {
    const view = await this.viewButton(row);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes(`${AUTHZ_BASE}/users/`) && r.url().includes('/assignments/'),
        { timeout: TIMEOUTS.navigation },
      ),
      view.click(),
    ]);
    return response;
  }
}
