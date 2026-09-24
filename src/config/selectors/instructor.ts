/**
 * The instructor dashboard MFE (`frontend-app-instructor-dashboard`), served at
 * `${APPS_BASE_URL}/instructor-dashboard/<course key>/<tab id>` and driven by the
 * LMS `/api/instructor/v2/` API.
 *
 * Measured on Tutor `main` (2026-09-15, MFE `v2.0.0-alpha` build). The MFE ships
 * almost no test ids of its own — the ones below belong to Paragon (`DataTable`,
 * `Dropdown`) — and every tab title, button label and column header is
 * localized, so anchors are the tab ids and URLs the API hands out, the `id`s,
 * `name`s and Paragon structural classes that exist, and the **request an action
 * fires**: a page object clicks by position and then waits for the exact v2 URL
 * the action must call, so a mis-located button fails loudly instead of running
 * the wrong action. Every order-based anchor names the localized label it stands
 * in for so it can be re-measured when the MFE changes.
 */

/**
 * Tab ids, as the API's `courses/<key>.tabs[].tab_id` and the last URL segment.
 * Not localized (the `title` beside them is).
 */
export const INSTRUCTOR_TAB_IDS = {
  courseInfo: 'course_info',
  enrollments: 'enrollments',
  courseTeam: 'course_team',
  cohorts: 'cohorts',
  dateExtensions: 'date_extensions',
  grading: 'grading',
  dataDownloads: 'data_downloads',
  specialExams: 'special_exams',
  certificates: 'certificates',
  openResponses: 'open_responses',
} as const;

export type InstructorTabId = (typeof INSTRUCTOR_TAB_IDS)[keyof typeof INSTRUCTOR_TAB_IDS];

/** Path (on the MFE host) of one dashboard tab; the bare course path redirects to `course_info`. */
export function instructorTabPath(courseKey: string, tabId?: InstructorTabId): string {
  return `/instructor-dashboard/${courseKey}${tabId ? `/${tabId}` : ''}`;
}

/** The nav link for one tab — present only when the user may see that tab. */
export function instructorTabLink(courseKey: string, tabId: InstructorTabId): string {
  return `${INSTRUCTOR_DASHBOARD_SELECTORS.tabNav} a.nav-link[href$="${instructorTabPath(courseKey, tabId)}"]`;
}

/**
 * Which report each "Generate …" button on the Data Downloads tab queues: the
 * Paragon tab key (`data-rb-event-key`, not localized) and the row's position
 * inside that tab's panel. Rows render as `h4` + description + one primary
 * button, in this order. The `report_type` is the enum the API's `reports`
 * listing and `reports/<type>/generate` use — the one thing a spec asserts.
 */
export const INSTRUCTOR_REPORT_ROWS = {
  enrolled_students: { tab: 'enrollment', row: 0 }, // "Generate Enrolled Students Report"
  pending_enrollments: { tab: 'enrollment', row: 1 }, // "Generate Pending Enrollments Report"
  pending_activations: { tab: 'enrollment', row: 2 }, // "Generate Pending Activations Report"
  anonymized_student_ids: { tab: 'enrollment', row: 3 }, // "Generate Anonymized Student IDs Report"
  grade: { tab: 'grading', row: 0 }, // "Generate Grade Report"
  problem_grade: { tab: 'grading', row: 1 }, // "Generate Problem Grade Report"
  ora2_summary: { tab: 'problemResponse', row: 0 }, // "Generate ORA Summary Report"
  ora2_data: { tab: 'problemResponse', row: 1 }, // "Generate ORA Data Report"
  ora2_submission_files: { tab: 'problemResponse', row: 2 }, // "Generate Submission Files Archive"
  problem_responses: { tab: 'problemResponse', row: 3 }, // "Generate Problem Report" (needs a problem location)
  issued_certificates: { tab: 'certificates', row: 0 }, // "Generate Certificates Report"
} as const;

export type InstructorReportType = keyof typeof INSTRUCTOR_REPORT_ROWS;

/**
 * The Certificates tab's filter dropdown items, in rendered order, as the
 * `filter` values of `certificates/issued` they select (labels are localized).
 */
export const INSTRUCTOR_CERTIFICATE_FILTERS = [
  'all', // "All Learners"
  'received', // "Received"
  'not_received', // "Not Received"
  'audit_passing', // "Audit - Passing"
  'audit_not_passing', // "Audit - Not Passing"
  'error', // "Error State"
  'granted_exceptions', // "Granted Exceptions"
  'invalidated', // "Invalidated"
] as const;

