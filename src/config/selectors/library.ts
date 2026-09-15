/**
 * Content libraries v2 in the authoring MFE — the library page
 * (`/library/<lib key>` and its `components` / `collections` / `units` /
 * `subsections` / `sections` tabs), the container landing pages
 * (`/unit/<key>`, `/subsection/<key>`, `/section/<key>`), the collection page,
 * the item sidebar, and the course-side pieces that reuse library content
 * (the "Library Content" picker, the preview-changes modal, the course
 * Libraries page).
 *
 * Read from `frontend-app-authoring` `origin/master` `87cba01f` (2026-09-11) and
 * confirmed live on Tutor `main` (see the plan's step 0b). The MFE ships eight
 * test ids in the whole library tree (the card and sidebar kebab toggles, the
 * sidebar, the team form) — recorded as `LIB-003` — and every button label,
 * tab title and filter label is localized. So the anchors are Paragon tab
 * `eventKey`s (`data-rb-event-key`, not localized), `name`/`id` attributes,
 * the few test ids, structural containers, and **the request an action
 * fires**: a page object clicks by position and waits for the exact v2 URL the
 * action must call, so a mis-located button fails loudly instead of doing the
 * wrong thing. Every order-based anchor names the localized label it stands
 * in for so it can be re-measured when the MFE changes.
 */

import type { AppConfig } from '../load';

/**
 * The library page's tabs, as the MFE's `ContentType` route segments and
 * Paragon `eventKey`s. Not localized (the tab titles are).
 */
