/**
 * The Studio Files page (`/course/<key>/assets`) — a Paragon `DataTable` of
 * course assets with card and list views. Measured live on Tutor `main` (Epic 11,
 * 2026-09-16). Search, sort and filter are client-side over the already-loaded
 * asset set, so the oracle is the rendered card/row count for the test's own
 * uploads, keyed by asset id (an attribute, never displayed copy).
 *
 * Sort and filter live in a single "Sort and filter" modal (the inline
 * `#table-filters-dropdown` stays hidden at every width); its sort radios and
 * filter checkboxes carry stable `value`s (`displayName,asc`; `image`), the one
 * localized string the page needs nowhere in a matcher.
 */
export const STUDIO_FILES_SELECTORS = {
  /** The rendered table (present once assets load) and the empty-state dropzone. */
  dataTable: '[data-testid="files-data-table"]',
  dropzone: '[data-testid="files-dropzone"]',

  /** The name search field (a Paragon TextFilter; its id carries the accessor). */
  searchInput: 'input[id^="text-filter-label-header_displayName"]',

  /** The card/list view toggle buttons and the "active view" class. */
  viewCardButton: '[data-testid="icon-btn-val-card"]',
  viewListButton: '[data-testid="icon-btn-val-list"]',
  viewActiveClass: 'btn-icon-primary-active',

  /** All asset cards, and one card / its 3-dot menu by asset id. */
  cards: '[data-testid^="grid-card-"]',
  card: (assetId: string): string => `[data-testid="grid-card-${assetId}"]`,
  itemMenu: (assetId: string): string => `[id="file-menu-dropdown-${assetId}"]`,

  /** List-view rows (asserted by count; rows expose no per-asset attribute). */
  rows: '[data-testid="data-table-container"] tbody tr.pgn__data-table-row',

  /**
   * A list row's cells, in column order: 0 selection box, 1 thumbnail, 2 file
   * name, 3 file size, 4 type, 5 "active" (a mark when course content uses the
   * file, otherwise empty), 6 access (the locked / unlocked icon), 7 the 3-dot
   * menu. Measured on Tutor `main` (2026-11-24); the cells carry no per-column
   * attribute, so {@link FILES_ROW_CELL} names them by position.
   */
  rowCell: 'td[role="cell"]',

  /**
   * A list row's 3-dot menu, both inside the row's last cell: the toggle, and
   * the items of the popup it opens. Unlike a card's menu (`itemMenu`,
   * `openMenuLink`) the toggle carries no asset id and the items are buttons
   * in a popper, in the same order ({@link FILES_ROW_MENU}).
   */
  rowMenuToggle: ':scope > button',
  rowMenuItem: '[data-popper-placement] button',

  /** Selection checkboxes: the header "select all" and the per-row cell boxes. */
  selectAllCheckbox: '[data-testid="datatable-select-column-checkbox-header"]',
  rowCheckbox: '[data-testid="datatable-select-column-checkbox-cell"]',

  /** The hidden file input the "Add files" button drives (upload target). */
  uploadInput: '.files-table input.upload[type="file"]',

  /**
   * An outstanding upload agreement's banner — one warning alert per type the
   * account has not accepted, each carrying an Agree action. Measured on Tutor
   * `main` (2026-09-22): with `AGREEMENT_GATING` set and nothing accepted, the
   * page renders the dropzone with its file input **disabled** behind these; on
   * acceptance they disappear and the input is enabled.
   */
  agreementAlert: '[role="alert"].alert-warning',
  /**
   * The same banner on a page that shows other warnings too (the course
   * outline): a warning alert whose actions hold a primary **button**, "Agree".
   * The outline asks for every upload agreement at once (the shared one, the
   * Files page's and the Videos page's), one banner per type not yet accepted.
   * Measured on Tutor `main` (2026-11-24).
   */
  agreementBanner: '[role="alert"].alert-warning:has(.pgn__alert-actions button.btn-primary)',
  /** A banner's "Agree" — the alert's one primary action (beside "Learn more", a link). */
  agreementAgreeButton: '.pgn__alert-actions button.btn-primary',
  /** The file input inside the dropzone, which gating disables. */
  dropzoneInput: '[data-testid="files-dropzone"] input[type="file"]',

  /** The bulk "Actions" menu toggle (download / delete when rows are selected). */
  actionsToggle: '#actions-menu-toggle',

  /** The "Sort and filter" modal: its opener (the one id-less outline button). */
  sortFilterButton: '.files-table button.btn-outline-primary:not([id])',
  // The sort options are hidden radios inside a clickable `.pgn__selectable_box`
  // (role=button); the filter options are ordinary checkboxes.
  sortRadio: (value: string): string =>
    `.pgn__modal .pgn__selectable_box:has(input[name="sort options"][value="${value}"])`,
  filterCheckbox: (value: string): string => `.pgn__modal input[name="filters"][value="${value}"]`,
  modalApply: '.pgn__modal button.btn-primary',
  modalClearAll: '.pgn__modal button.btn-link',

  /**
   * The links of the currently open dropdown menu (row 3-dot or bulk Actions),
   * used with a fixed index since only Delete is test-id'd. Row menu order:
   * 0 Copy Studio URL, 1 Copy Web URL, 2 Lock/Unlock, 3 Download, 4 Info, 5
   * Delete. Bulk menu order: 0 Download, 1 Delete.
   */
  openMenuLink: '.dropdown-menu.show a',
  deleteMenuItem: '[data-testid="open-delete-confirmation-button"]',

  /** The delete confirmation AlertModal and its confirm / cancel buttons. */
  deleteModal: '.pgn__alert-modal',
  deleteConfirmButton: '.pgn__alert-modal .pgn__modal-footer button.btn-primary',
  deleteCancelButton: '.pgn__alert-modal .pgn__modal-footer button.btn-tertiary',

  /**
   * The file Info modal: its two URL displays, in order "Studio URL" (the
   * portable `/static/…` path) then "Web URL" (the absolute asset URL); present
   * only while the modal is open.
   */
  infoUrlDisplay: '.files-page-url-truncate',
  /** The Info modal's body ("Usage", "Date added", "File size", the URLs, "Lock file"). */
  infoBody: '.pgn__modal .pgn__modal-body',
  /** The Info modal's "Lock file" checkbox, its only form control. */
  infoLockCheckbox: '.pgn__modal .pgn__modal-body input[type="checkbox"]',
  /**
   * The Info modal's "Usage" entries: one link per component that uses the
   * file, to its unit (`…/container/<unit key>#<block key>`). With no usage the
   * modal shows a sentence and no link.
   */
  infoUsageLink: '.pgn__modal .pgn__modal-body a[href*="/container/"]',
  /** The Info modal's close button. */
  infoCloseButton: '.pgn__modal .pgn__modal-close-button',
} as const;

/** List-row cell positions (see `rowCell`). */
export const FILES_ROW_CELL = {
  name: 2,
  size: 3,
  type: 4,
  active: 5,
  access: 6,
} as const;

/** Row 3-dot menu link indices (only Delete is test-id'd; the rest go by order). */
export const FILES_ROW_MENU = {
  copyStudioUrl: 0,
  copyWebUrl: 1,
  lock: 2,
  download: 3,
  info: 4,
} as const;
