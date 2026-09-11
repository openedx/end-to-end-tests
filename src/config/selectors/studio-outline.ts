/**
 * The course outline in the authoring MFE (`/course/<key>`, redirected to the
 * MFE) — the section / subsection / unit tree an author builds.
 *
 * Measured on Tutor `main` (2026-09-10). Cards carry **no usage key** in their
 * markup except a unit card's title link (`unitCardTitleLink`), whose `href`
 * holds it. So a card is anchored either by that link (a unit, or an ancestor
 * `:has()`-containing it) or, during creation when no unit exists yet, by
 * position — see the page object.
 *
 * Each anchor names the localized string it stands in for, per
 * `src/config/selectors/README.md`.
 */
export const STUDIO_OUTLINE_PAGE_SELECTORS = {
  /** "Expand all" / "Collapse all" toggle in the outline header. */
  expandCollapseAllButton: '[data-testid="expand-collapse-all-button"]',

  /** A section (chapter) card, and its header sub-parts. */
  sectionCard: '[data-testid="section-card"]',
  /** A subsection (sequential) card. */
  subsectionCard: '[data-testid="subsection-card"]',
  /** A unit (vertical) card. */
  unitCard: '[data-testid="unit-card"]',

  /** The expand/collapse chevron on a card header (`aria-expanded`). */
  sectionExpandButton: '[data-testid="section-card-header__expanded-btn"]',
  subsectionExpandButton: '[data-testid="subsection-card-header__expanded-btn"]',
  unitExpandButton: '[data-testid="unit-card-header__expanded-btn"]',

  /** The "Rename" pencil on a card header; opens the inline edit field. */
  sectionEditButton: '[data-testid="section-edit-button"]',
  subsectionEditButton: '[data-testid="subsection-edit-button"]',
  unitEditButton: '[data-testid="unit-edit-button"]',
  /** The inline rename field (`name="displayName"`); Enter commits it. */
  sectionEditField: '[data-testid="section-edit-field"]',
  subsectionEditField: '[data-testid="subsection-edit-field"]',
  unitEditField: '[data-testid="unit-edit-field"]',

  /** The 3-dot menu button on a card header. */
  sectionMenuButton: '[data-testid="section-card-header__menu-button"]',
  subsectionMenuButton: '[data-testid="subsection-card-header__menu-button"]',
  unitMenuButton: '[data-testid="unit-card-header__menu-button"]',

  /**
   * A card menu's items. `<level>` is `section` / `subsection` / `unit`; each
   * item carries `aria-disabled="true"` when it does not apply (e.g. Publish on a
   * unit with nothing to publish, Move up on the first card). The template is
   * completed by {@link outlineMenuItem}.
   */
  menuItemSuffixes: {
    publish: 'publish',
    configure: 'configure',
    manageTags: 'manage-tags',
    duplicate: 'duplicate',
    moveUp: 'move-up',
    moveDown: 'move-down',
    delete: 'delete',
  },

  /** A unit card's title link — the only card element whose `href` holds the usage key. */
  unitCardTitleLink: '[data-testid="unit-card-header__title-link"]',

  /**
   * The status line on a card ("Release Status: …", "Prerequisite: …", access
   * notes). Asserted for presence, never for its (localized) text.
   */
  releaseStatus: '[data-testid="release-status-div"]',
  statusMessages: '[data-testid="status-messages-div"]',
  gradingType: '[data-testid="grading-type-div"]',

  /**
   * The container of a section's subsection cards, and of a subsection's unit
   * cards. The "New subsection" / "New unit" buttons live at the end of these
   * containers (see {@link newChildButtonScope}); when the container has no
   * children yet, the "New …" button is the first `button.btn-block` in it.
   */
  sectionSubsections: '[data-testid="section-card__subsections"]',
  subsectionUnits: '[data-testid="subsection-card__units"]',

  /**
   * The add-child buttons. They carry no test id and share their class with the
   * "Use … from library" and "Paste …" buttons beside them; "New …" is the
   * **first** `button.btn-block` in its scope (verified). The course-level "New
   * section" button is the only such button **outside** any section card.
   */
  addChildButton: 'button.btn-block',
  newSectionButton: 'button.btn-block:not([data-testid="section-card"] button)',

  /**
   * The primary (confirm) button of an outline modal — the "Publish" on the
   * publish confirmation, the "Delete" on a delete confirmation is a danger
   * variant (see {@link dialogDangerButton}). Paragon renders it as `btn-primary`.
   */
  dialogPrimaryButton: '[role="dialog"] button.btn-primary',
  /** The destructive-confirm button of a delete dialog (Paragon danger variant). */
  dialogDangerButton: '[role="dialog"] button.btn-danger',

  /**
   * The Configure dialog opened from a card's menu ("Configure"). One dialog is
   * open at a time, so its controls are page-scoped, not card-scoped. Sections
   * have Basic + Visibility tabs; subsections add an Advanced tab; a unit's
   * dialog is tab-less.
   */
  configureModal: '[data-testid="configure-modal"]',
  configureSaveButton: '[data-testid="configure-save-button"]',
  /** A dialog tab by its visible position, filtered to the shown (non-overflow) tabs. */
  configureTab: '[role="dialog"] [role="tab"]:not(.pgn__tab_invisible)',

  /**
   * The release date/time control on the Basic tab (a subsection's dialog also
   * has a due-date stack with the **same input ids**, so always scope inside the
   * stack). The date is `MM/DD/YYYY`, the time `HH:MM` UTC, behind a
   * react-datepicker committed with Enter — as on Schedule & Details.
   */
  releaseDateStack: '[data-testid="release-date-stack"]',
  configureDateInput: 'input[name="state-date"]',
  configureTimeInput: 'input[name="start-time"]',

  /** The "Grade as" assignment-type select on a subsection's Basic tab. */
  graderTypeSelect: '[data-testid="grader-type-select"]',

  /** "Hide from learners" on a section's Visibility tab. */
  sectionVisibilityCheckbox: '[data-testid="visibility-checkbox"]',
  /**
   * A subsection's Visibility tab radios: `show` (visible), `hideDue` (hide after
   * due date), `hide` (hidden entirely). Stands in for the three radio labels.
   */
  subsectionVisibilityRadio: (value: 'show' | 'hideDue' | 'hide') =>
    `input[name="subsectionVisibility"][value="${value}"]`,
  /** "Hide from learners" on a unit's (tab-less) configure dialog. */
  unitVisibilityCheckbox: '[data-testid="unit-visibility-checkbox"]',

  /**
   * Subsection prerequisite controls on the Advanced tab (present only when the
   * course's `enable_subsection_gating` advanced setting is on). The "Make this
   * subsection available as a prerequisite" checkbox has no test id and is the
   * only checkbox on the tab (the special-exam controls are radios); the
   * dependent side is a `<select>` of eligible prerequisites plus min-score and
   * min-completion number inputs (both defaulting to 100).
   */
  availableAsPrerequisiteCheckbox:
    '[role="dialog"] [role="tabpanel"]:not([hidden]) input[type="checkbox"]',
  prerequisiteSelect: '[role="dialog"] select[id="prereqForm.select"]',
  prerequisiteMinScore: 'input[name="prereqMinScore"]',
  prerequisiteMinCompletion: 'input[name="prereqMinCompletion"]',

  /** The outline header's "View live" link into the LMS (`/jump_to/`). */
  viewLiveLink: 'a[href*="/jump_to/"]',
  /** "You haven't added any content to this course yet." — an empty outline. */
  emptyPlaceholder: '[data-testid="empty-placeholder"]',
} as const;

/** A card menu item, e.g. `outlineMenuItem('unit', 'publish')`. */
export function outlineMenuItem(
  level: 'section' | 'subsection' | 'unit',
  action: keyof (typeof STUDIO_OUTLINE_PAGE_SELECTORS)['menuItemSuffixes'],
): string {
  const suffix = STUDIO_OUTLINE_PAGE_SELECTORS.menuItemSuffixes[action];
  return `[data-testid="${level}-card-header__menu-${suffix}-button"]`;
}

/** A unit card located by the usage key in its title link's `href`. */
export function unitCardFor(usageKey: string): string {
  return `[data-testid="unit-card"]:has(a[href*="${usageKey}"])`;
}

/** The subsection card containing the unit with `usageKey`. */
export function subsectionCardContaining(unitUsageKey: string): string {
  return `[data-testid="subsection-card"]:has(a[href*="${unitUsageKey}"])`;
}

/** The section card containing the unit with `usageKey`. */
export function sectionCardContaining(unitUsageKey: string): string {
  return `[data-testid="section-card"]:has(a[href*="${unitUsageKey}"])`;
}
