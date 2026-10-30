import type { Locator, Page, Response } from '@playwright/test';

import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS } from '../../config';
import { AUTHZ_BASE } from '../../api';

/**
 * The console's **user audit view** (`/authz/user/<username>`): every role one
 * account holds, what each role may do, and the controls that take a role away.
 *
 * Two facts from the probe shape this object. Rows are addressed by **position
 * and structure**, never by role name — the Role cell's label is localized copy.
 * And "can I remove this?" is asked by counting live delete controls, not by
 * reading a tooltip: on the viewer's own admin row `main` greys the control
 * out and `verawood` omits it (`RBAC-007`), so neither counts as live.
 */
export class UserAuditPage {
  private readonly s = ADMIN_CONSOLE_SELECTORS;

  readonly breadcrumb: Locator;
  readonly backToTeamMembers: Locator;
  readonly subjectHeading: Locator;
  readonly assignRoleButton: Locator;
  readonly table: Locator;
  readonly columnHeaders: Locator;
  readonly rows: Locator;
  /** The expanded permission list, of which the console keeps one open. */
  readonly permissionDetailRows: Locator;
  readonly confirmDialog: Locator;
  readonly toast: Locator;
  /** Paragon's tooltip — asserted by presence, never by its copy. */
  readonly tooltip: Locator;

  constructor(
    readonly page: Page,
    /** The console's origin, e.g. `http://apps.example.org/admin-console`. */
    readonly origin: string,
  ) {
    this.breadcrumb = page.locator(this.s.auditBreadcrumb);
    this.backToTeamMembers = page.locator(this.s.auditBreadcrumbBack);
    this.subjectHeading = page.locator(this.s.auditSubjectHeading).first();
    this.assignRoleButton = page.locator(this.s.assignRoleButton).first();
    this.table = page.locator(this.s.table).first();
    this.columnHeaders = this.table.locator(this.s.columnHeader);
    this.rows = this.table.locator(this.s.row);
    this.permissionDetailRows = this.table.locator(this.s.auditPermissionDetailRow);
    this.confirmDialog = page.locator(this.s.confirmDialog);
    this.toast = page.locator(this.s.toast);
    this.tooltip = page.locator(this.s.tooltip);
  }

  url(username: string): string {
    return `${this.origin}${this.s.authzPath}/user/${encodeURIComponent(username)}`;
  }

  /**
   * Opens one account's audit view and waits for its table.
   *
   * Like the console's other pages it does not wait for a network response: the
   * app caches its queries, so a second visit renders from cache.
   */
  async goto(username: string): Promise<void> {
    await this.page.goto(this.url(username), { waitUntil: 'domcontentloaded' });
    await this.table.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
  }

  /** The row at `index`, in the order the console lists them. */
  row(index: number): Locator {
    return this.rows.nth(index);
  }

  /** A row's cell at `index` (0-based), in column order. */
  cell(row: Locator, index: number): Locator {
    return row.locator(this.s.cell).nth(index);
  }

  /** The role marker, present only for a role the console can name (`RBAC-003`). */
  roleMarker(row: Locator): Locator {
    return row.locator(this.s.roleCell);
  }

  /** A row's live delete control, which is absent or greyed where the console forbids removal. */
  deleteControl(row: Locator): Locator {
    return row.locator(this.s.auditDeleteRole);
  }

  /**
   * Every delete control the view offers, as a locator so a spec can assert on
   * it with a retrying matcher: the console decides whether to render them only
   * after it has asked the platform what the viewer may do, so they appear a
   * moment after the rows.
   */
  get deleteControls(): Locator {
    return this.table.locator(this.s.auditDeleteRole);
  }

  /** Every greyed delete control, each in the wrapper that carries its tooltip. */
  get disabledDeleteControls(): Locator {
    return this.table.locator(this.s.auditDisabledDeleteRole);
  }

  /** Expands a row's permission list. The console closes whichever was open. */
  async expandPermissions(row: Locator): Promise<void> {
    const toggle = row.locator(this.s.auditExpandPermissions).first();
    const opened = this.permissionDetailRows.first();
    await toggle.click();
    try {
      await opened.waitFor({ state: 'visible', timeout: TIMEOUTS.optionalOverlay });
    } catch {
      // Under parallel load a click that lands before the console has hydrated
      // the row is dropped silently. Click once more — only if nothing opened
      // meanwhile, since a second click on an open row would close it — and
      // give the list the full `action` budget.
      if (!(await opened.isVisible())) await toggle.click();
      await opened.waitFor({ state: 'visible', timeout: TIMEOUTS.action });
    }
  }

  /** Opens the remove-role confirmation for a row. */
  async openRemove(row: Locator): Promise<void> {
    await this.deleteControl(row).first().click();
    await this.confirmDialog.waitFor({ state: 'visible', timeout: TIMEOUTS.optionalOverlay });
  }

  /** Dismisses the confirmation, which must leave the assignment alone. */
  async cancelRemove(): Promise<void> {
    await this.page.locator(this.s.confirmDialogCancel).click();
    await this.confirmDialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.optionalOverlay });
  }

  /**
   * Confirms the removal and returns the revocation the console sent — the
   * request is the discriminator, since the toast that follows is localized.
   */
  async confirmRemove(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes(`${AUTHZ_BASE}/roles/users/`) && r.request().method() === 'DELETE',
        { timeout: TIMEOUTS.navigation },
      ),
      this.page.locator(this.s.confirmDialogConfirm).click(),
    ]);
    return response;
  }
}
