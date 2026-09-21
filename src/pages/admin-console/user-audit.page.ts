import type { Locator, Page, Response } from '@playwright/test';

import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS } from '../../config';
import { AUTHZ_BASE } from '../../api';

/**
 * The console's **user audit view** (`/authz/user/<username>`): every role one
 * account holds, what each role may do, and the controls that take a role away.
 *
 * Two facts from the probe shape this object. Rows are addressed by **position
 * and structure**, never by role name — the Role cell's label is localized copy.
 * And the delete control is *absent* on the viewer's own admin row rather than
 * disabled, so "can I remove this?" is asked by counting controls, not by
 * reading a tooltip (`RBAC-007`).
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

  /** The scope a row is about — a course or library key, which is our own data. */
  scopeCell(row: Locator): Locator {
    return row.locator(this.s.cell).nth(2);
  }

  /** The role marker, present only for a role the console can name (`RBAC-003`). */
  roleMarker(row: Locator): Locator {
    return row.locator(this.s.roleCell);
  }

  /** A row's delete control, which is absent where the console forbids removal. */
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

  /** Expands a row's permission list. The console closes whichever was open. */
  async expandPermissions(row: Locator): Promise<void> {
    await row.locator(this.s.auditExpandPermissions).first().click();
    // `action`, not `optionalOverlay`: the list is rendered from data the row
    // already has, but under parallel load the console hydrates late enough for
    // a five-second budget to be tight.
    await this.permissionDetailRows.first().waitFor({
      state: 'visible',
      timeout: TIMEOUTS.action,
    });
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
