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
   * `alert` role plus the danger variant identifies it without a test id or text. The
   * Competency Management layout's alert for a failed import matches it too, so on that
   * page the tree's root row tells the two apart: the connection error replaces the tree.
   */
  connectionError: '[role="alert"].alert-danger',

  /**
   * The competency tree's toolbar button, "Expand All" or "Collapse All" (the label
   * swaps with the state). Its `aria-pressed` is `true` while every expandable node,
   * the root row included, is open, so the state is read from the attribute and not
   * from the localized label. It is the tree's only button with `aria-pressed` (the
   * chevrons use `aria-expanded`), so inside the tree root no class is needed.
   */
  competencyToggle: 'button[aria-pressed]',
  /**
   * The tree's scrolling box, which holds the root row and every node. It is the
   * element that gets `overflow-y: auto` from the `lg` breakpoint (992 px) up, and
   * the box the tree's rows must stay inside on a narrow window. A plain `div` with no
   * role or attribute, so the app's class is the only anchor.
   */
  competencyScroll: '.competency-tree__container',
  /**
   * The taxonomy's own row at the top of the tree: its name and a disclosure button,
   * no Competency ID badge. A plain `div` (not a tag, so no `treeitem`) with no role
   * or attribute, so the app's class is the only anchor.
   */
  competencyRootRow: '.competency-row--root',
  /**
   * The nodes right under the root row: the children of the `role="tree"` list, which
   * is the root row's next sibling and is in the DOM only while the root is expanded.
   */
  competencyTopLevelNodes: '[role="tree"] > [role="treeitem"]',
  /**
   * Every tag of the tree, one `treeitem` per tag (`aria-selected` on all of them,
   * `aria-expanded` on those with children). Children render only while their parent
   * is expanded. Looked up inside the tree root; the criteria-groups panel beside the
   * tree has no `treeitem`.
   */
  competencyNode: '[role="treeitem"]',
  /** A node that is selected (`aria-selected="true"`). */
  competencySelectedNode: '[role="treeitem"][aria-selected="true"]',
  /**
   * A node's own header row (disclosure button, name, badge), without its nested
   * children. A plain `div` with no role, so the app's class is the only anchor.
   * Relative to a node, with `:scope`.
   */
  competencyRowOf: ':scope > .competency-row',
  /**
   * A node's direct children, however deep the node sits: the `role="group"` list
   * inside the node. Relative to a node, with `:scope`.
   */
  competencyChildrenOf: ':scope > [role="group"] > [role="treeitem"]',
  /**
   * The list that holds a node's children, present only while the node is expanded.
   * Relative to a node, with `:scope`.
   */
  competencyChildList: ':scope > [role="group"]',
  /** A field a user could type into: an input, a textarea or an editable element. */
  competencyEditField: 'input, textarea, [contenteditable]:not([contenteditable="false"])',
  /** A button a user can press (not disabled). */
  competencyEnabledButton: 'button:enabled',
  /** A row's name, whose text is the tag's value (the suite's own data). */
  competencyLabel: '.competency-row__label',
  /**
   * A row's "Competency ID" badge (Paragon `Badge`, `aria-hidden`), whose text is the
   * tag's `external_id`. No role or accessible name reaches it, so the class is the
   * anchor. A row without an ID has no badge.
   */
  competencyBadge: '.competency-row__badge',
  /**
   * A row's expand/collapse chevron, "Expand row" or "Collapse row". A leaf renders a
   * disabled placeholder with no `aria-expanded`, so this finds only expandable rows.
   */
  competencyDisclosure: 'button[aria-expanded]',

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
  /**
   * The wizard footer's currently visible primary button (advance / confirm). It starts
   * with `.pgn__modal` because Paragon puts that class and `role="dialog"` on the same
   * element, so it is built from the page and not as a descendant of {@link dialog}.
   */
  wizardPrimaryButton: '.pgn__modal .pgn__modal-footer .btn-primary',
  /**
   * The wizard window (Paragon `ModalDialog`), found by its `dialog` role without a
   * name: the wizard gives the dialog an empty label. Only the open wizard renders it,
   * so its absence means the wizard is closed.
   */
  dialog: '[role="dialog"]',
  /**
   * The footer's "Cancel" button on the Upload and Populate steps. It is the footer's
   * only `tertiary` button there (the stepper renders only the active step's action
   * row). The button has no test id on these steps (`cancel-button` exists on the
   * Export step only), so the Paragon variant class is its only anchor. It is only
   * clicked, so a style change makes the click fail loudly.
   */
  wizardCancel: '.pgn__modal-footer .btn-tertiary',
  /** The modal's corner "Close" button (an `IconButton` Paragon renders by default). */
  wizardClose: '.pgn__modal-close-button',
  /**
   * The dropzone after it rejected the dropped file: Paragon puts its root class and
   * a rejection class on the same element once its asynchronous type check has failed,
   * so the rejection class is the positive signal that the rejection happened. The
   * rejected dropzone also shows a "file type not accepted" message, which no test reads.
   */
  dropzoneRejected: '.pgn__dropzone.pgn__dropzone-validation-error',

  /**
   * The container of the page header's action buttons (the app's `SubHeader`). It is not
   * rendered at all when the page has no action to offer, such as the import button for a
   * user who may not create taxonomies.
   */
  headerActions: 'header.sub-header .sub-header-actions',
  /**
   * The Competency Management header's "Import Competency Framework" button. It has
   * no test id and is the only button the header renders; the container exists only
   * for a user who may create taxonomies, so an absent `headerActions` is the
   * "no button" check.
   */
  importFrameworkButton: 'header.sub-header .sub-header-actions button',
  /** The page title (an `<h2>`): the taxonomy's name, which the test itself chose. */
  pageTitle: 'header.sub-header .sub-header-title',
  /**
   * The "Dismiss" button of the red import-error alert, located from the alert. Paragon's
   * `Alert` renders it as the one button of its `pgn__alert-actions` row, so the
   * structure inside the alert is the anchor.
   */
  alertDismiss: '.pgn__alert-actions button',

  /** Export modal: format radios and the confirm button (id carries the id). */
  exportButton: (id: number): string => `[data-testid="export-button-${id}"]`,
  exportFormatCsv: 'input[name="export-format"][value="csv"]',
  exportFormatJson: 'input[name="export-format"][value="json"]',

  /** Delete dialog: the confirm word is the `<b>` in the label; the field echoes it. */
  deleteDialog: '.taxonomy-delete-dialog',
  deleteConfirmWord: '.taxonomy-delete-dialog label b',
  deleteConfirmInput: '.taxonomy-delete-dialog .pgn__form-group input',
  deleteButton: '[data-testid="delete-button"]',

  /**
   * The taxonomy page's tag tree (`TagListTable`, measured on Tutor `main`
   * 2026-11-24): one table row per visible tag, top-level tags first, each
   * followed by its children once expanded. A tag with children carries a
   * disclosure button ("Show Subtags" / "Hide Subtags") whose state is its
   * `aria-expanded`; the row's other button is its actions menu
   * (`aria-haspopup`). The tag's name is the text beside the disclosure; a
   * child row wraps both in an indent element (`.tree-table-indent`).
   */
  tagRow: '.tag-list-card table tbody tr',
  tagRowName: 'td:first-child span.d-flex > span',
  tagRowCollapsedToggle: 'td:first-child button[aria-expanded="false"]:not([aria-haspopup])',
  /**
   * The "Taxonomy details" widget in the page's right column: the card beside
   * the tag list, one section per field ("Title", "Description", "Export ID"),
   * each a localized section title followed by the value.
   */
  detailsWidget: '.row > [class*="col-"]:not(:has(.tag-list-card)) > .pgn__card',
  detailsWidgetSection: '.pgn__card-section:has(.pgn__card-section-title)',

  /** Manage-orgs modal: the "assign to all orgs" checkbox and the Save button. */
  manageOrgsModal: '.manage-orgs',
  manageOrgsAllCheckbox: '.manage-orgs input[type="checkbox"]',
  manageOrgsSave: '.manage-orgs .pgn__modal-footer .btn-primary',
} as const;
