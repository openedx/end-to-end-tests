/**
 * Courseware (`frontend-app-learning`): the unit view and its outline sidebar.
 *
 * Each anchor names the localized string it stands in for, per
 * `src/config/selectors/README.md`.
 */
export const COURSEWARE_SELECTORS = {
  /** The one iframe a unit renders its blocks into. */
  unitIframe: 'iframe#unit-iframe',

  /**
   * "Bookmark this page" / "Bookmarked" under the unit title — a Paragon
   * stateful button whose state class, not its label, says which it is.
   */
  bookmarkButton: '.unit button.pgn__stateful-btn',
  bookmarkedState: 'pgn__stateful-btn-state-bookmarked',

  /** The course outline tray beside the unit. */
  sidebar: '.outline-sidebar',

  /**
   * The tray's back button in its section view — the current section's name
   * with a left chevron; it switches the tray to the course outline view.
   */
  sidebarBackButton: '.outline-sidebar button.outline-sidebar-heading',

  /** The course outline view's heading — "Course outline". */
  sidebarOutlineHeading: '.outline-sidebar span.outline-sidebar-heading',

  /** A section in the course outline view (a button that opens its section view). */
  sidebarSectionRow: '#outline-sidebar-outline > li.course-sidebar-section > button',

  /** A subsection in the section view: a collapsible whose trigger carries `aria-expanded`. */
  sidebarSubsectionItem: '#outline-sidebar-outline > li:not(.course-sidebar-section)',

  /** The tray's collapse control, inside the open tray. */
  sidebarCollapse: '.outline-sidebar .outline-sidebar-toggle-btn',

  /**
   * The control that re-opens a collapsed tray: beside the unit on a desktop,
   * in the breadcrumb row on a phone. Both carry "Toggle course outline tray".
   */
  sidebarExpand: '.outline-sidebar-heading-wrapper.collapsed .outline-sidebar-toggle-btn',

  /** The tray in its full-screen form, below the `xl` breakpoint. */
  sidebarFullScreen: '.outline-sidebar-wrapper.fixed-top',

  /** The unit navigation's "Next" control (a button above the unit, a link below). */
  nextUnit: '.next-button',

  /**
   * The outline tray's own collapse/expand control — "Toggle course outline
   * tray".
   */
  outlineToggle: '.outline-sidebar-toggle-btn',

  /**
   * A right-hand sidebar trigger beside the unit — "Show discussions tray" (and,
   * for an upgradeable enrollment, "Show upgrade panel"). A free enrollment on a
   * unit with an in-context discussion topic shows exactly one: the discussions
   * trigger. The learning MFE keeps one sidebar open at a time (a single
   * `currentSidebar` state), which is TC-00053's premise.
   */
  rightSidebarTrigger: '.sidebar-trigger-btn',

  /** A right-hand trigger whose sidebar is open (its wrapper gains `sidebar-active`). */
  activeRightSidebarTrigger: '.sidebar-active .sidebar-trigger-btn',

  /**
   * The open discussions sidebar: an iframe of the discussions MFE's in-context
   * view (`/discussions/<course>/category/<unit>?inContextSidebar`).
   */
  discussionsSidebar: '.discussions-sidebar-frame',

  /**
   * Subsection completion markers in the outline tray. The three states are
   * **different test IDs**, not one element with a changed class:
   *
   * - nothing complete → `completion-solid-icon` (outline circle, `text-gray-300`)
   * - some units complete → `dashed-circle-icon`
   * - every unit complete → `check-circle-icon` (`text-success`)
   *
   * These stand in for the sheet's "green checkmark". Completion itself is read
   * from the API; these anchors only prove the UI rendered the right state, and
   * because each state has its own test ID, no assertion on colour is needed.
   *
   * **Unit rows are different**: a unit's own marker is a bare `svg` with no test
   * ID, distinguished only by `text-gray-300` → `text-success`. That is colour
   * alone, which ADR-0002 rules out as an assertion, so unit-level state is read
   * from the API and, in the UI, from its subsection's icon moving to
   * `dashed-circle-icon`.
   */
  incompleteIcon: '[data-testid="completion-solid-icon"]',
  partiallyCompleteIcon: '[data-testid="dashed-circle-icon"]',
  completedIcon: '[data-testid="check-circle-icon"]',

  /** A subsection row in the outline tray, and the control that expands it. */
  subsectionRow: 'li',
  subsectionTrigger: '.collapsible-trigger',

  /**
   * The video XBlock's player root inside a video block. Server-rendered class
   * markup, as with CAPA (`src/config/selectors/capa.ts`): the block renders no
   * test ID, and this element carries the `data-metadata` JSON the player itself
   * is initialised from (`completionPercentage`, `sources`, `publishCompletionUrl`).
   */
  videoPlayer: '.video',
  /**
   * The HTML5 `<video>` element the player drives when the block has an HTML5
   * source. A YouTube-only block renders a cross-origin iframe here instead, so
   * this element's absence is what "not drivable" looks like in the DOM.
   */
  videoElement: 'video',
} as const;

/**
 * A block inside the unit iframe, anchored by its usage ID. Every ID is known
 * from the Blocks API, so unit content never has to be found by its display name.
 */
export function coursewareBlock(blockId: string): string {
  return `[data-usage-id="${blockId}"]`;
}

/**
 * The sidebar link to one unit, anchored by the unit's block ID.
 *
 * Note there is deliberately no "active unit" anchor: this platform version marks
 * the current unit visually only (no `aria-current`, no selected-state class), so
 * there is nothing non-localized to assert.
 */
export function sidebarUnitLink(unitId: string): string {
  return `${COURSEWARE_SELECTORS.sidebar} a[href*="${unitId}"]`;
}

/**
 * The subsection row in the tray that contains a given unit, anchored by that
 * unit's link rather than by the subsection's display name.
 *
 * Only an expanded subsection renders its unit links, which is what makes this
 * work for the subsection currently being worked through.
 */
export function sidebarSubsectionRowFor(unitId: string): string {
  return `${COURSEWARE_SELECTORS.sidebar} ${COURSEWARE_SELECTORS.subsectionRow}:has(a[href*="${unitId}"])`;
}
