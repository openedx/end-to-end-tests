/**
 * Advanced components (legacy XBlocks) as they render for a learner, inside the
 * unit's content iframe and scoped to the block's `[data-usage-id]` wrapper.
 *
 * Like CAPA (`capa.ts`), these blocks ship no test ids and no useful roles: the
 * anchors are the server-rendered classes each block's own template and scripts
 * key off, named here with the package and template they come from. Measured on
 * Tutor `main` (2026-09-24; drag-and-drop, ORA and SCORM 2026-11-08).
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
  /** Google calendar and document embeds, and the PDF: the iframe the block renders. */
  embedFrame: 'iframe',
  /**
   * xblocks-contrib `pdf`: the links under the viewer — "Download the PDF"
   * (only while downloads are allowed) and the author's source-document link;
   * both are `li.pdf-download-button`, told apart by their `href`.
   */
  pdfLink: 'li.pdf-download-button a',
} as const;

/**
 * xblock-lti-consumer `lti_consumer`, as a learner sees an LTI 1.3 block
 * (`templates/html/student.html`, `static/js/xblock_lti_consumer.js`; measured on
 * lti-consumer-xblock 11.5, 2026-11-19). The inline target is an iframe whose
 * `src` the block's script sets to the tool's login URL — only after the
 * learner agrees, when the block shares personal data. The modal and new-window
 * targets are a launch button instead, with the "Data Sharing Notice" above it.
 * The consent prompt is the block's own markup, not a browser dialog; its
 * buttons' ids repeat per block, so scope them to the block.
 */
export const LTI_BLOCK_SELECTORS = {
  /** The inline launch iframe. */
  launchFrame: 'iframe.ltiLaunchFrame',
  /** The same iframe once the block's script has pointed it at the tool. */
  launchFrameStarted: 'iframe.ltiLaunchFrame[src^="http"]',
  /** "View resource in a new window" (or the author's own text). */
  newWindowButton: 'button.btn-lti-new-window',
  /** The author's "Data Sharing Notice" (`description`). */
  notice: '.lti-description',
  /** The consent prompt, its "OK" and (modal/new window only) "Cancel". */
  consentPrompt: '[id^="dialog-container-"]',
  consentConfirm: '#confirm-button',
  consentCancel: '#cancel-button',
} as const;

/** The element each advanced block renders first inside its wrapper. */
const ROOTS: Readonly<Record<string, string>> = {
  annotatable: 'div.annotatable-wrapper',
  conditional: 'div.conditional-wrapper',
  done: 'div.done_onoffswitch_wrapper',
  // xblock-drag-and-drop-v2: the learner view's root (rendered by the block's JS).
  'drag-and-drop-v2': 'div.xblock--drag-and-drop',
  edx_sga: 'div.sga-block',
  'google-calendar': 'div.google-calendar-xblock-wrapper',
  'google-document': 'div.google-docs-xblock-wrapper',
  lti_consumer: '.lti-consumer-container',
  // edx-ora2 `oa_base.html`: hosts both the legacy and the new ORA views.
  openassessment: 'div.wrapper--openassessment',
  pdf: 'div.pdf_block',
  poll: 'div.poll-block',
  recommender: 'div.recommenderBlock',
  // openedx-scorm-xblock `scormxblock.html`: rendered with or without a package.
  scorm: 'div.scorm-xblock',
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
