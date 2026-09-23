/**
 * The Course Updates page (`/course/<key>/course_info`) in the authoring MFE:
 * the dated updates list and the handouts sidebar, both edited in an inline
 * TinyMCE.
 *
 * The page ships two test ids (the handouts card and its edit button) and
 * nothing else, so the rest anchor structurally. Measured on Tutor `main`
 * (2026-09-22): the page renders **two** small primary buttons — "New update" in
 * the header's action row and "Add first update" in the empty updates
 * container — so a bare `button.btn-primary.btn-sm` is ambiguous and each is
 * anchored inside its own region instead.
 */
export const STUDIO_UPDATES_SELECTORS = {
  /** The handouts card and its edit (pencil) button — the page's own test ids. */
  handouts: '[data-testid="course-handouts"]',
  handoutsEdit: '[data-testid="course-handouts-edit-button"]',

  /** "New update", in the page header's action row. */
  newUpdate: 'header.sub-header .sub-header-actions button.btn.btn-primary',
  /** "Add first update", the empty state's call to action inside the updates list. */
  addFirstUpdate: '.updates-section .updates-container button.btn.btn-primary',

  /**
   * The open editor's Post / Save control: the only primary button that is **not**
   * small, which distinguishes it from the two above while an editor is open.
   */
  postOrSave: 'button.btn.btn-primary:not(.btn-sm)',

  /** The inline TinyMCE: its iframe, and the pane a caller clicks to focus it. */
  tinyMceFrame: 'iframe.tox-edit-area__iframe',
  editArea: '.tox-edit-area:visible',
} as const;
