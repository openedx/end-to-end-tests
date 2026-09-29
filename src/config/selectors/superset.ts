/**
 * Apache Superset's dashboard markup (6.1.0, as Aspects 5.0.0 ships it), inside
 * the Reports tab's embed or on Superset's own dashboard pages. Superset marks
 * its components with `data-test` attributes and its layout with the ids of the
 * dashboard's asset file; chart titles and tab labels are translated, so neither
 * is an anchor.
 */
export const SUPERSET_SELECTORS = {
  /** A rendered chart; the attribute's value is Superset's numeric chart id on this install. */
  chartHolder: '[data-test-chart-id]',
} as const;

/**
 * A dashboard tab by its layout id (`TAB-…` in the dashboard's asset file).
 * Superset renders it as `TABS-<parent>-tab-<TAB id>`, fixed by the asset.
 */
export function supersetDashboardTab(tabId: string): string {
  return `[role="tab"][id$="-tab-${tabId}"]`;
}
