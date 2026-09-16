/**
 * Content libraries v2 in the authoring MFE — the library page
 * (`/library/<lib key>` and its `components` / `collections` / `units` /
 * `subsections` / `sections` tabs), the container landing pages
 * (`/unit/<key>`, `/subsection/<key>`, `/section/<key>`), the collection page,
 * the item sidebar, and the course-side pieces that reuse library content
 * (the "Library Content" picker, the preview-changes modal, the course
 * Libraries page, the legacy-library migration stepper).
 *
 * Measured live on Tutor `main` (2026-09-15, `frontend-app-authoring`
 * `87cba01f`-era shell build). The MFE ships very few test ids in the library
 * tree (the card / sidebar kebab toggles, the sidebar, the block preview
 * iframe, two error alerts) — recorded as `LIB-003` — and every button label,
 * tab title and menu item is localized. So the anchors are Paragon tab
 * `eventKey`s (`data-rb-event-key`, not localized), `name` / `id` attributes,
 * the few test ids, structural containers (a button's position in a known
 * group), and **the request an action fires**: a page object clicks by
 * position and waits for the exact API call the action must make, so a
 * mis-located button fails loudly instead of doing the wrong thing. Every
 * order-based anchor names the localized label it stands in for so it can be
 * re-measured when the MFE changes.
 */

import type { AppConfig } from '../load';

/**
 * The library page's tabs, as the MFE's `ContentType` route segments and
 * Paragon `eventKey`s. Not localized (the tab titles are). The "All Content"
 * tab has an **empty** event key and no route segment.
 */
export const LIBRARY_TABS = {
  home: '',
  components: 'components',
  collections: 'collections',
  units: 'units',
  subsections: 'subsections',
  sections: 'sections',
} as const;

export type LibraryTab = (typeof LIBRARY_TABS)[keyof typeof LIBRARY_TABS];

/** Container types as the API's `container_type` and the MFE's landing-page route segment. */
export const LIBRARY_CONTAINER_TYPES = ['unit', 'subsection', 'section'] as const;
export type LibraryContainerType = (typeof LIBRARY_CONTAINER_TYPES)[number];

/**
 * The library MFE lives inside the authoring app (`/authoring/library/…`) on
 * every supported release; the API's `upstream_link` uses that form too.
 */
export function libraryPath(config: AppConfig, libraryKey: string, tab?: LibraryTab): string {
  const base = `${config.baseUrls.apps}/authoring/library/${libraryKey}`;
  return tab ? `${base}/${tab}` : base;
}

/** A container's landing page: `/library/<lib>/unit/<container key>` etc. */
export function libraryContainerPath(
  config: AppConfig,
  libraryKey: string,
  containerType: LibraryContainerType,
  containerKey: string,
): string {
  return `${libraryPath(config, libraryKey)}/${containerType}/${containerKey}`;
}

/** A collection's landing page. */
export function libraryCollectionPath(
  config: AppConfig,
  libraryKey: string,
  collectionKey: string,
): string {
  return `${libraryPath(config, libraryKey)}/collection/${collectionKey}`;
}

/** The create-library form (Studio Home's "New library" link). */
export function createLibraryPath(config: AppConfig): string {
  return `${config.baseUrls.apps}/authoring/library/create`;
}

/** The legacy-library migration stepper (Studio Home → Legacy Libraries → Migrate). */
export function legacyMigrationPath(config: AppConfig): string {
  return `${config.baseUrls.apps}/authoring/libraries-v1/migrate`;
}

/** The course's Libraries page (`course-libraries`), optionally on its Review tab. */
export function courseLibrariesPath(
  config: AppConfig,
  courseKey: string,
  tab?: 'all' | 'review',
): string {
  const base = `${config.baseUrls.apps}/authoring/course/${courseKey}/libraries`;
  return tab ? `${base}?tab=${tab}` : base;
}

