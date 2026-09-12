/**
 * Custom Pages in the authoring MFE. Reached on the apps origin (Studio does not
 * redirect here), like Pages & Resources, so the page object derives the MFE base.
 *
 * The page cards carry no per-page id in the DOM (the dnd-kit sortable id is a
 * React prop only), and every card shares the same `data-testid`s, so a card is
 * addressed by its index and reordering is driven through its drag handle. The
 * order is asserted against the tabs API / LMS, not the DOM.
 */
export const STUDIO_CUSTOM_PAGES_SELECTORS = {
  /** Always-present header control — marks the page as rendered (and authorized). */
  ready: '[data-testid="header-add-button"]',
  /** One custom-page card's title (one per card; scope by index). */
  cardTitle: '[data-testid="card-title"]',
  /** A card's drag handle — the dnd-kit sortable button (one per card). */
  dragHandle: '[aria-roledescription="sortable"]',
  /** A drag handle mid-lift: dnd-kit's keyboard sensor sets `aria-pressed` on it. */
  liftedHandle: '[aria-roledescription="sortable"][aria-pressed="true"]',
} as const;
