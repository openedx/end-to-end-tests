/**
 * Aspects' in-context metrics in the authoring MFE (frontend-plugin-aspects
 * 3.0.1): an "Analytics" page of the authoring sidebar on the course outline and
 * the unit page, and an Analytics button on the outline's graded-subsection and
 * unit cards. Section headings ("Graded Subsection Analytics", "Problem
 * Analytics", "Video Analytics"), the empty-state message and every button label
 * are localized; list items show the elements' own display names. The plugin
 * marks only the panel and its title with test ids (`ASPECTS-001`), so the
 * lists, their items and toggles and the card button are anchored on Paragon's
 * classes inside the panel, and a restyle of the plugin would break them.
 *
 * Measured on Tutor `main` with tutor-contrib-aspects 5.0.0 (2026-09-29).
 */
export const STUDIO_ANALYTICS_SELECTORS = {
  /** The sidebar rail's Analytics button (`IconButtonToggle` value `analytics`). */
  railButton: '[data-testid="icon-btn-val-analytics"]',
  /** The Analytics page's panel. */
  panel: '[data-testid="sidebar"]',
  /** Its title: the course's, unit's or element's display name. */
  title: '[data-testid="sidebar-title"] h2',
  /** The back control shown in the title after drilling into an element ("Back"). */
  backButton: '[data-testid="sidebar-title"] button',
  /** The embedded in-context dashboard. */
  embedFrame: '.aspects-sidebar-embed-container iframe',
  /**
   * The element lists, in order (outline: graded subsections, problems, videos;
   * unit page: the unit's problems and videos in one list).
   */
  list: '[data-testid="sidebar"] .rounded-bottom',
  /** An element in a list: a button showing the element's display name. */
  listItem: 'button.btn-inline',
  /** A list's "Show more" / "Show less" toggle, past five elements. */
  showMore: 'button.btn-tertiary',
  /** "No analytics available for …": the panel of a unit with no problem or video. */
  emptyState: '[data-testid="sidebar"] [role="alert"]',
  /**
   * An outline card's Analytics button: the one medium icon button in the card
   * header without a test id ("Analytics"; the others are Rename and the menu).
   */
  cardButton: 'button.btn-icon-md:not([data-testid])',
} as const;

/** An outline card's header by level (`subsection-card-header`, `unit-card-header`). */
export function outlineCardHeader(level: 'subsection' | 'unit'): string {
  return `[data-testid="${level}-card-header"]`;
}