export const LIBRARY_SELECTORS = {
  /** The library page root (`LibraryAuthoringPage`, also the container and collection pages). */
  page: '.library-authoring-page',
  /** The unit landing page's body (`LibraryUnitPage`). */
  unitPage: '.library-unit-page',
  /** A section / subsection landing page's child list. */
  containerChildren: '.library-container-children',
  /** The breadcrumb links above a container page (library, then parents). */
  breadcrumbLink: '.sub-header-breadcrumbs a',

  /**
   * The header's action buttons, in order: the Info button ("Library Info" /
   * "Unit Info" / "Section Info" / "Collection Info") then the add button
   * ("New" on the library and collection pages, "Add Content" / "Add
   * Subsection" / "Add Unit" on a container page).
   */
  headerActionButton: '.header-actions > button',
  headerAction: { info: 0, add: 1 },

  /** The right-hand sidebar (library info / add content / item info / collection info). */
  sidebar: '[data-testid="library-sidebar"]',
  /** The sidebar's close control: the inline icon button in its title row ("Close"). */
  sidebarCloseButton:
    '[data-testid="library-sidebar"] > div > .justify-content-between button.btn-icon-inline',

  /** One content tab (Paragon `Tabs`), by its non-localized `eventKey`. */
  tab: (tab: LibraryTab) => `a[role="tab"][data-rb-event-key="${tab}"]`,
  /** The active tab's panel — where the cards render. */
  activeTabPanel: '[role="tabpanel"].active',

  /** The search box (Paragon `SearchField`) inside the library page and its clear ("×") button. */
  searchInput: '.library-authoring-page input[name="searchfield-input"][role="searchbox"]',
  searchClearButton: '.library-authoring-page button.pgn__searchfield__iconbutton-reset',
  /** The "Sort" dropdown toggle and its open menu's items. */
  sortToggle: '#search-sort-toggle',
  sortMenuItem: '.dropdown-menu.show[aria-labelledby="search-sort-toggle"] .dropdown-item',
  /** Order of {@link sortMenuItem} (labels localized). */
  sortOption: {
    recentlyModified: 0, // "Recently Modified"
    recentlyPublished: 1, // "Recently Published"
    titleAZ: 2, // "Title, A-Z"
    titleZA: 3, // "Title, Z-A"
    newest: 4, // "Newest"
    oldest: 5, // "Oldest"
  },
  /**
   * The refinement toggles in the filter row, in order: "Tags", "Type",
   * "Publish Status" (the sort toggle beside them is excluded by id).
   */
  filterToggle:
    '.library-authoring-page button.btn-outline-primary.btn-sm:not(#search-sort-toggle)',
  filter: { tags: 0, type: 1, publishStatus: 2 },
  /** The Type filter's checkboxes, by block type (`unit` etc. for containers). */
  typeFilterCheckbox: (blockType: string) =>
    `input[name="block-type-filter"][value="${blockType}"]`,
  /** The Publish Status filter's checkboxes (`FilterByPublished`). */
  publishStatusCheckbox: (status: 'published' | 'modified' | 'never') =>
    `input[name="publish-status-filter"][value="${status}"]`,
  /** The tag filter's items (`FilterByTags`). */
  tagFilterItem: '.pgn__menu-item.tag-toggle-item',
  /** "Clear Filter" — the link-styled button **inside** an open refinement menu. */
  clearFiltersButton: 'button.clear-filter-button',

  /** Content cards (components, containers, collections) and their title/status parts. */
  card: '.pgn__card',
  /**
   * Where a card's title text lives: the card body's `.h3` for component and
   * container cards (the header holds only the type icon), the header title
   * for collection / library cards, the inline editor label on container pages.
   */
  cardTitle:
    '.pgn__card-section .h3, .pgn__card-header-title-sm, .pgn__card-header-title-md, .inplace-text-editor-label',
  /** The status badge on a card ("Published" / "Draft" / "Unpublished changes"); variant class tells which. */
  cardBadge: '.badge',
  /** The card kebab toggles — the test ids the MFE ships. */
  componentCardMenuToggle: '[data-testid="component-card-menu-toggle"]',
  containerCardMenuToggle: '[data-testid="container-card-menu-toggle"]',
  collectionCardMenuToggle: '[data-testid="collection-card-menu-toggle"]',
  /** The open kebab menu and its items, in rendered order. */
  openMenu: '.dropdown-menu.show',
  openMenuItem: '.dropdown-menu.show .dropdown-item',
  /**
   * A component card's menu (`ComponentCard`): "Edit", "Copy to clipboard",
   * "Add to collection", then — after a divider — "Delete"; inside a unit,
   * "Move up" / "Move down" precede the divider and "Remove from unit" comes
   * before "Delete". So: copy is always index 1, add-to-collection index 2,
   * delete the last item, remove-from-parent the item before the last.
   */
  componentMenu: { edit: 0, copy: 1, addToCollection: 2 },
  /**
   * A container card's menu (`ContainerCard`): "Open", "Copy to clipboard",
   * "Delete", "Add to collection" at the top level; inside a parent the
   * remove/delete pair sits after a divider like the component menu.
   */
  containerMenu: { open: 0, copy: 1, delete: 2, addToCollection: 3 },
  /** The last menu item ("Delete") and the item before it ("Remove from <parent>"). */
  menuLastItem: '.dropdown-menu.show .dropdown-item:last-child',
  menuRemoveItem: '.dropdown-menu.show .dropdown-divider ~ .dropdown-item:not(:last-child)',

  /** The item sidebar's kebab (container info) — "Copy to clipboard", "Delete". */
  containerInfoMenuToggle: '[data-testid="container-info-menu-toggle"]',
  /** Item-sidebar tabs by `eventKey` (component: preview/manage/usage/details; container: manage/usage/settings/details; collection: manage/details). */
  sidebarTab: (key: 'preview' | 'manage' | 'usage' | 'details' | 'settings') =>
    `[data-testid="library-sidebar"] a[role="tab"][data-rb-event-key="${key}"]`,
  /** "Edit component" — the wide outline button in a component sidebar's header row. */
  sidebarEditComponentButton:
    '[data-testid="library-sidebar"] button.btn-outline-primary.flex-grow-1',
  /**
   * The item's publish control (`status-button`): "Publish Changes (Draft)"
   * while it has unpublished changes (`.draft-status`), a "Published" state
   * otherwise. Clicking it opens the two-step confirmation.
   */
  publishStatusButton: '[data-testid="library-sidebar"] button.status-button',
  publishStatusDraft: '[data-testid="library-sidebar"] button.status-button.draft-status',
  /**
   * The two-step publish confirmation (`ItemHierarchyPublisher`): a status box
   * listing what will publish, with "Cancel" (outline) then "Publish" (primary).
   */
  publishConfirmBox: '[data-testid="library-sidebar"] .status-box',
  publishConfirmCancel:
    '[data-testid="library-sidebar"] .status-box .pgn__action-row button.btn-outline-primary',
  publishConfirmSubmit:
    '[data-testid="library-sidebar"] .status-box .pgn__action-row button.btn-primary',
  /** The hierarchy diagram (Usage tab and publish confirmation): one row per item, the item itself `.selected`. */
  hierarchy: '.content-hierarchy',
  hierarchyRow: '.content-hierarchy .hierarchy-row',
  hierarchyRowText: '.content-hierarchy .hierarchy-row .text',
  hierarchySelectedRow: '.content-hierarchy .hierarchy-row.selected',
  hierarchyPublishStatus: '.content-hierarchy .publish-status',
  /** The component preview iframe (Preview tab, unit page cards, preview-changes modal). */
  blockPreview: '[data-testid="block-preview"]',
  /** Manage tab: the collapsible sections ("Tags", "Collections") and "Add to Collection". */
  manageCollapsibleTrigger: '[data-testid="library-sidebar"] .collapsible-trigger',
  manageAddToCollectionButton:
    '[data-testid="library-sidebar"] [role="tabpanel"] button.btn-primary',

  /** Library Info sidebar: "Publish All" (stateful primary) and "Discard Changes" (link). */
  publishAllButton: '[data-testid="library-sidebar"] button.pgn__stateful-btn.btn-primary',
  discardChangesButton: '[data-testid="library-sidebar"] button.btn-link',
  /** The public-read switch (`PublicReadToggle`, `Form.Switch`) — "Allow public read". */
  publicReadSwitch: '[data-testid="library-sidebar"] input[role="switch"]',
  /** "Manage team" / "Manage Access": a link into the admin console when configured, else a button opening the team modal. */
  manageTeamLink: '[data-testid="library-sidebar"] a.btn-outline-primary[href*="admin-console"]',
  manageTeamButton: '[data-testid="library-sidebar"] button.btn-outline-primary',

  /**
   * The Add Content sidebar's buttons (`AddContentButton`s): the container /
   * existing-content buttons come **before** the `hr`, the component-type
   * buttons after it, in a fixed order: "Text", "Problem", "Open Response",
   * "Drag Drop", "Video", "Advanced / Other", then "Paste From Clipboard"
   * where the clipboard holds something pasteable.
   */
  addContentButtonBeforeRule: '[data-testid="library-sidebar"] .pgn__vstack > button:has(~ hr)',
  addContentButtonAfterRule: '[data-testid="library-sidebar"] .pgn__vstack > hr ~ button',
  /** Every Add Content button, for the container-scoped panels that render no rule (e.g. a section's "Existing Library Content", "Subsection"). */
  addContentButton: '[data-testid="library-sidebar"] .pgn__vstack > button',
  addComponentIndex: {
    html: 0, // "Text"
    problem: 1, // "Problem"
    openassessment: 2, // "Open Response"
    'drag-and-drop-v2': 3, // "Drag Drop"
    video: 4, // "Video"
    advanced: 5, // "Advanced / Other"
  },
  /** The Advanced / Other picker that follows the "Advanced / Other" button: one button per block type. */
  advancedTypeButton: '[data-testid="library-sidebar"] .pgn__vstack > hr ~ button',
  /** The component editor dialog the Add Content buttons open (`aria-label="Editor Dialog"`, an xl modal). */
  editorDialog: '[role="dialog"].pgn__modal-xl:has(iframe, .tox, form)',
  /** Its Save (primary) and close controls. */
  editorSaveButton:
    '[role="dialog"].pgn__modal-xl .pgn__modal-footer button.btn-primary, [role="dialog"].pgn__modal-xl button.btn-primary:not(.btn-outline-primary)',
  editorCloseButton: '[role="dialog"].pgn__modal-xl .pgn__modal-close-button',

  /** A unit page's footer: "Add New Content" then "Add Existing Content". */
  unitFooterButton: '.library-unit-page button.btn-block',
  unitFooter: { addNew: 0, addExisting: 1 },

  /** The confirm dialog for a delete/remove (Paragon `DeleteModal`) and its footer buttons. */
  deleteModal: '[role="dialog"]',
  deleteModalConfirm:
    '[role="dialog"] .pgn__modal-footer button.btn-primary, [role="dialog"] .pgn__modal-footer button.btn-danger',
  deleteModalCancel: '[role="dialog"] .pgn__modal-footer button.btn-tertiary',

  /** Inline title editor (`ContainerEditableTitle` / card titles): label, pencil, input. */
  inplaceTitleLabel: '.inplace-text-editor-label',
  inplaceTitleEditButton: '.inplace-text-editor-with-edit-input button',
  inplaceTitleInput: '.inplace-text-editor-with-edit-input input',

  /** Create-library form (`/library/create`). */
  createTitleInput: 'form input[name="title"]',
  createOrgInput: 'form input[name="org"][role="combobox"]',
  createOrgMenuButton: 'form [data-testid="autosuggest-iconbutton"]',
  createOrgOption: (org: string) =>
    `.pgn__form-autosuggest__dropdown [id="${org}"], .pgn__form-autosuggest__dropdown button:has(> :not(:empty))`,
  createSlugInput: 'form input[name="slug"]',
  createSubmitButton: 'form button[type="submit"]',
  createArchiveDropzone: '[data-testid="library-archive-dropzone"]',

  /**
   * Studio Home: the "New library" action — an `<a>` to `/library/create` on
   * `main`, a structurally identical second `<button>` beside "New course" on
   * `verawood` (see `studio-home.ts`) — the Libraries tab, and a library card's
   * title link.
   */
  homeNewLibraryLink:
    '.studio-home-sub-header .sub-header-actions a[href$="/library/create"], .studio-home-sub-header .sub-header-actions button.btn + button.btn',
  homeLibrariesTab: 'a[role="tab"][data-rb-event-key="libraries"]',
  homeLibraryCardLink: (libraryKey: string) => `a.card-item-title[href$="/library/${libraryKey}"]`,

  /** Error views the library MFE renders for a bad key / no access. */
  notFoundAlert: '[data-testid="notFoundAlert"]',
  permissionDeniedAlert: '[data-testid="permissionDeniedAlert"]',
} as const;

