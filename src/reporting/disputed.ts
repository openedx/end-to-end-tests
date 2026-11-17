/**
 * The annotation `type` that records that a test asserts the **platform's**
 * behaviour where the BTR case says otherwise, and that the platform is believed
 * right: the case's wording is out of date, or describes a design that was never
 * shipped.
 *
 * Such a test passes, and a passing test's note is otherwise empty, so the
 * results sheet would show the case as verified as if the sheet's own words had
 * been. `disputed('…')` puts the disagreement in the note instead, next to the
 * `issue` link when there is one. A defect — the sheet is right and a fix is
 * expected — is not a dispute: write the sheet's expectation and mark it
 * `test.fail` (CONVENTIONS.md, "When the sheet and the platform disagree").
 */
export const DISPUTED_ANNOTATION_TYPE = 'sheet_dispute';

/** Shape of the `sheet_dispute` annotation attached to a test's options. */
export interface DisputedAnnotation {
  readonly type: typeof DISPUTED_ANNOTATION_TYPE;
  readonly description: string;
}

/**
 * Builds a `sheet_dispute` annotation for a test that asserts the platform's
 * behaviour against the BTR case's wording. Say what the platform does and what
 * the sheet should say:
 *
 * ```ts
 * test('refuses a mixed batch before writing anything', {
 *   annotation: [
 *     testId('TC-00453'),
 *     disputed('The console validates the batch before writing; the sheet should describe a refused batch, not a summary toast'),
 *   ],
 * }, …)
 * ```
 *
 * @throws {Error} when the reason is blank, so a placeholder never ships.
 */
export function disputed(reason: string): DisputedAnnotation {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new Error('disputed() needs a non-empty reason.');
  }
  return { type: DISPUTED_ANNOTATION_TYPE, description: trimmed };
}
