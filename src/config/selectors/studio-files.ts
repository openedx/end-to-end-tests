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
  controlBar: '[data-testid="table-control-bar"]',
  tableContainer: '[data-testid="data-table-container"]',

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

  /** List-view rows; one row by the asset id its menu button carries. */
  rows: '[data-testid="data-table-container"] tbody tr.pgn__data-table-row',
  rowFor: (assetId: string): string =>
    `[data-testid="data-table-container"] tbody tr:has([id="file-menu-dropdown-${assetId}"])`,

  /** Selection checkboxes: the header "select all" and the per-row cell boxes. */
  selectAllCheckbox: '[data-testid="datatable-select-column-checkbox-header"]',
  rowCheckbox: '[data-testid="datatable-select-column-checkbox-cell"]',

  /** The hidden file input the "Add files" button drives (upload target). */
  uploadInput: '.files-table input.upload[type="file"]',

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

  /** A dropdown menu item by test id (row-menu actions: lock, download, info, delete). */
  menuItem: (testid: string): string => `[data-testid="${testid}"]`,
} as const;
