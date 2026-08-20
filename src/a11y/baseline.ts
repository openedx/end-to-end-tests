/**
 * Known-debt accessibility baseline.
 *
 * Rule IDs listed here are **reported but do not fail** the run — pre-existing
 * violations we have chosen to track rather than block on. This differs
 * deliberately from suppressing a rule entirely (e.g. axe's `disableRules` or the
 * WGU suite's `disabledRules`): a baselined rule is still executed, its
 * violations are still attached to the report, and any *new* screen that trips it
 * is still visible — we simply do not fail the gate for it yet.
 *
 * Keep this list short and each entry justified. Remove an entry once the
 * underlying debt is fixed; new code should not be added to it.
 */
export const A11Y_BASELINE: ReadonlySet<string> = new Set<string>([
  // Pre-existing on the authn MFE (`frontend-app-authn`) with the default
  // "My Open edX" theme: low-contrast text/links on the login and register
  // screens. Upstream theming debt, not something this suite can fix; still
  // reported and attached so it stays visible. Remove once the MFE/theme meets
  // the 4.5:1 ratio.
  'color-contrast',
]);
