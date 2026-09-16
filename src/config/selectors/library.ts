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
 * iframe, two error alerts) — recorded as `LIB-005` — and every button label,
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

  /** The search box (Paragon `SearchField`) inside the library page and its clear ("×") button. */
  searchInput: '.library-authoring-page input[name="searchfield-input"][role="searchbox"]',
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
  /**
   * One tag-filter checkbox by its tag value (our own data, so matching it is
   * allowed). The MFE builds the checkbox `id` as the tag path with every
   * non-word character replaced by `_`, then a random suffix, so this anchors on
   * that computed id prefix — an attribute value, never displayed copy.
   */
  tagFilterCheckbox: (tagValue: string): string =>
    `.tag-toggle-item input[id^="${tagValue.replace(/\W/g, '_')}"]`,
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
  /** Just the component / container cards' body title — one element per card, for order assertions. */
  cardBodyTitle: '.pgn__card-section .h3',
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
  /**
   * Inside a collection a component card's menu is "Edit", "Copy to clipboard",
   * "Remove from collection", "Add to collection", divider, "Delete".
   */
  collectionCardMenu: { removeFromCollection: 2 },
  /** The last menu item ("Delete") and the item before it ("Remove from <parent>"). */
  menuLastItem: '.dropdown-menu.show .dropdown-item:last-child',
  menuRemoveItem: '.dropdown-menu.show .dropdown-divider ~ .dropdown-item:not(:last-child)',

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
  /** The component preview iframe (Preview tab, unit page cards, preview-changes modal). */
  blockPreview: '[data-testid="block-preview"]',
  /**
   * The Manage Collections view (`ManageCollections`) inside the Manage tab's
   * Collections collapsible: a search field, a `SelectableBox.Set` of the
   * library's collections (titles are our data), "Cancel" (tertiary) and
   * "Confirm" (stateful primary). A card's "Add to collection" opens it
   * directly; the collapsible's "Add to Collection" button toggles it.
   */
  manageCollectionsView:
    '[data-testid="library-sidebar"] .collapsible-body:has(input[name="searchfield-input"])',
  manageCollectionsOption: (collectionKey: string) =>
    `.pgn__selectable_box:has(input[name="selectedCollections"][value="${collectionKey}"])`,
  manageCollectionsConfirm: 'button.pgn__stateful-btn.btn-primary',
  manageAddToCollectionButton:
    '[data-testid="library-sidebar"] [role="tabpanel"] button.btn-primary',

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
  /**
   * The Advanced / Other list that replaces the panel: a "Back to List" tertiary
   * button, then one outline button per advanced block type sorted by display
   * name.
   */
  advancedTypeButton: '[data-testid="library-sidebar"] .pgn__vstack > button.btn-outline-primary',
  /** The component editor dialog the Add Content buttons open (`aria-label="Editor Dialog"`, an xl modal). */
  editorDialog: '[role="dialog"].pgn__modal-xl',
  /** Its Save (primary) and close controls. */
  editorSaveButton:
    '[role="dialog"].pgn__modal-xl .pgn__modal-footer button.btn-primary, [role="dialog"].pgn__modal-xl button.btn-primary:not(.btn-outline-primary)',

  /**
   * A Paragon modal dialog and, scoped *inside* one (`dialog.locator(...)`),
   * its controls: the "name your new …" text field and its submit, and a
   * confirmation's confirm (primary / danger) and cancel (default / tertiary).
   */
  deleteModal: '[role="dialog"]',
  dialogNameInput: 'input.form-control',
  dialogSubmitButton: 'button[type="submit"], .pgn__modal-footer button.btn-primary',
  dialogConfirmButton:
    '.pgn__modal-footer button.btn-primary, .pgn__modal-footer button.btn-danger',
  dialogCancelButton:
    '.pgn__modal-footer button.btn-default, .pgn__modal-footer button.btn-tertiary',

  /** Inline title editor (`ContainerEditableTitle` / card titles): label, pencil, input. */
  inplaceTitleLabel: '.inplace-text-editor-label',
  inplaceTitleEditButton: '.inplace-text-editor-with-edit-input button',
  inplaceTitleInput: '.inplace-text-editor-with-edit-input input',

  /** Create-library form (`/library/create`). */
  createTitleInput: 'form input[name="title"]',
  createOrgInput: 'form input[name="org"][role="combobox"]',
  createOrgOption: (org: string) =>
    `.pgn__form-autosuggest__dropdown [id="${org}"], .pgn__form-autosuggest__dropdown button:has(> :not(:empty))`,
  createSlugInput: 'form input[name="slug"]',
  createSubmitButton: 'form button[type="submit"]',

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

  /** The MFE's toast ("Content pasted successfully." …), which overlays the lower sidebar while shown. */
  toast: '#toast-root .toast.show',
  /** A toast's close control — Paragon's icon button; its `aria-label` is localized, so the class, not the label. */
  toastCloseButton: '#toast-root .toast.show button.btn-icon',
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
/** A library's hidden radio on the picker's first step, relative to its card. */
const libraryRadioInput = (libraryKey: string): string =>
  `input[name="selected-library"][value="${libraryKey}"]`;

