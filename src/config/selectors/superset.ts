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
  /**
   * The login page's "Sign in with Open edX" provider link: Aspects registers
   * the LMS as Superset's OAuth provider `openedxsso`.
   */
  ssoProviderLink: 'a[href*="/login/openedxsso"]',
  /**
   * The LMS's OAuth consent form ("Authorize"), shown on a user's first sign-in
   * because the `superset-sso` application does not skip authorization: the
   * django-oauth-toolkit form and its `allow` submit.
   */
  lmsOAuthAllow: 'form#authorizationForm button[name="allow"]',
  /** The filter bar's "Apply filters". */
  filterApply: '[data-test="filter-bar__apply-button"]',
  /** A select filter's own clear control (shown on hover once it holds a value). */
  selectClear: '.ant-select-clear',
  /** The collapsed filter bar's expand control (embedded dashboards start collapsed). */
  filterBarExpand: '[data-test="filter-bar__expand-button"]',
  /** The open dropdown of a select filter (antd renders it apart from the control). */
  openSelectDropdown: '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
} as const;

/** A native filter's control, by filter id (`NATIVE_FILTER-…`). */
export function supersetNativeFilter(filterId: string): string {
  return `[data-test="${filterId}"]`;
}

/** An option of an open select filter, by its value (the test's own data, like a course name). */
export function supersetSelectOption(value: string): string {
  return `.ant-select-item-option[title="${value.replace(/"/g, '\\"')}"]`;
}

/**
 * A dashboard tab by its layout id (`TAB-…` in the dashboard's asset file).
 * Superset renders it as `TABS-<parent>-tab-<TAB id>`, fixed by the asset.
 */
export function supersetDashboardTab(tabId: string): string {
  return `[role="tab"][id$="-tab-${tabId}"]`;
}
