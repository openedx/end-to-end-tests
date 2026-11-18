import type { Locator, Page, Response } from '@playwright/test';

import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS, type AppConfig } from '../../config';
import { authzScopeKey, teamMembersGroupingOf } from '../../api';
import { UserAuditPage } from './user-audit.page';

/**
 * The **Roles and Permissions console** shell: its two tabs, the Assign Role
 * button, and the scope the URL presets.
 *
 * The console is a separate MFE whose origin is configuration, not a constant,
 * so this object takes it from the caller (the `adminConsole` fixture reads
 * `ADMIN_CONSOLE_URL` from the authoring MFE config). A spec that needs proof
 * the surface really renders waits for the console's own Team Members list
 * request ({@link waitForTeamMembersList}) — `assignments/` or `users/`,
 * whichever the console's generation reads.
 */
export class AdminConsolePage {
  private readonly s = ADMIN_CONSOLE_SELECTORS;

  readonly heading: Locator;
  readonly tabs: Locator;
  readonly activePanel: Locator;
  readonly assignRoleButton: Locator;
  /** The three filter toggles, in render order: Organization, Role, Scope. */
  readonly filters: Locator;
  /**
   * The console's toast, which it uses for a success and for a failed request
   * alike. A failure's toast carries a retry; a success's clears itself.
   */
  readonly toast: Locator;
  readonly toastRetry: Locator;

  constructor(
    readonly page: Page,
    private readonly config: AppConfig,
    /** The console's origin, e.g. `http://apps.example.org/admin-console`. */
    readonly origin: string,
  ) {
    this.heading = page.locator(this.s.heading).first();
    this.tabs = page.locator(this.s.tab);
    this.activePanel = page.locator(this.s.activePanel);
    this.assignRoleButton = page.locator(this.s.assignRoleButton).first();
    this.filters = this.activePanel.locator(this.s.filterDropdown);
    this.toast = page.locator(this.s.toast);
    this.toastRetry = page.locator(this.s.toastRetry);
  }

  /** The console URL, optionally preset to one course or library scope. */
  url(scope?: string): string {
    const base = `${this.origin}${this.s.authzPath}`;
    return scope === undefined ? base : `${base}?scope=${encodeURIComponent(scope)}`;
  }

  /**
   * Opens the console and waits for its table to render.
   *
   * It deliberately does **not** wait for a network response: the console caches
   * its queries, so a second visit to the same scope renders from cache and
   * fetches nothing. A spec that wants the request as evidence asks for it with
   * {@link waitForTeamMembersList} around the first load; everything else
   * asserts the rendered table against the API directly.
   *
   * A caller who may view no team at all gets no table: see {@link open}.
   */
  async goto(scope?: string): Promise<void> {
    await this.page.goto(this.url(scope), { waitUntil: 'domcontentloaded' });
    await this.activePanel.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    await this.page
      .locator(ADMIN_CONSOLE_SELECTORS.table)
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
  }

  /**
   * Opens the console and reports which answer it gave: its error view
   * (`refused`), or the Team Members table with the Scope filter applied
   * (`scoped`) or not (`unscoped`).
   *
   * On `main` the console checks up front whether the caller may view any course
   * or library team, and one who may not gets its error view instead of the
   * table (frontend-app-admin-console#222). `verawood` has no such check and
   * renders the table, empty. A spec about what such a caller sees lists the
   * answers it accepts.
   */
  async open(scope?: string): Promise<'refused' | 'scoped' | 'unscoped'> {
    await this.page.goto(this.url(scope), { waitUntil: 'domcontentloaded' });
    const table = this.page.locator(this.s.table).first();
    const refusal = this.page.locator(this.s.errorViewAction).first();
    await table.or(refusal).first().waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    if (!(await table.isVisible())) return 'refused';
    return (await this.isFilterApplied(2)) ? 'scoped' : 'unscoped';
  }

  /**
   * Runs `action` and returns the console's own Team Members list request for
   * `scope` — the evidence that the MFE is served *and* talking to this
   * installation's authz API, rather than rendering an empty shell.
   */
  async waitForTeamMembersList(scope: string | undefined, action: () => Promise<void>) {
    const scoped = scope === undefined ? () => true : this.teamMembersRequestFor(scope);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          teamMembersGroupingOf(r.url()) !== undefined &&
          r.request().method() === 'GET' &&
          scoped(r),
        { timeout: TIMEOUTS.navigation },
      ),
      action(),
    ]);
    return response;
  }

  /** Switches to a tab by position: 0 is Team Members, 1 is Roles and Permissions. */
  async openTab(index: number): Promise<void> {
    await this.tabs.nth(index).click();
    await this.activePanel.waitFor({ state: 'visible' });
  }

  /**
   * Whether the filter at `index` is applied. The console renders an applied
   * filter's toggle as a primary button and an unapplied one as an outline
   * button, which is how a preset scope is read without touching its label.
   */
  async isFilterApplied(index: number): Promise<boolean> {
    return (await this.filters.nth(index).locator(this.s.filterToggleApplied).count()) > 0;
  }

  /** The scope filter's toggle (the third), whose state reflects `?scope=`. */
  get scopeFilter(): Locator {
    return this.filters.nth(2);
  }

  /**
   * A console route that never reads the Team Members list, with the element
   * that says it has rendered — somewhere for a caller to "move on" to while a
   * list request is still in flight. `verawood` has the Assign Role wizard's
   * own route for that; where the wizard is a modal (`rbac-console-next`) that
   * route is gone, and an account's audit view is the one that reads
   * `users/<username>/assignments/` and not the list.
   */
  routeAwayFromTeamList(username: string): { url: string; landmark: Locator } {
    if (this.config.capabilities.has('rbac-console-next')) {
      const audit = new UserAuditPage(this.page, this.origin);
      return { url: audit.url(username), landmark: audit.breadcrumb };
    }
    return {
      url: `${this.origin}${this.s.assignRolePath}`,
      landmark: this.page.locator(this.s.wizardUsersInput),
    };
  }

  /**
   * The console's own Team Members list request for one scope — what a spec
   * waits for when it wants the table to show a particular course or library.
   */
  teamMembersRequestFor(scope: string): (response: Response) => boolean {
    const encoded = authzScopeKey(scope);
    return (response: Response) =>
      teamMembersGroupingOf(response.url()) !== undefined &&
      (response.url().includes(encoded) || response.url().includes(encodeURIComponent(scope)));
  }

  /**
   * Where a link into the console points, as the two halves a spec cares about.
   *
   * Reading it through `URL` is deliberate: the authoring MFE percent-encodes
   * the key in `?scope=` on `main` and writes it raw on `verawood`, and a
   * pattern that matches one form fails on the other (`releases.md` rule 1 —
   * both forms are stable and non-localized, so the client widens instead of
   * the coverage narrowing).
   */
  async linkTarget(link: Locator): Promise<{ base: string; scope: string | null }> {
    const href = (await link.getAttribute('href')) ?? '';
    const url = new URL(href, this.origin);
    return { base: `${url.origin}${url.pathname}`, scope: url.searchParams.get('scope') };
  }

  /** The LMS origin this console reads its data from. */
  get apiOrigin(): string {
    return this.config.baseUrls.lms;
  }
}
