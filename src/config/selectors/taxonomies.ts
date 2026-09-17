/**
 * The taxonomy administration MFE — the list page (`/taxonomies`) and a single
 * taxonomy's detail page (`/taxonomy/<id>`), plus the import wizard, export and
 * delete dialogs and the manage-orgs modal reached from a taxonomy's menu.
 * Measured against `frontend-app-authoring` source (Epic 11, 2026-09-16); every
 * anchor is a `data-testid`, an id or a Paragon structural class, never a
 * localized string. These pages are staff-only, so only the admin drives them.
 *
 * The import wizard is a Paragon `Stepper` in a `ModalDialog`. Most action-row
 * buttons carry test ids (`next-button`, `continue-button`, `import-button`); the
 * two that advance a *new* import (upload → populate) and confirm a *re-import*
 * are plain primary buttons, reached as the footer's visible primary button
 * ({@link wizardPrimaryButton}).
 */
export const TAXONOMY_SELECTORS = {
  /** The "Import" button on the list page that opens the new-taxonomy wizard. */
  importButton: '[data-testid="taxonomy-import-button"]',
  /** The download-template split button and its two format items. */
  templateToggle: '[data-testid="taxonomy-download-template"]',
  templateCsv: '[data-testid="taxonomy-download-template-csv"]',
  templateJson: '[data-testid="taxonomy-download-template-json"]',

  /** A taxonomy's kebab menu button (scoped to a card, or the detail SubHeader). */
  menuButton: '[data-testid="taxonomy-menu-button"]',
  menuImport: '[data-testid="taxonomy-menu-import"]',
  menuExport: '[data-testid="taxonomy-menu-export"]',
  menuDelete: '[data-testid="taxonomy-menu-delete"]',
  menuManageOrgs: '[data-testid="taxonomy-menu-manageOrgs"]',

  /** Import wizard steps (each a `data-testid` on its Stack). */
  uploadStep: '[data-testid="upload-step"]',
  populateStep: '[data-testid="populate-step"]',
  planStep: '[data-testid="plan-step"]',
  confirmStep: '[data-testid="confirm-step"]',
  /** The dropzone; Paragon renders an `<input type="file">` within it. */
  dropzone: '[data-testid="dropzone"]',
  dropzoneInput: '[data-testid="dropzone"] input[type="file"]',
  fileInfo: '[data-testid="file-info"]',
  /** The new taxonomy's name (text input) and description (textarea) fields. */
  populateNameInput: '[data-testid="populate-step"] input',
  populateDescInput: '[data-testid="populate-step"] textarea',
  /** Testid'd wizard buttons. */
  wizardNext: '[data-testid="next-button"]',
  wizardContinue: '[data-testid="continue-button"]',
  wizardImport: '[data-testid="import-button"]',
  /** The wizard footer's currently visible primary button (advance / confirm). */
  wizardPrimaryButton: '.pgn__modal .pgn__modal-footer .btn-primary',

  /** Export modal: format radios and the confirm button (id carries the id). */
  exportButton: (id: number): string => `[data-testid="export-button-${id}"]`,
  exportFormatCsv: 'input[name="export-format"][value="csv"]',
  exportFormatJson: 'input[name="export-format"][value="json"]',

  /** Delete dialog: the confirm word is the `<b>` in the label; the field echoes it. */
  deleteDialog: '.taxonomy-delete-dialog',
  deleteConfirmWord: '.taxonomy-delete-dialog label b',
  deleteConfirmInput: '.taxonomy-delete-dialog .pgn__form-group input',
  deleteButton: '[data-testid="delete-button"]',

  /** Manage-orgs modal: the "assign to all orgs" checkbox and the Save button. */
  manageOrgsModal: '.manage-orgs',
  manageOrgsAllCheckbox: '.manage-orgs input[type="checkbox"]',
  manageOrgsSave: '.manage-orgs .pgn__modal-footer .btn-primary',
} as const;
