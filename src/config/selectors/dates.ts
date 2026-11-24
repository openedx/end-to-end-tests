/**
 * Course Dates tab (`frontend-app-learning`) — the timeline headed "Important
 * dates".
 *
 * Which dates a learner has is asserted from `/api/course_home/dates/{key}`;
 * these anchors exist to prove the tab rendered them.
 */
export const DATES_SELECTORS = {
  /**
   * One day of the timeline: its date ("Mon, Nov 30, 2026"), an optional badge
   * ("Today", "Completed", "Past due", "Due next") and that day's entries.
   * "Today" always has a day of its own, with or without entries.
   */
  day: 'li.dates-day',
  /**
   * A status badge within a day. A day can carry several — one beside its date
   * and one per entry whose state differs from the day's — and which is which
   * can only be read from the localized label.
   */
  dayBadge: '.badge',
} as const;

/**
 * An assignment's entry within a day of the timeline — the subsection's name,
 * linked to the subsection — anchored by the usage key its `jump_to` link ends
 * in. Scope it inside a day.
 */
export function datesAssignmentLink(subsectionUsageKey: string): string {
  return `a[href$="/jump_to/${subsectionUsageKey}"]`;
}

/** The Dates tab in the course's tab bar, by the route it links to. */
export function datesTabLink(courseKey: string): string {
  return `#courseTabsNavigation a.nav-link[href$="/course/${courseKey}/dates"]`;
}
