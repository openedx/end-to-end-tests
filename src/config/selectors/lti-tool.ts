/**
 * The suite's own LTI 1.3 test tool (`scripts/lti-tool/tool.mts`): the pages it
 * serves in the browser. The suite writes this markup, so its `data-` hooks and
 * `name`/`value` pairs are anchors of its own, not platform copy.
 */
export const LTI_TOOL_SELECTORS = {
  /** The deep-linking picker a deep-linking launch lands on. */
  picker: 'main[data-lti-tool="picker"]',
  /** One of the picker's resources, by its key (`a`, `b`). */
  choice: (key: string) => `button[name="choice"][value="${key}"]`,
} as const;
