import type { Locator, Page, Response } from '@playwright/test';

import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS, type AppConfig } from '../../config';
import { AUTHZ_BASE, authzScopeKey } from '../../api';

/**
 * The **Roles and Permissions console** shell: its two tabs, the Assign Role
 * button, and the scope the URL presets.
 *
 * The console is a separate MFE whose origin is configuration, not a constant,
 * so this object takes it from the caller (the `adminConsole` fixture reads
 * `ADMIN_CONSOLE_URL` from the authoring MFE config). Every navigation waits for
 * the console's own `assignments/` request, which doubles as the "this surface
 * really renders" assertion a capability-gated spec needs.
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
   * {@link waitForAssignments} around the first load; everything else asserts
   * the rendered table against the API directly.
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
   * Runs `action` and returns the console's own assignments request for `scope`
   * — the evidence that the MFE is served *and* talking to this installation's
   * authz API, rather than rendering an empty shell.
   */
  async waitForAssignments(scope: string | undefined, action: () => Promise<void>) {
    const scoped = scope === undefined ? () => true : this.assignmentsRequestFor(scope);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes(`${AUTHZ_BASE}/assignments/`) &&
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
   * The console's own request for one scope's assignments — what a spec waits
   * for when it wants the table to show a particular course or library.
   */
  assignmentsRequestFor(scope: string): (response: Response) => boolean {
    const encoded = authzScopeKey(scope);
    return (response: Response) =>
      response.url().includes(`${AUTHZ_BASE}/assignments/`) &&
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