export const LIBRARY_PICKER_SELECTORS = {
  modal: '[role="dialog"].pgn__modal-xl',
  /** A library's radio in `SelectLibrary`, by library key. */
  libraryRadio: (libraryKey: string) => `[role="dialog"] ${libraryRadioInput(libraryKey)}`,
  /** The same radio, relative to its card — for filtering {@link libraryCard} by `has`. */
  libraryRadioInput,
  /** The library search field on the first step. */
  librarySearchInput: '[role="dialog"] input[name="searchfield-input"]',
  /** A library's radio card on step one; the radio itself (`libraryRadio`) is visually hidden behind it. */
  libraryCard: '[role="dialog"] .pgn__card',
  /** The embedded library page (second step) and the per-card "Add" button. */
  embeddedPage: '[role="dialog"] .library-authoring-page',
  card: '[role="dialog"] .library-authoring-page .pgn__card',
  cardAddButton: 'button.btn-outline-primary',
  /** In multiple-select mode (inside a library): the footer's primary button adds the selection. */
  footerConfirm: '[role="dialog"] .pgn__modal-footer button.btn-primary',
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
  /** A block's "Edit" action in the iframe header — opens the MFE editor dialog for that block. */
  iframeEditButton: 'button.edit-button',

  /** The preview-changes modal (`PreviewLibraryXBlockChanges`) and its old / new tabs. */
  previewModal: '[role="dialog"].lib-preview-xblock-changes-modal',
  compareTab: (key: 'old' | 'new') => `#preview-version-toggle-tab-${key}`,
  /**
   * Footer, untouched block: "Accept changes" (primary) and "Ignore changes"
   * (tertiary). Footer, block customized in the course: the primary becomes
   * "Keep course content" and the single tertiary is "Update to published
   * library content" (the sync); the modal body then also carries a "has local
   * edits" alert, which is how a caller tells the two footers apart.
   */
  acceptButton:
    '[role="dialog"].lib-preview-xblock-changes-modal .pgn__modal-footer button.btn-primary',
  ignoreButton:
    '[role="dialog"].lib-preview-xblock-changes-modal .pgn__modal-footer button.btn-tertiary:last-child',
  localEditsAlert:
    '[role="dialog"].lib-preview-xblock-changes-modal .pgn__modal-body .alert, [role="dialog"].lib-preview-xblock-changes-modal .pgn__modal-body [role="alert"]',
  customizedSyncButton:
    '[role="dialog"].lib-preview-xblock-changes-modal .pgn__modal-footer button.btn-tertiary',
  keepCourseContentButton:
    '[role="dialog"].lib-preview-xblock-changes-modal .pgn__modal-footer button.btn-primary',
  /** The primary ("Keep course content") confirm in the keep-course-content `AlertModal`; the discard confirm reuses `ignoreConfirmButton` (danger). */
  confirmPrimaryButton: '[role="dialog"].pgn__alert-modal .pgn__modal-footer button.btn-primary',
  /**
   * The "Ignore these changes?" confirmation (`AlertModal variant=warning`) that
   * Ignore opens — from the preview modal and from a Review-tab card alike:
   * "Cancel" (default) then "Ignore" (danger).
   */
  ignoreConfirmModal: '[role="dialog"].pgn__alert-modal',
  ignoreConfirmButton: '[role="dialog"].pgn__alert-modal .pgn__modal-footer button.btn-danger',

  /** The course Libraries page: tabs and the Review tab's item cards. */
  librariesTab: (key: 'all' | 'review') => `#course-library-tabs-tab-${key}`,
  reviewItemCard: '#course-library-tabs-tabpane-review .pgn__card',
  /** Per card: "Review Updates" (outline), "Ignore" (tertiary), "Update" (stateful primary). */
  reviewCardReviewButton: 'button.btn-outline-primary',
  reviewCardIgnoreButton: 'button.btn-tertiary',
  reviewCardUpdateButton: 'button.btn-primary',
} as const;

/**
 * The legacy → v2 migration stepper (`LegacyLibMigrationPage`): select
 * legacy libraries → select a destination → confirm.
 */
export const LEGACY_MIGRATION_SELECTORS = {
  stepperStep: '.pgn__stepper-header-step',
  activeStep: '.pgn__stepper-header-step-active',
  /** The step's search field ("Search legacy libraries"). */
  searchInput: 'input[name="searchfield-input"]',
  /** A destination library's radio on step two, by `lib:` key. */
  destinationRadio: (key: string) => `input[type="radio"][value="${key}"]`,
  /** The step footer: "Cancel" (outline) then "Next" / "Confirm" (primary). */
  footerPrimaryButton: 'button.btn-primary',
  /** A legacy-library row on step one (a `Form.Checkbox` set) and the checkbox inside it. */
  legacyLibraryCard: '[role="group"] > *, .pgn__form-control-set > *',
  legacyLibraryCardCheckbox: 'input[type="checkbox"]',
} as const;
