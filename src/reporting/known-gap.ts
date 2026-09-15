/**
 * The annotation `type` that records **why** a test is held back.
 *
 * A declarative `test.fixme(title, …)` carries no reason Playwright can report,
 * so the BTR results sheet would show the case as skipped with nothing to say
 * why. Pairing the `fixme` with `knownGap('…')` puts the reason in the report,
 * next to the `issue` link when there is one.
 */
export const KNOWN_GAP_ANNOTATION_TYPE = 'known_gap';

/** Shape of the `known_gap` annotation attached to a test's options. */
export interface KnownGapAnnotation {
  readonly type: typeof KNOWN_GAP_ANNOTATION_TYPE;
  readonly description: string;
}

/**
 * Builds a `known_gap` annotation for a held-back test's options:
 *
 * ```ts
 * test.fixme('completes every unit', {
 *   annotation: [testId('TC-00022'), knownGap('Demo course has no drivable completion path for video/ORA/LTI units')],
 * }, …)
 * ```
 *
 * @throws {Error} when the reason is blank, so a placeholder never ships.
 */
export function knownGap(reason: string): KnownGapAnnotation {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new Error('knownGap() needs a non-empty reason.');
  }
  return { type: KNOWN_GAP_ANNOTATION_TYPE, description: trimmed };
}
