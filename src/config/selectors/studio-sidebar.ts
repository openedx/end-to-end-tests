/**
 * The Verawood authoring sidebar — the Info / Add / Align / Help rail on the
 * course-outline page and the Info / Add / Align rail on the unit page
 * (`src/generic/sidebar`, `src/course-outline/outline-sidebar`,
 * `src/course-unit/unit-sidebar`). One shared component, so these anchors serve
 * both host pages.
 *
 * Measured live on Tutor `main` (2026-09-16, Epic 11 plan §1.5). Each anchor
 * names the localized string it stands in for, per `selectors/README.md`.
 */

/** The rail page keys, shared with the panel dropdown and the URL param. */
export type SidebarPageKey = 'info' | 'add' | 'align' | 'help';

export const STUDIO_SIDEBAR_SELECTORS = {
  /** The always-present toggle column: the collapse/expand button and the page rail. */
  toggle: '[data-testid="sidebar-toggle"]',

  /**
   * The collapse/expand button at the top of the rail — the only `IconButton`
   * in the toggle column that is not a page button (`aria-label` "Toggle",
   * localized). Toggles {@link sidebarContent} in and out.
   */
  collapseButton: '[data-testid="sidebar-toggle"] > button',

  /**
   * A page's rail button. `IconButtonToggle` renders one per page as
   * `icon-btn-val-<key>`; the active page's button carries
   * `btn-icon-primary-active`. Stands in for the button's localized `aria-label`
   * (Info / Add / Align / Help).
   */
  railButton: (key: SidebarPageKey) => `[data-testid="icon-btn-val-${key}"]`,
  /** Class marking the active rail button. */
  railActiveClass: 'btn-icon-primary-active',

  /** The open sidebar panel; absent when the sidebar is collapsed. */
  sidebarContent: '.sidebar-content',

  /** The panel's page-switcher dropdown (mirrors the rail). */
  pageDropdown: '[data-testid="sidebar-dropdown"]',
  /** The page-switcher toggle button. */
  pageDropdownToggle: '#dropdown-toggle-with-iconbutton',
  /** An open dropdown menu's items (page names). */
  dropdownItem: '.dropdown-menu.show .dropdown-item',

  /** The panel title — the selected item's display name (our data, not localized). */
  title: '.sidebar-content h2',

  /** The resize handle on the panel's left edge; drag it to change the panel width. */
  resizeHandle: '.resizable-handle',

  /**
   * The `SidebarTitle` overflow menu ("Item Menu") shown for a selected item —
   * a medium `IconButton` dropdown toggle in the panel (the Taxonomy kebab is the
   * small one). Its items (duplicate, copy, copy location, move, move up/down,
   * view library, unlink, delete) carry no test ids; the delete item is
   * `.text-danger-700`. Anchored by size class, not its localized `aria-label`.
   */
  itemMenuButton: '.sidebar-content .btn-icon-md.pgn__dropdown-toggle-iconbutton',
  /** The open item menu's entries, in {@link SIDEBAR_ITEM_MENU_ORDER} order. */
  itemMenuItems: '.dropdown-menu.show .dropdown-item',
  /** The delete-confirmation dialog's "Delete" (Paragon danger button). */
  deleteConfirmButton: '[role="dialog"] button.btn-danger',
  /**
   * The back button shown in the panel *title row* when a component is selected
   * on the unit page — the inline-size icon button inside the SidebarTitle's
   * top flex row (the panel body may hold other inline icon buttons, e.g. the
   * visibility edit). Anchored structurally, not by its localized `aria-label`.
   */
  backButton: '.sidebar-content .d-flex.justify-content-between button.btn-icon-inline',

  /**
   * The "Taxonomy Alignments" section's kebab (a small `IconButton` dropdown);
   * its only item, "Manage tags", opens the tag drawer. Anchored as the
   * small-size dropdown toggle in the panel (the Item Menu is medium-size).
   */
  taxonomySectionMenu: '.sidebar-content .btn-icon-sm.pgn__dropdown-toggle-iconbutton',

  /**
   * A panel tab by its non-localized id. The course Info panel uses
   * `course-info-tabs-tab-*`; a section / subsection / unit-in-outline Info panel
   * reuses `add-content-tabs-tab-*`; the unit-page Info panel uses
   * `unit-info-sidebar-tabs-tab-*`. Each `Tabs` renders a stray `…-tab-null`
   * control that is ignored.
   */
  courseInfoTab: (key: 'info' | 'settings') => `#course-info-tabs-tab-${key}`,
  outlineItemInfoTab: (key: 'info' | 'settings') => `#add-content-tabs-tab-${key}`,
  unitInfoTab: (key: 'details' | 'settings') => `#unit-info-sidebar-tabs-tab-${key}`,
  /** The unit-page Add sidebar's tabs. */
  unitAddTab: (key: 'add-new' | 'add-existing') => `#unit-add-sidebar-tab-${key}`,
  /** The outline Add sidebar's tabs. */
  outlineAddTab: (key: 'addNew' | 'addExisting') => `#add-content-tabs-tab-${key}`,
  /**
   * The outline Add sidebar's "Add Existing" pane — what the outline's "Use …
   * from library" buttons open on `main` and `verawood`: the library content of
   * every library the author may reuse from, embedded, with a library filter, a
   * search field and an "Add" per card. (An outline without the authoring
   * sidebar opens the modal library picker instead — `LIBRARY_PICKER_SELECTORS`.)
   */
  addExistingPane: '#add-content-tabs-tabpane-addExisting',
  /** The pane's library filter ("All libraries"): a toggle and one checkbox per library, its `value` the library key. */
  addExistingLibraryFilter: '#library-filter-dropdown-toggle',
  addExistingLibraryOption: (libraryKey: string) =>
    `.dropdown-menu.show input[type="checkbox"][value="${libraryKey}"]`,
  /** The library filter's own name search ("Search Library Name"), inside the open menu. */
  addExistingLibrarySearch: '.dropdown-menu.show input[name="searchfield-input"]',
  /**
   * The content search field. The library filter's own name search is the same
   * Paragon field inside the filter's menu, so this is the one still visible
   * once that menu has closed (no class tells them apart on both releases).
   */
  addExistingSearch: 'input[name="searchfield-input"]:visible',
  /** A content card, and its "Add" (the card header's action button). */
  addExistingCard: '.library-item-card',
  addExistingCardAdd: '.pgn__card-header-actions button',

  /**
   * The outline Info panel's Publish button (the `PublishButon` status button),
   * present only while the selected item has unpublished changes. The unit page's
   * publish control is a different widget ({@link unitPublishButton}).
   */
  publishButton: '.sidebar-content button.status-button',
  /**
   * The outline publish modal's confirm ("Publish") that the Info panel's
   * Publish button opens — the outline's shared publish confirmation, a Paragon
   * primary button in the dialog. The unit page publishes without a confirm.
   */
  publishConfirmButton: '[role="dialog"] button.btn-primary',
  /**
   * The unit page's publish button in the sidebar's publish-controls widget
   * (`.course-unit-sidebar-footer`), present while the unit has unpublished
   * changes. Distinct from the visibility toggle, which is a button group.
   */
  unitPublishButton: '.sidebar-content .course-unit-sidebar-footer button.btn-primary',

  /**
   * One Help-panel topic: the panel renders a heading per topic for the level
   * that is selected. This is the portable Help oracle — whether a topic also
   * carries a documentation link depends on the installation's docs URLs, and a
   * build that has none renders the headings alone (measured on CI `main`,
   * 2026-09-22, where the same panel had links a week earlier).
   */
  helpTopic: '.sidebar-content h3',
  /** A Help-panel documentation link, where the installation configures one. */
  helpLink: '.sidebar-content a[href]',

  /** A dropdown menu item that is not tagged (used to reach an untagged menu action). */
  openDropdownDangerItem: '.dropdown-menu.show .dropdown-item.text-danger-700',
} as const;

/** An action in the sidebar's item menu. */
export type SidebarItemAction = 'duplicate' | 'copy' | 'move' | 'moveUp' | 'moveDown' | 'delete';

/**
 * The item menu's entries, in the order they render, per kind of selected item
 * — the items carry no test id or non-localized attribute, so position is the
 * anchor (measured on `main`, 2026-11-09). An outline section or subsection:
 * Duplicate, Move Up, Move Down, Delete (the moves `aria-disabled` at either
 * end). A unit's component: Duplicate, Copy to Clipboard, Move (to another
 * unit), Delete. Delete is also the menu's only `.text-danger-700` entry.
 */
export const SIDEBAR_ITEM_MENU_ORDER: Readonly<
  Record<'outline' | 'component', readonly SidebarItemAction[]>
> = {
  outline: ['duplicate', 'moveUp', 'moveDown', 'delete'],
  component: ['duplicate', 'copy', 'move', 'delete'],
};
