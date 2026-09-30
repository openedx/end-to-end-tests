/**
 * The content tag drawer (`content-tags-drawer`), embedded in the Verawood Align
 * sidebar. Measured live on Tutor `main` (2026-09-16, Epic 11). Each anchor names
 * the localized string it stands in for.
 *
 * The drawer opens in a read view with a "Manage tags" button that switches it to
 * edit mode (Cancel / Save). In edit mode each taxonomy is a collapsible; expand
 * it, open its tag react-select, and the tags render as `SelectableBox`
 * checkboxes whose `value` is the URL-encoded lineage of the tag (our data, not
 * localized copy). Committing staged tags via "Add tags" moves them into the
 * applied `tags-tree`; the footer "Save" writes them (`PUT object_tags`).
 */
export const TAG_DRAWER_SELECTORS = {
  /** The drawer root (present whether embedded in the Align sidebar or a sheet). */
  drawer: '#content-tags-drawer',
  /** The read-mode button that enters edit mode ("Manage tags"), anchored by style. */
  enterEditButton: '#content-tags-drawer button.btn-outline-primary.btn-block',
  /** The footer Save button (edit mode) — the drawer's only primary block button. */
  saveButton: '#content-tags-drawer button.btn-primary.btn-block',
  /** The footer/menu Cancel buttons. */
  cancelButton: '.tags-drawer-cancel-button',

  /** One taxonomy's collapsible card. */
  taxonomyCollapsible: '.taxonomy-tags-collapsible',
  /** A collapsible's expand/collapse trigger (`aria-expanded`). */
  collapsibleTrigger: '.collapsible-trigger',
  /** A collapsible's heading — the taxonomy name (our data). */
  collapsibleHeading: '.collapsible-trigger h3',

  /** The react-select control that opens the tag menu. */
  tagSelectControl: '.react-select-add-tags__control',
  /** The react-select search input inside the control. */
  tagSelectInput: 'input.react-select-add-tags__input',
  /** A tag checkbox in the menu; `value` is the URL-encoded lineage. */
  selectableBox: (encodedValue: string) =>
    `.taxonomy-tags-selectable-box:has(input[value="${encodedValue}"])`,
  /** Any tag checkbox in the menu (to read what is shown). */
  anySelectableBox: '.taxonomy-tags-selectable-box',
  /** The expand arrow that reveals a tag's children in the menu. */
  arrowDropdown: '.taxonomy-tags-arrow-drop-down',
  /** The button that commits the menu's staged tags into the applied list ("Add tags"). */
  addStagedButton: '.add-tags-button',

  /** The applied-tags tree for a taxonomy. */
  appliedTagsTree: '.tags-tree',
  /** A delete ("x") button on an applied tag row. */
  deleteTagButton: '.tags-tree-delete-button',
  /** The tag-count chip beside a taxonomy. */
  countChip: '.taxonomy-tags-count-chip',
} as const;

/** The URL-encoded value a tag's checkbox carries: its lineage joined by commas. */
export function encodedTagValue(...lineage: readonly string[]): string {
  return lineage.map((v) => encodeURIComponent(v)).join(',');
}
