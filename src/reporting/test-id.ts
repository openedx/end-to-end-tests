/**
 * The annotation `type` that links a spec to a BTR Release Test Plan case. The
 * case ID (e.g. `TC-00002`) goes in the annotation `description`, never inferred
 * from the test title, so the coverage reporter can map outcomes back to the
 * release sheet.
 */
export const TEST_ID_ANNOTATION_TYPE = 'test_id';

/** Shape of the `test_id` annotation attached to a test's options. */
export interface TestIdAnnotation {
  readonly type: typeof TEST_ID_ANNOTATION_TYPE;
  readonly description: string;
}

/** BTR case IDs are `TC-` followed by digits, e.g. `TC-00002`. */
const TEST_ID_PATTERN = /^TC-\d{4,}$/;

/**
 * Builds a `test_id` annotation for a BTR case, for use in a test's options:
 *
 * ```ts
 * test('sign in with valid credentials', { annotation: testId('TC-00003') }, ...)
 * ```
 *
 * @throws {Error} when the ID is not a well-formed `TC-` case ID, catching typos
 * at load time rather than silently under-reporting coverage.
 */
export function testId(id: string): TestIdAnnotation {
  if (!TEST_ID_PATTERN.test(id)) {
    throw new Error(`Invalid BTR test_id "${id}"; expected the form "TC-00003".`);
  }
  return { type: TEST_ID_ANNOTATION_TYPE, description: id };
}

/**
 * Extracts the BTR case IDs from a test's annotations. A test may map to more
 * than one case, so this returns all matching `test_id` descriptions.
 */
export function testIdsFromAnnotations(
  annotations: ReadonlyArray<{ type: string; description?: string }>,
): string[] {
  return annotations
    .filter((annotation) => annotation.type === TEST_ID_ANNOTATION_TYPE)
    .map((annotation) => annotation.description)
    .filter((description): description is string => typeof description === 'string');
}
