/**
 * The unit (container) page in the authoring MFE (`/container/<vertical>`,
 * redirected to the MFE) — where an author edits a unit's components, sets its
 * visibility, and publishes it.
 *
 * Measured on Tutor `main` (2026-09-11). Several header controls carry no test id
 * and only localized text, so they are anchored structurally (a button's position
 * in a known button group), with the localized label named in the comment.
 */
export const STUDIO_UNIT_PAGE_SELECTORS = {
  /** The unit's title in the header. */
  unitHeaderTitle: '[data-testid="unit-header-title"]',

  /**
   * The header group holding "Preview" and "View live version" (in that order);
   * View live is disabled until the unit is published. A `btn-group-md` that is
   * not the visibility toggle (`btn-group-toggle`).
   */
  previewViewLiveGroup: '.btn-group-md:not(.btn-group-toggle)',

  /**
   * The sequence-navigation action buttons above the unit — "New unit" then
   * "Paste as new unit" (the paste button shows only while the clipboard holds a
   * unit). Neither carries a test id.
   */
  sequenceActionButton: '.sequence-navigation-tabs-action-btn',
  /** The "Previous"/"Next" unit links, present when the unit has a sibling. */
  previousUnitButton: 'a.sequence-navigation-prev-btn',
  nextUnitButton: 'a.sequence-navigation-next-btn',
  /** A sibling-unit tab; its `href` carries the unit's usage key, `title` its name. */
  unitTab: '[data-testid="course-unit-btn"]',

  /** The Info sidebar's Details / Settings tabs (ids are non-localized). */
  sidebarDetailsTab: '#unit-info-sidebar-tabs-tab-details',
  sidebarSettingsTab: '#unit-info-sidebar-tabs-tab-settings',
  /**
   * The visibility toggle on the Settings tab — "Student Visible" then "Staff
   * Only" (in that order). Clicking a choice republishes the unit with the new
   * `visible_to_staff_only`.
   */
  visibilityToggleGroup: '.btn-group-toggle',
  /** The content-group restriction select on the Settings tab. */
  groupTypeSelect: '[data-testid="group-type-select"]',
  /** The "Enable discussion" checkbox on the Settings tab. */
  discussionCheckbox: '.pgn__form-checkbox-input',

  /** The sidebar Publish button (shown while the unit has unpublished changes). */
  publishButton: '.course-unit-sidebar-visibility button.btn-primary',

  /**
   * The sidebar "Item Menu" (3-dot) and its items: "Copy to Clipboard", "Copy
   * Location ID", "Delete". None carries a test id; Copy to Clipboard is the
   * first item, Delete the danger-styled one.
   */
  itemMenuButton: 'button[aria-label="Item Menu"]',
  itemMenuCopyItem: '.dropdown-menu.show .pgn__dropdown-item:not(.text-danger-700)',
  itemMenuDeleteItem: '.dropdown-menu.show .pgn__dropdown-item.text-danger-700',

  /** The one iframe the unit renders its components into (the legacy container view). */
  componentIframe: 'iframe.xblock-container-iframe',
  /** The "Add component" tiles, one per offered block type, in API order. */
  addComponentButton: 'button.add-component-button',
  /**
   * The "Paste Component" button, shown in the add-component area while the
   * clipboard holds a component. No test id; anchored by its class alongside the
   * add-component tiles.
   */
  pasteComponentButton: 'button.btn-block',
} as const;