/**
 * The course-side "Library Content" picker (`LibraryAndComponentPicker`): a
 * `StandardModal` from the unit page's add-component tile (or the outline's
 * Add sidebar) — first `SelectLibrary` (a radio card per library the user may
 * reuse from), then the embedded library page with an "Add" button per card.
 */
export const LIBRARY_PICKER_SELECTORS = {
  modal: '[role="dialog"].pgn__modal-xl',
  /** A library's radio in `SelectLibrary`, by library key. */
  libraryRadio: (libraryKey: string) =>
    `[role="dialog"] input[name="selected-library"][value="${libraryKey}"]`,
  /** The library search field on the first step. */
  librarySearchInput: '[role="dialog"] input[name="searchfield-input"]',
  /** The embedded library page (second step) and the per-card "Add" button. */
  embeddedPage: '[role="dialog"] .library-authoring-page',
  card: '[role="dialog"] .library-authoring-page .pgn__card',
  cardAddButton: 'button.btn-outline-primary',
  /** "Change Library" — the breadcrumb back to step one. */
  changeLibraryLink: '[role="dialog"] .sub-header-breadcrumbs a',
  closeButton: '[role="dialog"] button.pgn__modal-close-button',
} as const;

/**
 * Course-side sync UI: the legacy unit iframe's xblock header, the
 * preview-changes modal, and the course Libraries page.
 */
