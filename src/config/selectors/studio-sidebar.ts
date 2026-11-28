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
   * `course-info-tabs-tab-*`; a section / subsection Info panel reuses
   * `add-content-tabs-tab-*`; a unit selected in the outline has its own
   * `unit-content-tabs-tab-*` (with a Preview tab before Details); the
   * unit-page Info panel uses `unit-info-sidebar-tabs-tab-*`. Each `Tabs` renders a stray `…-tab-null`
   * control that is ignored.
   */
  courseInfoTab: (key: 'info' | 'settings') => `#course-info-tabs-tab-${key}`,
  outlineItemInfoTab: (key: 'info' | 'settings') => `#add-content-tabs-tab-${key}`,
  outlineUnitInfoTab: (key: 'preview' | 'info' | 'settings') => `#unit-content-tabs-tab-${key}`,
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

  /**
   * The wrapper the resize handle sizes: its inline `width` is the panel's
   * width, between a minimum the handle cannot be dragged under and whatever
   * the outline leaves. Absent below the breakpoint at which the panel stacks
   * above the outline (no handle there either). The panel is its child on
   * `main`; `verawood` puts one more wrapper between them.
   */
  resizable: '.resizable:has(.sidebar-content)',

  /**
   * A count chip in the Details tab's "… Content Summary": one per block
   * category the selected item contains (`chapter` = sections, `sequential` =
   * subsections, `vertical` = units, then a chip per component type), each with
   * its number. The chip's class names the category; its label is an icon.
   */
  contentSummaryCount: (category: string) =>
    `.sidebar-content .tab-pane.active .component-style-${category} .x-small`,
  /**
   * A tag listed under the Details tab's "Taxonomy Alignments": one chip per
   * applied tag, grouped under its taxonomy's name. The chip's label is the tag's
   * value (the test's own data).
   */
  appliedTagChip: '.sidebar-content .tab-pane.active .tag-snippet-chip .pgn__chip__label',
  /**
   * A link on the course Info panel's Settings tab ("Schedule & details",
   * "Grading", "Course team", "Group configurations", "Advanced settings" and,
   * where proctoring is configured, "Proctored exam settings").
   */
  settingsLink: '.sidebar-content .tab-pane.active .sidebar-link a',
  /**
   * The Settings tab's date fields on a subsection: the release date, then (in
   * the grading section) the due date. Both render with the same `name`, so
   * position tells them apart. The value is `MM/DD/YYYY`, the picker's fixed
   * format (also its placeholder), not a localized date.
   */
  settingsDateInput: '.sidebar-content .tab-pane.active input[name="state-date"]',
  /**
   * The Settings tab's two-way toggles ("Student Visible" / "Staff Only" and the
   * like), each a button group whose chosen option is the `.btn-primary` one. A
   * subsection lists grading, visibility, results visibility and special exam,
   * in that order; a unit lists visibility alone.
   */
  settingsToggleGroup: '.sidebar-content .tab-pane.active .btn-group-toggle',
  settingsToggleChosenClass: 'btn-primary',
  /** The unit's rendering in the outline panel's Preview tab (Studio's `container_embed` view). */
  outlineUnitPreviewFrame: '#unit-content-tabs-tabpane-preview iframe.xblock-container-iframe',
  /** A block rendered inside that preview (its student view), by its usage key. */
  previewBlock: (usageKey: string) => `.xblock-student_view[data-usage-id="${usageKey}"]`,
  /**
   * An "Add New" button on the outline's Add sidebar ("Section", "Subsection",
   * "Unit"), by the class of the icon it carries.
   */
  outlineAddNewButton: (kind: 'section' | 'subsection' | 'unit') =>
    `#add-content-tabs-tabpane-addNew button:has(.icon-with-border-${kind})`,

  /**
   * A component type on the unit page's Add sidebar, "Add New" tab, by the class
   * of its icon: `html` ("Text"), `video`, `problem`, `itembank` ("Problem
   * Bank"), `drag-and-drop-v2`, `openassessment` ("Open Response") and
   * `advanced`. Text, Problem and Open Response are collapsibles that expand to
   * a row of template chips; the others are buttons that add the block (or, for
   * Advanced, list the course's advanced modules).
   */
  unitAddNewType: (type: string) =>
    `#unit-add-sidebar-tabpane-add-new :is(button, .collapsible-trigger):has(.icon-with-border-${type})`,
  /** The template chips an expanded Text / Problem / Open Response type offers (the first is the plain one). */
  unitAddNewTemplate: (type: 'html' | 'problem' | 'openassessment') =>
    `[data-testid="${type}-collapsible"] .collapsible-body .pgn__chip[role="button"]`,

  /**
   * The component menu's "Move" dialog: a drill-down through the course's
   * sections, subsections and units (each a button carrying the item's own
   * name), and a "Move" that enables once a unit other than the current one is
   * open.
   */
  moveDialog: '.move-xblock-modal',
  moveDialogItem: '.move-xblock-modal .xblock-item button',
  moveDialogConfirm: '.move-xblock-modal .pgn__modal-footer button.btn-primary',

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
