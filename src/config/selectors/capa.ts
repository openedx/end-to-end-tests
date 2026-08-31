/**
 * Legacy CAPA problem markup, as rendered inside the unit iframe.
 *
 * **This module is the ADR's documented CSS-selector exception.** The locator
 * priority puts CSS containers last, but CAPA problems expose no test IDs and no
 * useful roles; what they do expose is server-rendered, non-localized structural
 * class markup (`.problem`, `.choicegroup`, `button.submit`, `.status.correct`).
 * That markup is part of the platform's own JS contract — its scripts key off the
 * same classes — so it is considerably more stable than the alternative of
 * matching the button's translated "Submit" label, which ADR-0002 forbids
 * outright. Anchoring here is a deliberate, reviewed choice rather than an
 * oversight.
 */
export const CAPA_SELECTORS = {
  /** A CAPA problem block. */
  problem: '.problem',

  /**
   * Submit control — the sheet's "Submit" button. Note this platform version
   * renders `button.submit`; the older `button.check` does not exist, so a
   * selector ported from an older suite silently matches nothing.
   */
  submitButton: 'button.submit',

  /** Multiple-choice group and its options. */
  choiceGroup: '.choicegroup',
  radioOption: 'input[type="radio"]',
  checkboxOption: 'input[type="checkbox"]',

  /** Free-text and numerical answer inputs. */
  textInput: 'input.entry, input[type="text"], textarea.short-form-response',

  /** Dropdown (option-response) answer control. */
  dropdown: 'select',

  /**
   * Demand-hint controls. The button's label alternates between "Hint" and "Next
   * Hint" as hints are consumed, which is exactly why it is anchored by class:
   * one anchor covers both states in any language. The revealed hint lives in
   * `.problem-hint`, whose `.notification-hint` panel carries `.is-hidden` until
   * shown.
   */
  hintButton: 'button.hint-button',
  hintContainer: '.problem-hint',
  hintPanel: '.notification-hint',

  /**
   * Answer-status region. The **class** is the non-localized correctness signal:
   * `.status.correct` / `.status.incorrect` / `.status.unanswered`. Its
   * `data-tooltip` attribute and inner `.sr` text are both localized.
   */
  status: '.status',
  statusCorrect: '.status.correct',
  statusIncorrect: '.status.incorrect',
  statusUnanswered: '.status.unanswered',

  /**
   * Show-answer control, where the problem's `showanswer` setting offers one.
   *
   * The class is `show`, **not** `show-answer`: `button.show-answer` matches
   * nothing on this platform version, the same trap as `button.check` (§2.3 of the
   * plan). Its label lives in `.show-label`.
   */
  showAnswerButton: 'button.show',

  /** Where a revealed answer is written, once Show Answer is used. */
  revealedAnswer: 'p.answer',

  /** Panel the platform shows alongside a revealed answer. */
  showAnswerNotification: '.notification-show-answer',
} as const;