export const COURSE_LIBRARY_SYNC_SELECTORS = {
  /**
   * In the unit page's component iframe (`iframe.xblock-container-iframe`),
   * an upstream-linked block whose library item has a newer published version
   * shows an "Update available" action in its header; clicking it opens the
   * preview-changes modal in the parent page.
   */
  iframeUpdateAvailableButton: 'button.library-sync-button.action-button',
  /** The same block's library indicator icon in the header (present whether or not an update exists). */
  iframeLibraryIcon: '.library-info-icon',

  /** The preview-changes modal (`PreviewLibraryXBlockChanges`) and its old / new tabs. */
  previewModal: '[role="dialog"].lib-preview-xblock-changes-modal',
  compareTab: (key: 'old' | 'new') => `#preview-version-toggle-tab-${key}`,
  /** Footer: "Accept changes" (stateful primary) and "Ignore changes" (tertiary; "Keep course content" appears as another tertiary when the block is customized). */
  acceptButton:
    '[role="dialog"].lib-preview-xblock-changes-modal .pgn__modal-footer button.btn-primary',
  ignoreButton:
    '[role="dialog"].lib-preview-xblock-changes-modal .pgn__modal-footer button.btn-tertiary:last-child',
  /**
   * The "Ignore these changes?" confirmation (`AlertModal variant=warning`) that
   * Ignore opens — from the preview modal and from a Review-tab card alike:
   * "Cancel" (default) then "Ignore" (danger).
   */
  ignoreConfirmModal: '[role="dialog"].pgn__alert-modal',
  ignoreConfirmButton: '[role="dialog"].pgn__alert-modal .pgn__modal-footer button.btn-danger',

  /** The course Libraries page: tabs and the Review tab's item cards. */
  librariesTab: (key: 'all' | 'review') => `#course-library-tabs-tab-${key}`,
  reviewPane: '#course-library-tabs-tabpane-review',
  allPane: '#course-library-tabs-tabpane-all',
  reviewItemCard: '#course-library-tabs-tabpane-review .pgn__card',
  /** Per card: "Review Updates" (outline), "Ignore" (tertiary), "Update" (stateful primary). */
  reviewCardReviewButton: 'button.btn-outline-primary',
  reviewCardIgnoreButton: 'button.btn-tertiary',
  reviewCardUpdateButton: 'button.btn-primary',
  /** The card's link to the course unit holding the block (`/container/<vertical>`). */
  reviewCardUnitLink: 'a[href*="/container/"]',
} as const;

/**
 * The legacy → v2 migration stepper (`LegacyLibMigrationPage`): select
 * legacy libraries → select a destination → confirm.
 */
export const LEGACY_MIGRATION_SELECTORS = {
  stepperStep: '.pgn__stepper-header-step',
  activeStep: '.pgn__stepper-header-step-active',
  /** The legacy-library checkboxes on step one (one per library card, in list order). */
  legacyLibraryCheckbox: '[role="group"] input[type="checkbox"], .pgn__form-checkbox-input',
  /** The step's search field ("Search legacy libraries"). */
  searchInput: 'input[name="searchfield-input"]',
  /** A destination library's radio on step two, by `lib:` key. */
  destinationRadio: (key: string) => `input[type="radio"][value="${key}"]`,
  /** The step footer: "Cancel" (outline) then "Next" / "Confirm" (primary). */
  footerPrimaryButton: 'button.btn-primary',
  footerCancelButton: 'button.btn-outline-primary',
} as const;
