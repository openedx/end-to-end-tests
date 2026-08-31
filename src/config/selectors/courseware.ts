/**
 * Courseware (`frontend-app-learning`): the unit view and its outline sidebar.
 *
 * Each anchor names the localized string it stands in for, per
 * `src/config/selectors/README.md`.
 */
export const COURSEWARE_SELECTORS = {
  /** The one iframe a unit renders its blocks into. */
  unitIframe: 'iframe#unit-iframe',

  /** The course outline tray beside the unit. */
  sidebar: '.outline-sidebar',

  /** Show/hide control for the outline tray. */
  sidebarToggle: '.outline-sidebar-toggle-btn',

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
