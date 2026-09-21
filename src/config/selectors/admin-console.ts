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
} as const;
