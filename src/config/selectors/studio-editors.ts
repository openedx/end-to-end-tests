/**
 * The component editors the authoring MFE opens over the unit page — the text
 * (TinyMCE) editor, the problem editor, and the video editor.
 *
 * Measured on Tutor `main` (2026-09-11). These editors carry few test ids and
 * their controls use localized `aria-label`s, so the stable anchors are the
 * editor's own primary/cancel buttons and, for TinyMCE, keyboard shortcuts.
 */
export const STUDIO_EDITOR_SELECTORS = {
  /**
   * The editor's "Save" button — a `btn-primary` that carries an `aria-label`
   * (its localized value is not matched, only its presence), which the unit
   * page's other primary buttons (sidebar Publish `btn-sm`, the Student
   * Visible toggle with no aria-label) do not, so this picks the editor's Save.
   */
  saveButton: 'button.btn-primary[aria-label]:not(.btn-sm)',
  /**
   * The editor dialog's title controls: the small icon button beside the title
   * ("Edit Title") and the input it swaps in.
   */
  editorTitleEditButton: '[role="dialog"].pgn__modal-xl .pgn__modal-header button.btn-icon-sm',
  editorTitleInput: '[role="dialog"].pgn__modal-xl .pgn__modal-header input',
  /** The editor's "Cancel"/"Discard" button. */
  cancelButton: 'button.btn-tertiary',

  /** The text component template picker (radios `name="Text"`, e.g. `value="html"`). */
  textTemplateRadio: (value: string) => `.pgn__modal input[name="Text"][value="${value}"]`,
  textTemplateSelect: '.pgn__modal button.btn-primary',
  /** TinyMCE's editable body iframe (the text editor, and each problem editor field). */
  tinyMceFrame: 'iframe.tox-edit-area__iframe',

  /** The problem type picker radios (`value="multiplechoiceresponse"`, …). */
  problemTypeRadio: (value: string) => `.pgn__modal input[type="radio"][value="${value}"]`,

  /**
   * The video editor's "Video source" URL field. The editor shows a "Video ID"
   * and a "Video URL" input; the URL is the second text input in the first
   * collapsible body. A "Add a video URL" link (the first `btn-link` there)
   * reveals an extra URL field when none is set.
   */
  videoSourceCollapsible: '.collapsible-body',
  videoUrlInput: '.collapsible-body input.form-control',
  videoDownloadCheckbox: '.collapsible-body input[type="checkbox"]',
  /**
   * The video editor's "Duration" widget: the one collapsible body laid out as a
   * `form-row` of two floating-label inputs — "Start time" then "Stop time",
   * `hh:mm:ss`. Measured in the library MFE's editor (2026-09-15).
   */
  videoDurationInput: '[role="dialog"] .collapsible-body .form-row input.form-control',
  /**
   * The "Transcripts" widget: "Add a transcript" is the small link button in the
   * one collapsible whose body holds no input; it reveals a language row with an
   * `.srt` file input.
   */
  videoAddTranscriptButton:
    '[role="dialog"] .collapsible-card:not(:has(input)) button.btn-link.btn-sm',
  videoTranscriptFileInput: '[role="dialog"] input.upload[type="file"]',
} as const;
