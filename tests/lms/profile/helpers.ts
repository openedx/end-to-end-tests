/**
 * Serious accessibility debt on the profile page, reported but not failed on
 * the profile scans:
 *
 * - `button-name` — at phone width the photo menu's icon button and each
 *   section's edit button have no accessible name (`PROF-004`).
 */
export const PROFILE_A11Y_BASELINE: readonly string[] = ['button-name'];
