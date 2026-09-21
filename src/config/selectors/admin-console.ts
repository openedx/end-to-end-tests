/**
 * Anchors for the **Roles and Permissions console** (the admin-console MFE,
 * served at the `ADMIN_CONSOLE_URL` the authoring MFE config advertises).
 *
 * The app ships **one** test id of its own (`toggle-scope-<key>`); everything
 * else in its DOM is Paragon's, and every label, tab title and tooltip is
 * localized copy the suite may not match (`RBAC-001`). So these anchor on, in
 * order: Paragon's own test ids, ARIA roles with no name, and structural
 * classes — each with a note naming the control it stands in for. Measured on
 * Tutor `main` with openedx-authz 1.23.0 (2026-09-21).
 */
export const ADMIN_CONSOLE_SELECTORS = {
  /** The console's route under its origin; `?scope=` presets the Scope filter. */
  authzPath: '/authz',

  /** Page heading — "Roles and Permissions Management". Asserted structurally, never by text. */
  heading: 'h2',

  /** The tab strip; index 0 is Team Members, index 1 is Roles and Permissions. */
  tab: '[role="tab"]',
  /** The second tab carries the only stable id the app assigns a tab. */
  permissionsTab: '#libraries-permissions-roles-tab',
  /** Only one tab panel is shown; the others stay in the DOM `aria-hidden`. */
  activePanel: '[role="tabpanel"][aria-hidden="false"]',
  /** The app's own region inside the active panel. */
  module: '.authz-module',

  /** "Assign Role" — the console's only primary button outside the filter row. */
  assignRoleButton: 'button.btn-primary:not(.dropdown-toggle)',

  /** Search by name or email: the panel's single text input. */
  searchInput: 'input.form-control[type="text"]',

  /**
   * The three filter dropdowns, in render order: Organization, Role, Scope.
   * A filter that is applied renders its toggle as a *primary* button and an
   * unapplied one as *outline* — the structural way to read "this filter is on".
   */
  filterDropdown: '[data-testid="dropdown"]',
  filterToggle: 'button.dropdown-toggle',
  filterToggleApplied: 'button.dropdown-toggle.btn-primary',
  /** An open filter menu's checkbox group, rendered next to its toggle. */
  filterMenu: '.dropdown-menu.show .pgn__dropdown-filter-checkbox-group',
  filterOption: '.dropdown-menu.show input[type="checkbox"]',
  /** The chip a filter adds below the row; its button clears that filter. */
  filterChipClear: 'button.pgn__chip__icon-after, .pgn__chip button',

  /** Paragon's data table, its rows and its footer. */
  table: 'table.pgn__data-table',
  columnHeader: 'th[role="columnheader"]',
  /** Sortable headers carry Paragon's sort-direction icon. */
  sortIcon: '[data-testid="arrow-drop-up-down"]',
  row: 'tbody tr.pgn__data-table-row',
  cell: 'td',
  footer: '[data-testid="table-footer"]',
  /**
   * The pager's two buttons, by position: **both** carry the `previous` class
   * on this build (`RBAC-005`), so the class cannot tell them apart and the
   * list order does — previous first, next second.
   */
  pagerButton: '.pagination li.page-item button',

  /**
   * Row internals. The Role cell carries `data-role` **only for a role the
   * console knows**: the three migrated course roles it has no display name for
   * render an empty cell (`RBAC-003`), so presence is the assertion and the
   * attribute's value — a localized label — is not.
   */
  roleCell: '[data-role]',
  /** The "(Me)" marker the console appends to the signed-in user's own name. */
  currentUserMarker: '.text-gray-500',
  /** The Actions cell's control: the eye button that opens a user's audit view. */
  rowActionButton: 'button.btn-icon',

  // --- the user audit view (`/authz/user/<username>`) ---------------------------------------

  /** Breadcrumb back to the Team Members table; the `href` is the stable part. */
  auditBreadcrumb: '.pgn__breadcrumb',
  auditBreadcrumbBack: '.pgn__breadcrumb a[href$="/authz"]',
  /** The subject's username, which is our own data in a test. */
  auditSubjectHeading: 'h2',
  /**
   * The permissions expander — a link-styled `role="button"`, not a `<button>`,
   * which matters because the row's only real `<button>` is the delete control.
   */
  auditExpandPermissions: '[role="button"]',
  /**
   * The expanded permission list, inserted as an extra single-cell row after the
   * row it belongs to. The console keeps **one** open at a time, so counting
   * these rows is how "opening another closes the first" is asserted.
   */
  auditPermissionDetailRow: 'tbody tr:not(.pgn__data-table-row)',
  /** Remove this assignment. Absent, not disabled, on your own admin row (`RBAC-007`). */
  auditDeleteRole: 'button.btn-icon-danger',

  // --- the remove-role confirmation and its toast -------------------------------------------

  confirmDialog: '[role="dialog"]',
  confirmDialogCancel: '[role="dialog"] .pgn__modal-close-button',
  confirmDialogConfirm: '[role="dialog"] .pgn__stateful-btn',
  /**
   * Paragon's toast. The console shows one for a success (which auto-hides
   * after a few seconds) and one for a server failure (which carries a Retry).
   */
  toast: '.pgn__toast',
  toastRetry: '.pgn__toast button.btn-inverse-outline-primary',

  // --- the Assign Role wizard (`/authz/assign-role`) ----------------------------------------

  assignRolePath: '/authz/assign-role',
  /** Step 1's users field: a textarea taking usernames or e-mails, comma-separated. */
  wizardUsersInput: '#users-input',
  /**
   * The role radios, whose `value` is the **role key** — one of the few
   * non-localized anchors the console offers.
   */
  wizardRoleRadio: (role: string): string => `input[type="radio"][value="${role}"]`,
  wizardRoleRadios: 'input[type="radio"]',
  /** Paragon's stepper items, and the error bubble a rejected step gains. */
  wizardStep: '[data-testid="step"]',
  wizardStepError: '.pgn__stepper-header-step .pgn__bubble-error',
  /** The overlay that highlights an entry the platform did not recognise. */
  wizardUsersHighlight: '.highlighted-users-input__overlay',
  /** Step 2's scope picker: the app's own test id, one per course or library. */
  wizardScopeToggle: (scope: string): string => `[data-testid="toggle-scope-${scope}"]`,
  wizardScopeToggles: '[data-testid^="toggle-scope-"]',
  /** The footer's advance/save control (a stateful button) and its Cancel. */
  wizardAdvance: '.pgn__stateful-btn',
  /** Cancel. Excludes the footer's language dropdown, which shares its class. */
  wizardCancel: 'button.btn-outline-primary:not(.dropdown-toggle)',
} as const;