export const INSTRUCTOR_DASHBOARD_SELECTORS = {
  // ---- shell -------------------------------------------------------------
  /** The dashboard's content region; every tab renders inside it. */
  main: '#main-content', // page objects scope every tab anchor below under this
  /** The tab navigation (a Paragon `Navbar`); its links are the tab ids' URLs. */
  tabNav: '#instructor-nav',
  /** The link of the tab currently shown. */
  activeTabLink: '#instructor-nav a.nav-link.active',
  /** Any Paragon modal the dashboard opens (all carry `role="dialog"`); page objects scope the modal anchors below under it. */
  dialog: '[role="dialog"]',
  /**
   * A modal's confirming action: its **last** primary button (Cancel is
   * tertiary). Not footer-scoped — the reset-extension dialog renders its
   * buttons in an `ActionRow` without a `ModalDialog.Footer`.
   */
  dialogPrimaryButton: 'button.btn-primary',
  /** The Paragon modal's corner close button. */
  dialogCloseButton: '.pgn__modal-close-button',
  dialogSubmitButton: 'button[type="submit"]',
  /** Any open Paragon dropdown menu and its items. */
  openDropdownMenu: '.dropdown-menu.show',
  dropdownItem: '.dropdown-item',
  /** A Paragon `DataTable` and its parts. */
  dataTable: '.pgn__data-table',
  dataTableRow: '.pgn__data-table tbody tr[role="row"]',
  /** The "Pending Tasks" collapsible every tab appends (presence only). */
  pendingTasks: '.pgn_collapsible .collapsible-trigger',
  /** Inline field error under a learner / problem field ("Could not find …"). */
  fieldError: '.text-danger-500',

  // ---- Course Info -------------------------------------------------------
  courseInfoIdentifiers: '.pgn__card-section .x-small span',
  courseStatusBadgeUpcoming: '.badge.badge-warning',
  courseStatusBadgeActive: '.badge.badge-success',
  /**
   * The enrollment counters ("All Enrollments", "Staff / Admin", "Learners",
   * then one per enrollment mode), each a `.flex-row` with the number in `p.lead`.
   */
  enrollmentCounter: '.pgn__hstack .flex-row',
  enrollmentCounterValue: 'p.lead',

  // ---- Enrollments -------------------------------------------------------
  /** "+ Enroll Learners" — the primary button in the tab header. */
  enrollLearnersButton: 'button.btn-primary',
  /** "+ Add Beta Testers" — the outline button beside it. */
  addBetaTestersButton: 'button.btn-outline-primary',
  /** The overflow icon button whose one item is "Check Enrollment Status". */
  checkEnrollmentStatusMenu: '#check-enrollment-status-menu',
  /** Enroll / Add Beta Testers modals: the identifiers textarea. */
  identifiersTextarea: 'textarea[name="identifier"]',
  /**
   * The two modal checkboxes, both checked by default: "Auto Enroll" then
   * "Notify Users by Email".
   */
  modalCheckbox: 'input[type="checkbox"]',
  /** Check Enrollment Status modal: the one text input and the primary button. */
  statusModalInput: 'input.form-control',
  statusModalCheckButton: '.pgn__modal-body button.btn-primary',
  /** The beta-tester filter above the table. */
  betaTesterFilter: 'select[name="isBetaTester"]',
  rowBetaTesterMenuButton: 'button.btn-icon',
  /** The popover the row menu opens; its single item grants or removes the role. */
  rowMenuPopover: '.popover .dropdown-item',

  // ---- Grading -----------------------------------------------------------
  /** "Single Learner" / "All Learners" — the two buttons of the toggle group, in that order. */
  gradingScopeGroup: '[role="group"].btn-group',
  /**
   * "Specify Learner": the form group holding `input[name=emailOrUsername]` and
   * its Select button. (The MFE's `specify-learner-field` test id exists only in
   * its unit tests, not in the rendered page.)
   */
  learnerField: '.pgn__form-group:has(input[name="emailOrUsername"])',
  learnerInput: 'input[name="emailOrUsername"]',
  /**
   * "Problem location": the form group whose text input has **no `name`** (only
   * a placeholder) — the one such input on the tab — and its Select button.
   */
  problemField: '.pgn__form-group:has(input[type="text"]:not([name]))',
  problemInput: 'input[type="text"]:not([name])',
  /** The Select button beside either field: the button inside the field container. */
  fieldSelectButton: 'button.btn-primary',
  /**
   * The action cards, in order. Single learner: Reset Attempts, Rescore
   * Submission (two buttons: rescore, rescore-if-higher), Override Score (a number
   * input + button), Delete History, Task Status. All learners: Reset Attempts,
   * Rescore Submission, Task Status. Only the action cards are `horizontal`
   * — the scope toggle above them is a plain `Card` and must not be counted.
   */
  actionCard: '.pgn__card.horizontal',
  actionCardButton: 'button.btn-primary',
  /** Override Score card: the new score. */
  overrideScoreInput: 'input[name="Score"]',
  /** Header: "View Gradebook" link, the overflow dropdown, and the Studio grading link. */
  gradebookLink: 'a.btn[href*="/gradebook/"]',
  studioGradingLink: 'a[target="_blank"][href*="/settings/grading"]',

  // ---- Date Extensions ---------------------------------------------------
  /** "+ Add Individual Extension" — the primary button beside the table controls. */
  addExtensionButton: 'button.btn-primary',
  /** Add-extension modal fields. */
  extensionLearnerInput: 'input[name="emailOrUsername"]',
  extensionSubsectionSelect: 'select[name="blockId"]',
  extensionDateInput: 'input[name="dueDate"]',
  extensionTimeInput: 'input[name="dueTime"]',
  extensionReasonInput: 'input[name="reason"]',
  /** Per row: "Reset" link-button in the last column, then a confirm modal. */
  rowResetExtensionButton: 'button.btn-link',

  // ---- Data Downloads ----------------------------------------------------
  /** The "Generate Reports" section heading (the one `id` the tab has). */
  generateReportsHeading: '#generate-reports',
  reportTab: (tabKey: string) => `[role="tab"][data-rb-event-key="${tabKey}"]`,
  /** The visible panel and its report rows' buttons, in `INSTRUCTOR_REPORT_ROWS` order. */
  activeReportPanel: '[role="tabpanel"].active',
  reportRowButton: 'button.btn-primary',
  /** The problem-location input in the Problem Responses row. */
  problemResponsesInput: '[role="tabpanel"].active input',
  /** "Available Reports" table: the download link-button in a row. */
  reportDownloadButton: 'button.btn-link.btn-sm',

  // ---- Certificates ------------------------------------------------------
  /**
   * Shown instead of the tab's tools when platform-wide certificate generation
   * is off ("Certificate management features are not enabled…").
   */
  certificatesDisabledAlert: '[role="alert"].alert-warning',
  /**
   * The two header buttons, in order: "Invalidate Certificate", then "Grant
   * Exception(s)". Both `.text-nowrap`, neither has an id.
   */
  certificatesHeaderButton: '.text-nowrap.btn',
  /** Issued / Generation History toggle and panels. */
  issuedTab: '#certificates-tab-issued',
  historyTab: '#certificates-tab-history',
  /** Toolbar: username/e-mail search, the status filter dropdown, "Regenerate Certificates". */
  certificatesSearchInput: 'input[name="searchfield-input"]',
  certificatesFilterDropdown: '#filter-dropdown',
  /** "Regenerate Certificates" ("Generate Certificates" while none exist) — the only `flex-shrink-0` outline button. */
  regenerateButton: 'button.btn-outline-primary.flex-shrink-0',
  /** Grant-exceptions modal: Individual / Bulk tabs, then the learner and notes fields. */
  grantExceptionsModal: '[role="dialog"].grant-exceptions-modal',
  grantExceptionsIndividualTab: '#grant-exceptions-tabs-tab-single',
  invalidateModal: '[role="dialog"].invalidate-certificate-modal',

  // ---- Cohorts -----------------------------------------------------------
  /**
   * While cohorts are off, the tab's only primary button is "Enable Cohorts";
   * once on, the first primary is "+ Add Cohort", beside the cohort picker
   * (`select[name="cohort"]`, option values are cohort ids).
   */
  cohortsPrimaryButton: 'button.btn-primary',
  cohortPicker: 'select[name="cohort"]',
  /**
   * The add-cohort form: the name input (the form's one non-radio input; it
   * carries no `type`), the assignment method radios (`random` / `manual`,
   * manual disabled until an automatic cohort exists), the content-group radios
   * (`noContentGroup` / `selectContentGroup`) and select (values are group ids),
   * and "Save" (the form's submit).
   */
  cohortForm: 'form:has(input[name="assignmentType"])',
  cohortNameInput: 'input:not([type="radio"])',
  cohortAssignment: (type: 'random' | 'manual') => `input[name="assignmentType"][value="${type}"]`,
  cohortContentGroupRadio: 'input[name="associatedContentGroup"][value="selectContentGroup"]',
  cohortContentGroupSelect: 'select[name="contentGroup"]',
  cohortFormSubmit: 'button[type="submit"]',
  /** The selected cohort's "add learners" textarea and its "Add Learners" button. */
  cohortLearnersInput: 'textarea',
  cohortLearnersSubmit: 'button.mt-2.btn-primary',
} as const;
