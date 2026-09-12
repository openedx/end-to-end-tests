/**
 * The authoring MFE's course shell — the header every course-scoped page shares
 * — and the course outline it lands on after creation.
 *
 * Measured on Tutor `main` (2026-09-08); the same MFE serves `redwood`.
 */
export const STUDIO_SHELL_SELECTORS = {
  /** Header lock-up linking back to the course outline; `href` carries the key. */
  courseLockUp: '[data-testid="course-lock-up-block"]',
  /** "ORG NUMBER" text in the lock-up. */
  courseOrgNumber: '[data-testid="course-org-number"]',
  /** Course display name in the lock-up. */
  courseTitle: '[data-testid="course-title"]',
  /** Header navigation: the "Content", "Settings" and "Tools" menus. */
  contentMenu: '#Content-dropdown-menu',
  settingsMenu: '#Settings-dropdown-menu',
  toolsMenu: '#Tools-dropdown-menu',
} as const;

export const STUDIO_OUTLINE_SELECTORS = {
  /** "You haven't added any content to this course yet." — an empty outline. */
  emptyPlaceholder: '[data-testid="empty-placeholder"]',
  /** The outline header's "View live" link into the LMS (`/jump_to/`). */
  viewLiveLink: 'a[href*="/jump_to/"]',
} as const;
