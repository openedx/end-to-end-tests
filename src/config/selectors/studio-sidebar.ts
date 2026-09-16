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
  /**
   * The back button shown in the panel title when a component is selected on the
   * unit page — the only inline-size icon button in the panel. Anchored
   * structurally, not by its localized `aria-label`.
   */
  backButton: '.sidebar-content button.btn-icon-inline',

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
   * The outline Info panel's Publish button (the `PublishButon` status button),
   * present only while the selected item has unpublished changes. The unit page's
   * publish control is a different widget ({@link unitPublishButton}).
   */
  publishButton: '.sidebar-content button.status-button',
  /**
   * The unit page's publish button in the sidebar's publish-controls widget
   * (`.course-unit-sidebar-footer`), present while the unit has unpublished
   * changes. Distinct from the visibility toggle, which is a button group.
   */
  unitPublishButton: '.sidebar-content .course-unit-sidebar-footer button.btn-primary',

  /** Help-panel links (documentation `href`s — not localized), the Help content oracle. */
  helpLink: '.sidebar-content a[href]',

  /** A dropdown menu item that is not tagged (used to reach an untagged menu action). */
  openDropdownDangerItem: '.dropdown-menu.show .dropdown-item.text-danger-700',
} as const;
