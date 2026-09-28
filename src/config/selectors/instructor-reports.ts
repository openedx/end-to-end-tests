/**
 * Aspects' Reports tab inside the instructor dashboard MFE
 * (frontend-app-aspects, `ReportsDashboard`), at
 * `/instructor-dashboard/<course key>/aspects`. The app ships no test ids, and
 * its heading, link text and dashboard names are localized, so the anchors are
 * its structural classes and the dashboard uuids the platform hands out.
 *
 * Measured on Tutor `main` with tutor-contrib-aspects 5.0.0 (2026-09-27).
 */
export const INSTRUCTOR_REPORTS_SELECTORS = {
  /** The tab's content wrapper (holds the "Reports" heading, the link and the tabs). */
  wrapper: 'div.aspects-wrapper',
  /** "View dashboards in Superset": its `href` is the platform's `superset_url`. */
  supersetLink: 'div.aspects-wrapper a.aspects-superset-link',
  /**
   * The dashboard tabs (Paragon `Tabs`), one per configured dashboard, each keyed
   * by the dashboard's localized uuid. Paragon adds a hidden "more" tab with no
   * key, which the attribute leaves out.
   */
  dashboardTabs: 'div.aspects-wrapper a[role="tab"][data-rb-event-key]',
  /** The embedded Superset dashboard (`@superset-ui/embedded-sdk`), lazily per tab. */
  embedFrame: 'div.aspects-wrapper .superset-embedded-container iframe',
  /** The embed's container, excluded from the dashboard's own a11y scan. */
  embedContainer: 'div.aspects-wrapper .superset-embedded-container',
} as const;

/** The tab of the dashboard whose (localized) uuid is `uuid`. */
export function reportsDashboardTab(uuid: string): string {
  return `div.aspects-wrapper a[role="tab"][data-rb-event-key="${uuid}"]`;
}
