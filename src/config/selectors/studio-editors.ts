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
  /** The component editor dialog (`aria-label="Editor Dialog"`, an xl modal). */
  editorDialog: '[role="dialog"].pgn__modal-xl',
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
  /**
   * The editor dialog's own "Cancel" (the footer's tertiary button), and the
   * "Exit the editor?" prompt it raises over the editor: a large modal whose
   * footer offers "Discard Changes and Exit" (the outline button) and "Keep
   * Editing" (the primary one).
   */
  editorCancel: '[role="dialog"].pgn__modal-xl .pgn__modal-footer button.btn-tertiary',
  exitPrompt: '[role="dialog"].pgn__modal-lg',
  exitPromptDiscard: '[role="dialog"].pgn__modal-lg .pgn__modal-footer button.btn-outline-brand',
  exitPromptKeepEditing: '[role="dialog"].pgn__modal-lg .pgn__modal-footer button.btn-primary',
  /**
   * A TinyMCE toolbar button, by the command name TinyMCE itself stamps on it
   * (`data-mce-name`: `aligncenter`, `bullist`, `blockquote`, `forecolor`, …).
   * Its `aria-label` is localized; this attribute is not.
   */
  tinyMceToolbarButton: (name: string) => `button.tox-tbtn[data-mce-name="${name}"]`,
  /**
   * TinyMCE's own dialogs (link, emoticons, special characters): the link
   * dialog's URL and "Text to display" fields, and a dialog's primary footer
   * button ("Save" — the secondary one is "Cancel").
   */
  tinyMceDialog: '.tox-dialog',
  tinyMceLinkUrl: '.tox-dialog input[type="url"]',
  tinyMceLinkText: '.tox-dialog input[data-mce-name="text"]',
  tinyMceDialogPrimary: '.tox-dialog__footer button.tox-button:not(.tox-button--secondary)',
  /** The emoticons dialog's tile for an emoji: its value is the character itself. */
  tinyMceEmoji: (emoji: string) =>
    `.tox-dialog .tox-collection__item[data-collection-item-value="${emoji}"]`,
  /** TinyMCE's editable body iframe (the text editor, and each problem editor field). */
  tinyMceFrame: 'iframe.tox-edit-area__iframe',

  /** The problem type picker radios (`value="multiplechoiceresponse"`, …). */
  problemTypeRadio: (value: string) => `.pgn__modal input[type="radio"][value="${value}"]`,
  /**
   * The picker's clickable box for a type: the radio itself is `hidden`, so the
   * author clicks the box that wraps it. Then the picker's "Select".
   */
  problemTypeOption: (value: string) =>
    `.pgn__modal [role="button"]:has(> input[type="radio"][value="${value}"])`,
  problemTypeSelect: '.pgn__modal-footer button.btn-primary',
  /** The visual problem editor's "Question" field (a TinyMCE instance). */
  problemQuestionFrame: 'iframe#question_ifr',
  /** One row per answer under "Answers". */
  problemAnswerRow: '.answers-container .answer-option',
  /**
   * An answer's "correct" control, by the answer's key (`A`, `B`, …): a radio
   * for single select and dropdown, a checkbox for the other types.
   */
  problemAnswerCorrect: (key: string) => `.answers-container .answer-option input[value="${key}"]`,
  /** A single- or multi-select answer's text: a TinyMCE instance per answer key. */
  problemAnswerFrame: (key: string) => `iframe#answer-${key}_ifr`,
  /** A dropdown, numerical or text-input answer's text: a plain field in its row. */
  problemAnswerInput: (key: string) =>
    `.answers-container .answer-option:has(input[value="${key}"]) textarea.form-control`,

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

/**
 * The PDF component's editor (the authoring MFE's own `PdfEditor`, opened in the
 * component editor dialog). Measured on Tutor `main` (2026-09-24).
 */
export const PDF_EDITOR_SELECTORS = {
  /**
   * "File": the hidden file input the editor uploads from, straight to the
   * course's Files. The file row's "Replace" action opens this same input.
   */
  fileInput: 'input#pdf-url[type="file"]',
  /** "Show PDF download link". */
  allowDownload: 'input[name="allowDownload"]',
  /** "Original File URL" and "Original File Link Text". */
  sourceUrl: '#pdf-source-url',
  sourceText: '#pdf-source-text',
} as const;

/**
 * The XBlock-provided ("legacy") editors — an advanced block's own `studio_view`
 * — which the authoring MFE opens in a dialog holding one iframe framed at
 * `/xblock/<key>/action/edit`. Their anchors are the ids each block's editor
 * template renders, named with the package they come from. Each editor's save
 * posts to one of the block's Studio handlers, and the dialog closes after it.
 * Measured on Tutor `main` (2026-09-24).
 */
export const LEGACY_EDITOR_SELECTORS = {
  /** The dialog's editor iframe. */
  frame: 'iframe.modal-iframe',
  /** xblock-google-drive `google-calendar`: the calendar id and "Save". */
  calendarId: '#edit_calendar_id',
  calendarSave: '#calendar-submit-options',
  /** xblock-google-drive `google-document`: the raw embed code and "Save". */
  embedCode: '#edit_embed_code',
  documentSave: '#document-submit-options',
  /** xblock-poll `poll`: the question, one label per answer key, and "Save". */
  pollQuestion: '#poll-question-editor',
  pollAnswerLabel: (key: string) => `#answer-label-${key}`,
  /** xblock-poll `survey`: one label per question key (answers as for a poll). */
  surveyQuestionLabel: (key: string) => `#question-label-${key}`,
  pollSave: '#poll-submit-options',
  /**
   * recommender-xblock: the "entries per page" setting and "Set configurations"
   * (`set_client_configuration`). This editor stays open after its save; its
   * dialog's close control is the frame's `action-cancel`.
   */
  recommenderEntriesPerPage: 'select.entriesPerPage',
  recommenderSave: 'input.recommender_configSubmit',
  /**
   * edx-ora2's editor: the "Settings" tab — click it at its left edge, because
   * the MFE dialog's expand button overlaps its right side — a control every
   * Settings tab renders ("Show rubric during response"), the "Teams enabled"
   * select (present only while team submissions are on; `0` / `1`), the
   * "Select Team-Set" select (values are team-set ids), and "Save"
   * (`update_editor_context`).
   */
  oraSettingsTab: '#oa_edit_settings_tab a',
  oraSettingsLoaded: '#openassessment_show_rubric_during_response_selector',
  oraTeamsEnabled: '#openassessment_team_enabled_selector',
  oraTeamSet: '#openassessment_teamset_selector',
  oraSave: 'a.openassessment_save_button',
  close: 'a.action-cancel',
} as const;
