/**
 * Every forum spec runs in the `studio-author` project on the worker's
 * `contentCourse`: the author is the course instructor (who grants forum
 * roles), learners post on their own contexts. Gated on `discussions` (default
 * on; an install without the forum opts out) and on `studio`, which the worker
 * author needs.
 */
export const DISCUSSION_TAGS: string[] = ['@studio', '@author', '@discussions'];

/**
 * Accessibility debt the discussions MFE carries on `main`, reported on every
 * run but not failed until the MFE fixes it:
 *
 * - `aria-required-children` and `aria-required-parent` (critical, `DISC-001`):
 *   the post list is a `role="list"` whose rows are `role="option"` links, so
 *   the list has no list items and each option has no listbox.
 */
export const DISCUSSIONS_A11Y_BASELINE = [
  'aria-required-children',
  'aria-required-parent',
] as const;
