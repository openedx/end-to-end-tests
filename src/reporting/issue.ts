/**
 * The annotation `type` that links a spec to an upstream issue.
 *
 * Used where a test documents a defect the platform has not fixed yet: the
 * annotation puts a clickable link in the report next to a `test.fixme`, so a
 * reader can tell "this coverage is waiting on upstream" apart from "this test is
 * disabled and nobody knows why".
 */
export const ISSUE_ANNOTATION_TYPE = 'issue';

/** Shape of the `issue` annotation attached to a test's options. */
export interface IssueAnnotation {
  readonly type: typeof ISSUE_ANNOTATION_TYPE;
  readonly description: string;
}

/**
 * Builds an `issue` annotation for a test's options, alongside its `test_id`:
 *
 * ```ts
 * test('…', {
 *   tag: '@regression',
 *   annotation: [testId('TC-00016'), issue('https://github.com/openedx/…/issues/160')],
 * }, …)
 * ```
 *
 * @throws {Error} when the value is not an absolute `https` URL, so a bare issue
 * number or a typo fails at load time rather than producing an unusable link.
 */
export function issue(url: string): IssueAnnotation {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid issue link "${url}"; expected an absolute https URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Invalid issue link "${url}"; expected an absolute https URL.`);
  }
  return { type: ISSUE_ANNOTATION_TYPE, description: url };
}
