/**
 * The taxonomy administration MFE — the list page (`/taxonomies`) and a single
 * taxonomy's detail page (`/taxonomy/<id>`), plus the import wizard, export and
 * delete dialogs and the manage-orgs modal reached from a taxonomy's menu.
 * Measured against `frontend-app-authoring` source (Epic 11, 2026-09-16); every
 * anchor is a `data-testid`, an id, an `href` or a Paragon structural class, never a
 * localized string. The admin drives the management actions; a non-staff author and a
 * global-staff user open the taxonomy and Competency Management pages by URL.
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

  /**
   * Every taxonomy card on the list page, whatever its id. A card is a link, so it
   * is reached by its `href` (a stable attribute) and not by its localized title.
   * The `taxonomy-card` class keeps another link to a taxonomy from matching.
   */
  cardAny: 'a.taxonomy-card[href*="/taxonomy/"]',
  /**
   * A taxonomy's card on the list page, reached by its link rather than its
   * localized title. The `$=` match with a leading slash keeps id 5 from matching
   * `/taxonomy/15`.
   */
  card: (id: number): string => `a.taxonomy-card[href$="/taxonomy/${id}"]`,
  /**
   * A card's type icon, whose screen-reader text is "Competency taxonomy" for
   * `competency` and "Tags taxonomy" for `tags`. A card without a known type
   * shows the `tags` icon. Both icons render the same Paragon `Icon` markup and
   * differ only by svg path and that localized text, so nothing structural tells
   * them apart and the test id is the only anchor.
   */
  typeIcon: (type: 'competency' | 'tags'): string => `[data-testid="taxonomy-type-icon-${type}"]`,
  /**
   * Either type icon ("Competency taxonomy" or "Tags taxonomy"); a card holds
   * exactly one. Test id for the same reason as {@link typeIcon}.
   */
  anyTypeIcon: '[data-testid^="taxonomy-type-icon-"]',

  /** A taxonomy's kebab menu button (scoped to a card, or the detail SubHeader). */
  menuButton: '[data-testid="taxonomy-menu-button"]',
  menuImport: '[data-testid="taxonomy-menu-import"]',
  menuExport: '[data-testid="taxonomy-menu-export"]',
  menuDelete: '[data-testid="taxonomy-menu-delete"]',
  menuManageOrgs: '[data-testid="taxonomy-menu-manageOrgs"]',
  /**
   * The "Apply Competencies" item, shown for a Competency taxonomy the user may
   * tag with. Test id like the other menu items: every item is a bare
   * `<button class="dropdown-item">` told apart only by its localized label.
   */
  menuApplyCompetencies: '[data-testid="taxonomy-menu-applyCompetencies"]',
  /**
   * The open taxonomy menu, reached by the ARIA relationship the app declares:
   * the menu is `aria-labelledby` its toggle, whose id starts with
   * `taxonomy-menu-toggle-`. It renders after the first open, next to its toggle.
   */
  menu: '[aria-labelledby^="taxonomy-menu-toggle-"]',
  /**
   * Every item of the open menu, in DOM order: "Re-import", "Export", "Delete",
   * "Manage Organizations" and "Apply Competencies", whichever the user may use.
   * Located structurally (a Paragon `.dropdown-item` inside the menu); a spec
   * reads each item's `data-testid` value (its key in the app's item table,
   * never translated) as its language-independent identity, so the order and
   * set are checked without matching displayed text.
   */
  menuItems: '[aria-labelledby^="taxonomy-menu-toggle-"] .dropdown-item',

  /**
   * Scoped inside one card: the footer holding the "Apply Competencies" button,
   * located by Paragon's `Card.Footer` class (the app gives the footer no test id).
   * It renders only for a Competency taxonomy the user may tag with.
   */
  cardFooter: '.pgn__card-footer',
  /**
   * Scoped inside one card: the footer's "Apply Competencies" button. The footer
   * holds this one button, so the structure alone identifies it.
   */
  cardFooterButton: '.pgn__card-footer button',
  /**
   * Scoped inside one card: its description body, the part of the card that is
   * neither the menu button nor the footer. A class the app sets itself.
   */
  cardBody: '.taxonomy-card-body',

  /**
   * The Competency Management page (`/taxonomy/<id>/competencies`): the root of
   * its competency tree, drawn once the taxonomy passed the type check, even for
   * a taxonomy with no tags. The class belongs to the app's `CompetencyTree`.
   * The page has no taxonomy menu button, which tells it from the taxonomy page.
   */
  competencyPage: '.competency-tree',
  /**
   * The "unable to connect" alert (Paragon `Alert variant="danger"`, the app's
   * `ConnectionErrorAlert`). When the taxonomy request fails it is the whole
   * render of both the taxonomy page and the Competency Management page, so the
   * `alert` role plus the danger variant identifies it without a test id or text.
   */
  connectionError: '[role="alert"].alert-danger',

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
  /**
   * The populate step's "Taxonomy Type" dropdown, the only `<select>` in the step.
   * Its option values (`tags`, `competency`) are not translated, so
   * `selectOption(value)` is language-independent.
   */
  typeSelect: '[data-testid="populate-step"] select',
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
