/**
 * Serious accessibility debt in the frontend-base shell's own chrome, reported
 * but not failed on the chrome specs' scans:
 *
 * - `button-name` — the narrow layout's menu toggle has no accessible name
 *   (`BASE-003`).
 */
export const SHELL_CHROME_A11Y_BASELINE: readonly string[] = ['button-name'];
