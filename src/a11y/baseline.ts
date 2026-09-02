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
  // `BASE-001`: the frontend-base shell's brand link — in the header and again in
  // the footer — wraps the site logo in an `<a>` with no `alt` and no other
  // content, so every page served in that shell trips both of these. It is shared
  // chrome rather than any one screen's markup (seen on the catalog and on the
  // authenticated learner dashboard alike), which is why it is baselined here
  // instead of tolerated screen by screen.
  //
  // The cost is real and deliberate: `image-alt` is *critical*, so baselining it
  // means a genuinely new unlabelled image elsewhere is reported but does not fail
  // the gate. Both entries come straight back out once the shell labels its brand
  // link — the fixme in `tests/lms/catalog/discovery.spec.ts` starts passing at
  // that point and is the signal to remove them.
  'image-alt',
  'link-name',
]);
