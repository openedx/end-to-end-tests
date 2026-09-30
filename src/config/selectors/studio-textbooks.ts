/**
 * The Studio Textbooks page (`/course/<key>/textbooks`). Measured live on Tutor
 * `main` (Epic 11). The form and cards carry test ids; the three text inputs of
 * the form have generated ids, so they go by order within `textbook-form`
 * (tab title, then each chapter's title and PDF path).
 */
export const STUDIO_TEXTBOOKS_SELECTORS = {
  emptyPlaceholder: '[data-testid="textbooks-empty-placeholder"]',
  newFromEmpty: '[data-testid="textbooks-empty-placeholder"] button',
  form: '[data-testid="textbook-form"]',
  formInputs: '[data-testid="textbook-form"] input',
  addChapterButton: '[data-testid="textbook-form"] button.btn-outline-primary',
  chapterDeleteButton: '[data-testid="chapter-delete-button"]',
  formSave: '[data-testid="textbook-form"] button.btn-primary',

  card: '[data-testid="textbook-card"]',
  editButton: '[data-testid="textbook-edit-button"]',
  deleteButton: '[data-testid="textbook-delete-button"]',

  /** The delete-confirmation AlertModal and its confirm (non-cancel) button. */
  deleteModal: '.pgn__alert-modal',
  deleteConfirm: '.pgn__alert-modal .pgn__modal-footer button.btn-danger',
} as const;
