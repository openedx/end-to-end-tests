/**
 * Advanced components (legacy XBlocks) as they render for a learner, inside the
 * unit's content iframe and scoped to the block's `[data-usage-id]` wrapper.
 *
 * Like CAPA (`capa.ts`), these blocks ship no test ids and no useful roles: the
 * anchors are the server-rendered classes each block's own template and scripts
 * key off, named here with the package and template they come from. Measured on
 * Tutor `main` (2026-09-24).
 */
export const ADVANCED_BLOCK_SELECTORS = {
  /** xblocks-contrib `annotatable`: one highlighted span per `<annotation>`. */
  annotatableSpan: 'span.annotatable-span',
  /** xblock-poll `poll`: one radio per answer, its `value` the answer key. */
  pollAnswer: (key: string) => `input[type="radio"][name="choice"][value="${key}"]`,
  /** xblock-poll `survey`: one radio per question (its `name`) and answer key. */
  surveyAnswer: (question: string, answer: string) =>
    `input[type="radio"][name="${question}"][value="${answer}"]`,
  /** xblock-poll: the poll's and the survey's "Submit" (disabled until answered). */
  pollSubmit: 'button.submit',
  /** xblocks-contrib `word_cloud`: the word inputs and "Save". */
  wordCloudInput: 'input.input-cloud',
  wordCloudSave: 'button.save',
  /**
   * done-xblock: the "Mark as complete" on/off switch — a hidden checkbox whose
   * label is what a learner clicks.
   */
  doneSwitch: 'label.done_onoffswitch-label',
  /** Google calendar and document embeds: the iframe the block renders. */
  embedFrame: 'iframe',
} as const;

/** The element each advanced block renders first inside its wrapper. */
const ROOTS: Readonly<Record<string, string>> = {
  annotatable: 'div.annotatable-wrapper',
  conditional: 'div.conditional-wrapper',
  done: 'div.done_onoffswitch_wrapper',
  edx_sga: 'div.sga-block',
  'google-calendar': 'div.google-calendar-xblock-wrapper',
  'google-document': 'div.google-docs-xblock-wrapper',
  lti_consumer: '.lti-consumer-container',
  pdf: 'div.pdf_block',
  poll: 'div.poll-block',
  recommender: 'div.recommenderBlock',
  survey: 'div.poll-block table.survey-table',
  // The block's root carries an id; the results cloud inside it reuses the class.
  word_cloud: 'div.word_cloud[id^="word_cloud_"]',
};

/** The rendered root of an advanced block of `category`; throws for an unknown one. */
export function advancedBlockRoot(category: string): string {
  const root = ROOTS[category];
  if (root === undefined) throw new Error(`No rendered-root anchor for block type "${category}".`);
  return root;
}
