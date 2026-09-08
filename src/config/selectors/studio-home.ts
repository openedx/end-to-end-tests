/**
 * Studio Home (`frontend-app-course-authoring`, reached through the Studio
 * `/home/` route which redirects to the MFE's `home` route — the MFE mount path
 * differs by release, so nothing here or in the page object depends on it).
 *
 * Measured on Tutor `main` and `redwood` (2026-09-08). The MFE places test IDs on
 * its list controls and on the create-course form, but not on the "New course"
 * button, the course cards or the org dropdown, which are anchored structurally.
 */
export const STUDIO_HOME_SELECTORS = {
  /** The page header ("Studio home") — marks the MFE route as rendered. */
  header: '.studio-home-sub-header header.sub-header',

  /**
   * The header's "New course" button. It is the only `<button>` in the header's
   * action row ("New library" is an `<a>`), and it is **absent** — not disabled —
   * while the session has no course-creator status (TC-00310).
   */
  newCourseButton: '.studio-home-sub-header .sub-header-actions button.btn',

  /** The "Create a new course" form the button reveals. */
  createCourseForm: '[data-testid="create-course-form"]',

  /** "Course name" (`display_name`). */
  courseNameInput: '[data-testid="create-course-form"] input[name="displayName"]',

  /**
   * "Organization" when the session may **not** create organizations
   * (`allow_to_create_new_org: false`): a dropdown of the allowed orgs.
   */
  orgDropdownToggle: '[data-testid="create-course-form"] #org-dropdown',

  /** One entry of the open org dropdown; its text is the org short name. */
  orgDropdownItem: '.dropdown-menu.show a[role="button"]',

  /**
   * "Organization" when the session **may** create organizations
   * (`allow_to_create_new_org: true`): a free-text field with suggestions.
   */
  orgInput: '[data-testid="create-course-form"] input[name="org"]',

  /** One suggestion under the free-text org field; `value` is the short name. */
  orgSuggestion: '[data-testid="create-course-form"] button.dropdown-item',

  /** "Course number" (`number`). */
  courseNumberInput: '[data-testid="create-course-form"] input[name="number"]',

  /** "Course run" (`run`). */
  courseRunInput: '[data-testid="create-course-form"] input[name="run"]',

  /** The form's "Create" button (a stateful button; disabled until valid). */
  createButton: '[data-testid="create-course-form"] button.btn-primary',

  /** The form's "Cancel" button. */
  cancelButton: '[data-testid="create-course-form"] button.btn-outline-primary',

  /** The course list's search field. */
  searchInput: '[data-testid="input-filter-courses-search"] input',

  /** "All courses / Active / Archived" filter toggle. */
  courseTypeMenu: '[data-testid="dropdown-toggle-course-type-menu"]',

  /** "Name A-Z / …" sort toggle. */
  courseOrderMenu: '[data-testid="dropdown-toggle-courses-order-menu"]',

  /** "Showing N of M". */
  paginationInfo: '[data-testid="pagination-info"]',

  /** One course card in the list; the course-name link inside carries the key. */
  courseCard: '.pgn__card',

  /** The card's course-name link (`/course/<key>` on the MFE). */
  courseCardLink: 'a[href*="/course/"]',

  /** The card's three-dot "Course actions" menu toggle. */
  courseCardActions: '.pgn__dropdown-toggle-iconbutton',

  /**
   * The collapsible shown **instead of** the "New course" button while the
   * session is not a course creator: "Becoming a course creator in Studio" when
   * `unrequested`, "Your course creator request status" once `pending`.
   */
  creatorStatusPanel: '[data-testid="collapsible-state-with-action"]',

  /** The collapsible's header row, which toggles it open. */
  creatorStatusPanelToggle: '[data-testid="collapsible-state-with-action"] .collapsible-trigger',

  /** "Request the ability to create courses" — the only button in the panel. */
  requestCreatorAccessButton: '[data-testid="collapsible-state-with-action"] button.btn',

  /** Empty-list card action "Create your first course". */
  createFirstCourseButton: '[data-testid="contact-admin-create-course"]',
} as const;
