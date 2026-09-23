/**
 * Known accessibility debt of the Verawood authoring sidebar, tolerated on the
 * sidebar scans **only** (merged via `checkA11y`'s `additionalBaseline`), never
 * added to the global baseline. Measured on Tutor `main` (2026-09-16).
 *
 * `AUTH-001`: with the sidebar open the outline / unit page carries two critical
 * axe violations the suite does not otherwise see — icon-only buttons whose
 * accessible name axe cannot resolve (`button-name`) and controls carrying an
 * unsupported ARIA attribute (`aria-allowed-attr`). Platform MFE markup, not the
 * suite's. Recorded in `docs/findings.md`; drop an entry the day the MFE
 * fixes it.
 */
export const SIDEBAR_A11Y_BASELINE: readonly string[] = ['button-name', 'aria-allowed-attr'];
