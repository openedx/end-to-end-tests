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
  /**
   * Submit control — the sheet's "Submit" button. Note this platform version
   * renders `button.submit`; the older `button.check` does not exist, so a
   * selector ported from an older suite silently matches nothing.
   */
  submitButton: 'button.submit',

  /** Multiple-choice and multi-select options. */
  radioOption: 'input[type="radio"]',
  checkboxOption: 'input[type="checkbox"]',

  /** Free-text and numerical answer inputs. */
  textInput: 'input.entry, input[type="text"], textarea.short-form-response',

  /** Dropdown (option-response) answer control. */
  dropdown: 'select',

  /**
   * Show-answer control, where the problem's `showanswer` setting offers one.
   *
   * The class is `show`, **not** `show-answer`: `button.show-answer` matches
   * nothing on this platform version, the same trap as `button.check` (§2.3 of the
   * plan). Its label lives in `.show-label`.
   */
  showAnswerButton: 'button.show',
} as const;