export const LIBRARY_TABS = {
  home: 'home',
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
 * The library MFE lives inside the authoring app on every supported release
 * (`/authoring/library/…`); the standalone `/library-authoring/…` prefix is the
 * same app on `main`'s shell. The API's `upstream_link` uses the `/authoring`
 * form, so that is what the suite navigates to.
 */
export function libraryPath(config: AppConfig, libraryKey: string, tab?: LibraryTab): string {
  const base = `${config.baseUrls.apps}/authoring/library/${libraryKey}`;
  return tab && tab !== LIBRARY_TABS.home ? `${base}/${tab}` : base;
}

/** A container's landing page: `/library/<lib>/unit/<container key>` etc. */
export function libraryContainerPath(
  config: AppConfig,
  libraryKey: string,
  containerType: LibraryContainerType,
  containerKey: string,
): string {
  return `${config.baseUrls.apps}/authoring/library/${libraryKey}/${containerType}/${containerKey}`;
}

/** A collection's landing page. */
export function libraryCollectionPath(
  config: AppConfig,
  libraryKey: string,
  collectionKey: string,
): string {
  return `${config.baseUrls.apps}/authoring/library/${libraryKey}/collection/${collectionKey}`;
}

/** The legacy-library migration stepper (Studio Home → Legacy Libraries → Migrate). */
export function legacyMigrationPath(config: AppConfig): string {
  return `${config.baseUrls.apps}/authoring/libraries-v1/migrate`;
}

export const LIBRARY_SELECTORS = {
  /** The library page root (`LibraryAuthoringPage`); embedded in the picker it also carries `library-authoring-page-embedded`. */
  page: '.library-authoring-page',
  /** The header's action group: "Library Info" first, then "New" (editors only). */
  headerActions: '.header-actions',
  headerActionButton: '.header-actions > button',
  /** Index into {@link headerActionButton}. */
  headerAction: {
    info: 0, // "Library Info"
    new: 1, // "New"
  },
  /** The right-hand sidebar (info / add content / item info / collection). */
  sidebar: '[data-testid="library-sidebar"]',
  /** The sidebar's own header, whose last button closes it. */
  sidebarCloseButton:
    '[data-testid="library-sidebar"] .pgn__icon-button-with-tooltip, [data-testid="library-sidebar"] button.btn-icon',

  /** One content tab (Paragon `Tabs`), by its non-localized `eventKey`. */
  tab: (tab: LibraryTab) => `a[role="tab"][data-rb-event-key="${tab}"]`,
  activeTab: 'a[role="tab"].active',

  /** The search box (`search-manager` `SearchKeywordsField`). */
  searchInput: 'input[type="search"]',
  /** The "×" that clears the keywords (Paragon `SearchField` reset). */
  searchClearButton: 'button[type="reset"]',
  /** The "Sort" dropdown toggle and its menu (`SearchSortWidget`). */
  sortToggle: '#search-sort-toggle',
  sortMenu:
    '#search-sort-dropdown .dropdown-menu.show, .dropdown-menu.show[aria-labelledby="search-sort-toggle"]',
  /** Items of the sort menu, in rendered order (labels localized). */
  sortMenuItem: '.dropdown-menu.show .dropdown-item, .dropdown-menu.show .pgn__menu-item',
  /** Order of {@link sortMenuItem} — the MFE's `SearchSortOption` enum. */
  sortOption: {
    relevance: 0, // "Most Relevant"
    titleAZ: 1, // "Title, A-Z"
    titleZA: 2, // "Title, Z-A"
    newest: 3, // "Newest"
    oldest: 4, // "Oldest"
    recentlyPublished: 5, // "Recently Published"
    recentlyModified: 6, // "Recently Modified"
  },
  /** The "Type" filter's menu and its per-type checkboxes (`FilterByBlockType`). */
  typeFilterMenu: '.block-type-refinement-menu',
  typeFilterToggle:
    'button[aria-haspopup="true"]:has(+ .block-type-refinement-menu), .filter-by-refinement-menu ~ button',
  typeFilterCheckbox: (blockType: string) =>
    `input[name="block-type-filter"][value="${blockType}"]`,
  /** The "Publish Status" filter (`FilterByPublished`) checkboxes, values `published` | `modified` | `never`. */
  publishStatusCheckbox: (status: 'published' | 'modified' | 'never') =>
    `input[name="publish-status-filter"][value="${status}"]`,
  /** The tag filter's menu (`FilterByTags`); items are `.tag-toggle-item` checkboxes. */
  tagFilterItem: '.pgn__menu-item.tag-toggle-item',
  /** "Clear Filters" — the one link-styled button in the filter bar. */
  clearFiltersButton: 'button.clear-filter-button',
  /** Every open refinement menu's toggle buttons live in the filter row. */
  filterBar: '.d-flex:has(#search-sort-toggle)',

  /** Content cards, keyed by the title text they render (our own data, not platform copy). */
  card: '.pgn__card',
  cardTitle: '.pgn__card-header-title-md, .pgn__card-header-title',
  /** The card kebab menus — the three test ids the MFE does ship. */
  componentCardMenuToggle: '[data-testid="component-card-menu-toggle"]',
  containerCardMenuToggle: '[data-testid="container-card-menu-toggle"]',
  collectionCardMenuToggle: '[data-testid="collection-card-menu-toggle"]',
  /** The open kebab menu and its items, in rendered order. */
  openMenuItem: '.dropdown-menu.show .dropdown-item',
  /**
   * Component card menu order (`ComponentCard`): stands in for "Edit",
   * "Copy to clipboard", "Delete", "Add to collection" (plus "Remove from
   * unit" when rendered inside a unit).
   */
  componentMenu: { edit: 0, copy: 1, delete: 2, manageCollections: 3 },
  /**
   * Container card menu order (`ContainerCard`): "Open", "Copy to clipboard",
   * then either "Delete" (top level) or "Remove from <parent>" (inside a
   * parent), then "Manage collections".
   */
  containerMenu: { open: 0, copy: 1, deleteOrRemove: 2, manageCollections: 3 },

  /** The item sidebar's kebab (container info) and its items: "Copy to clipboard", "Delete". */
  containerInfoMenuToggle: '[data-testid="container-info-menu-toggle"]',
  /** Item-sidebar tabs by `eventKey` (`ComponentInfo` / `ContainerInfo` / `CollectionInfo`). */
  sidebarTab: (key: 'preview' | 'manage' | 'details' | 'usage' | 'settings') =>
    `[data-testid="library-sidebar"] a[role="tab"][data-rb-event-key="${key}"]`,
  /** The "Edit" button in a component's sidebar header (opens the editor). */
  sidebarEditButton:
    '[data-testid="library-sidebar"] .component-info-header button, [data-testid="library-sidebar"] button.btn-outline-primary',
  /** The "Open" button in a container's sidebar (navigates to the landing page). */
  sidebarOpenButton:
    '[data-testid="library-sidebar"] a.btn, [data-testid="library-sidebar"] button.btn-outline-primary',
  /**
   * The publish control (`PublishDraftButton`, `generic/publish-status-buttons`)
   * and the "Published" chip that replaces it once nothing is pending.
   */
  publishDraftButton:
    '[data-testid="library-sidebar"] .publish-draft-button, [data-testid="library-sidebar"] button.btn-primary',
  publishedChip:
    '[data-testid="library-sidebar"] .pgn__chip, [data-testid="library-sidebar"] .published-chip',
  /**
   * The two-step publish confirmation (`ItemHierarchyPublisher` /
   * `ContainerPublisher` / `ComponentPublisher`): a status box listing what will
   * publish, with "Cancel" (outline) then "Publish" (primary).
   */
  publishConfirmBox: '.status-box.draft-status',
  publishConfirmCancel: '.status-box.draft-status button.btn-outline-primary',
  publishConfirmSubmit: '.status-box.draft-status button.btn-primary',
  /** The Usage tab's hierarchy diagram: one row per listed item at each level. */
  hierarchy: '.content-hierarchy',
  hierarchyRow: '.content-hierarchy .text',
  hierarchyPublishStatus: '.content-hierarchy .publish-status',

  /**
   * The "Add Content" sidebar buttons (`AddContentButton`s), in the order the
   * MFE renders them for the current context. Each is an outline button; the
   * spec discriminates by the request the click fires.
   */
  addContentButton: '[data-testid="library-sidebar"] button.btn-outline-primary',
  /** The confirm dialog for a delete (Paragon `DeleteModal`): the footer's danger/primary button. */
  deleteModal: '[role="dialog"]',
  deleteModalConfirm:
    '[role="dialog"] .pgn__modal-footer button.btn-danger, [role="dialog"] .pgn__modal-footer button.btn-primary',
  deleteModalCancel: '[role="dialog"] .pgn__modal-footer button.btn-tertiary',

  /** Library Info sidebar: the public-read switch (`PublicReadToggle`, `Form.Switch`). */
  publicReadSwitch: '[data-testid="library-sidebar"] input[role="switch"]',
  /** The "Manage team" control — a button (modal) or an `a` into the admin console. */
  manageTeamControl: '[data-testid="library-sidebar"] .btn-outline-primary',

  /** Create-library form (page `/library/create` or `CreateLibraryModal` on `main`). */
  createTitleInput: 'input[name="title"]',
  createOrgInput: 'input[name="org"]',
  createOrgOption: (org: string) =>
    `.pgn__form-autosuggest__dropdown [id="${org}"], .pgn__form-autosuggest__dropdown button`,
  createSlugInput: 'input[name="slug"]',
  createSubmitButton: 'button[type="submit"]',
  /** The archive drop zone on the create form ("Create from archive"). */
  createArchiveDropzone: '[data-testid="library-archive-dropzone"]',

  /** Container landing page: editable title (`ContainerEditableTitle`) and its input. */
  containerTitle: '.container-editable-title, h1',
  containerTitleInput: 'input.form-control',
  /** Header "Add content" on a container page (`HeaderActions`): Info first, then Add content. */
  containerHeaderButton: '.header-actions > button',
  /** A child row on a container page (`LibraryContainerChildren`). */
  containerChild: '.container-children .pgn__card, .library-container-children .pgn__card',

  /** Studio Home → Libraries tab: the "New library" button (`libraries-v2-tab`). */
  homeNewLibraryButton:
    '.studio-home-sub-header button.btn-primary, #libraries-v2 button.btn-primary',
  /** Studio Home → Legacy Libraries tab alert "Migrate" button. */
  homeMigrateButton: '.alert button.btn-primary',
} as const;

/**
 * The course-side "Library Content" picker (`LibraryAndComponentPicker`): a
 * `StandardModal` from the unit page's add-component tile or the outline's Add
 * sidebar, hosting first `SelectLibrary` (a card list of libraries the user may
 * reuse from) and then the embedded library page with a select control per card.
 */
export const LIBRARY_PICKER_SELECTORS = {
  modal: '[role="dialog"] .pgn__modal-content',
  /** Library cards in `SelectLibrary`; the title is our own data. */
  libraryCard: '[role="dialog"] .pgn__card',
  /** The embedded library page inside the picker. */
  embeddedPage: '[role="dialog"] .library-authoring-page-embedded',
  /** The per-card select button in picker mode ("Add to Course" / a checkbox in multi mode). */
  cardSelectButton: '[role="dialog"] .pgn__card button.btn-primary',
  cardSelectCheckbox: '[role="dialog"] .pgn__card input[type="checkbox"]',
  /** Multi-select footer confirm ("Add selected components"). */
  footerConfirm: '[role="dialog"] .pgn__modal-footer button.btn-primary',
} as const;

/**
 * Course-side sync UI (`course-unit/preview-changes`, `course-libraries`,
 * `generic/library-reference-card`, `generic/upstream-info-icon`).
 */
export const COURSE_LIBRARY_SYNC_SELECTORS = {
  /** The preview-changes modal and its compare widget (old / new tabs). */
  previewModal: '[role="dialog"]:has([data-testid="compare-changes-widget"])',
  compareWidget: '[data-testid="compare-changes-widget"]',
  compareTab: (key: 'old' | 'new') =>
    `#preview-version-toggle a[role="tab"][data-rb-event-key="${key}"]`,
  /** Footer buttons: Accept (primary, loading) / Keep course content (tertiary) / Ignore (tertiary). */
  previewFooterButton: '[role="dialog"] .pgn__modal-footer button',
  previewFooter: { accept: 0, keep: 1, ignore: 2 },
  /** The confirmation shown before ignore / keep (`DeleteModal variant=warning`): its primary button. */
  previewConfirmButton:
    '[role="dialog"] .pgn__modal-footer button.btn-primary, [role="dialog"] .pgn__modal-footer button.btn-warning',

  /** Unit sidebar's library reference card (a course block linked upstream). */
  referenceCard: '.library-reference-card, .pgn__card:has(a[href*="/library/"])',
  /** Its buttons in order: "Go to library" (link), "Update" (when ready to sync), "Unlink". */
  referenceCardButton:
    '.library-reference-card button, .pgn__card:has(a[href*="/library/"]) button',
  /** The outline card's sync control (`UpstreamInfoIcon` → button) — `main` only. */
  outlineSyncButton: 'button:has(svg[data-testid="sync-icon"]), button.upstream-info-icon',

  /** Course Libraries page (`/course/<key>/libraries`): tabs `all` / `review`. */
  librariesTab: (key: 'all' | 'review') => `a[role="tab"][data-rb-event-key="${key}"]`,
  /** Review-tab item cards and their buttons: "Review", "Ignore", "Update". */
  reviewItemCard: '.pgn__card',
  reviewCardButton: '.pgn__card button',
  reviewCardAction: { review: 0, ignore: 1, update: 2 },
  /** The out-of-sync alert on the All tab, whose button opens Review. */
  outOfSyncAlert: '.alert.alert-info, .pgn__alert',
} as const;

/** Course Libraries page path. */
export function courseLibrariesPath(config: AppConfig, courseKey: string): string {
  return `${config.baseUrls.apps}/authoring/course/${courseKey}/libraries`;
}

/**
 * The legacy → v2 migration stepper (`LegacyLibMigrationPage`): a Paragon
 * `Stepper` with select-libraries, select-destination and confirm steps.
 */
export const LEGACY_MIGRATION_SELECTORS = {
  stepper: '.pgn__stepper',
  /** A legacy library row's checkbox, by the `library-v1:` key in its `value`/`id`. */
  legacyLibraryCheckbox: (key: string) =>
    `input[type="checkbox"][value="${key}"], input[type="checkbox"][id="${key}"]`,
  /** A destination library radio, by its `lib:` key. */
  destinationRadio: (key: string) => `input[type="radio"][value="${key}"]`,
  /** The step footer's primary button: "Next" then "Confirm" (`StatefulButton`). */
  footerPrimary: '.pgn__stepper-footer button.btn-primary, .pgn__modal-footer button.btn-primary',
  /** The migration status alert the destination library shows while `?migration_task=` runs. */
  migrationAlert: '.alert',
} as const;
