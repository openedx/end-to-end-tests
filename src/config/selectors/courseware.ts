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
   * Per-unit completion marker in the sidebar and the course-home outline. The
   * icon stands in for the sheet's "green checkmark": colour and shape are not
   * testable semantics, so completion is read from the API and this anchor is only
   * used to prove the UI rendered something for the unit.
   */
  completionIcon: '[data-testid="completion-solid-icon"]',
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
