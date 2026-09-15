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

export const INSTRUCTOR_DASHBOARD_SELECTORS = {
  // ---- shell -------------------------------------------------------------
  /** The dashboard's content region; every tab renders inside it. */
  main: '#main-content',
  /** The tab navigation (a Paragon `Navbar`); its links are the tab ids' URLs. */
  tabNav: '#instructor-nav',
  /** The link of the tab currently shown. */
  activeTabLink: '#instructor-nav a.nav-link.active',
  /** Any Paragon modal the dashboard opens (all carry `role="dialog"`). */
  dialog: '[role="dialog"]',
  /** A modal's footer, whose last primary button is the confirming action. */
  dialogFooter: '.pgn__modal-footer',
  dialogPrimaryButton: '.pgn__modal-footer button.btn-primary',
  dialogSubmitButton: '.pgn__modal-footer button[type="submit"]',
  /** Any open Paragon dropdown menu and its items. */
  openDropdownMenu: '.dropdown-menu.show',
  dropdownItem: '.dropdown-item',
  /** A Paragon `DataTable` and its parts. */
  dataTable: '.pgn__data-table',
  dataTableRow: '.pgn__data-table tbody tr[role="row"]',
  dataTableEmpty: '.pgn__data-table-empty',
  dataTableControlBar: '[data-testid="table-control-bar"]',
  /** The "Pending Tasks" collapsible every tab appends (presence only). */
  pendingTasks: '.pgn_collapsible .collapsible-trigger',
  /** Inline field error under a learner / problem field ("Could not find …"). */
  fieldError: '.text-danger-500',

  // ---- Course Info -------------------------------------------------------
  /** The course card: org / course id / run spans, then the title and status. */
  courseInfoCard: '#main-content .pgn__card-section',
  courseInfoIdentifiers: '#main-content .pgn__card-section .x-small span',
  /**
   * The course status chip. Its variant class follows the API's
   * `has_started` / `has_ended`: `badge-success` ("Active"), `badge-warning`
   * ("Upcoming"), and another variant once ended.
   */
  courseStatusBadge: '#main-content .badge',
  courseStatusBadgeUpcoming: '#main-content .badge.badge-warning',
  courseStatusBadgeActive: '#main-content .badge.badge-success',
  /**
   * The enrollment counters ("All Enrollments", "Staff / Admin", "Learners",
   * then one per enrollment mode), each a `.flex-row` with the number in `p.lead`.
   */
  enrollmentCounter: '#main-content .pgn__hstack .flex-row',
  enrollmentCounterValue: 'p.lead',

  // ---- Enrollments -------------------------------------------------------
  /** "+ Enroll Learners" — the primary button in the tab header. */
  enrollLearnersButton: '#main-content button.btn-primary',
  /** "+ Add Beta Testers" — the outline button beside it. */
  addBetaTestersButton: '#main-content button.btn-outline-primary',
  /** The overflow icon button whose one item is "Check Enrollment Status". */
  checkEnrollmentStatusMenu: '#check-enrollment-status-menu',
  /** Enroll / Add Beta Testers modals: the identifiers textarea. */
  identifiersTextarea: '[role="dialog"] textarea[name="identifier"]',
  /**
   * The two modal checkboxes, both checked by default: "Auto Enroll" then
   * "Notify Users by Email".
   */
  modalCheckbox: '[role="dialog"] input[type="checkbox"]',
  /** Check Enrollment Status modal: the one text input and the primary button. */
  statusModalInput: '[role="dialog"] input.form-control',
  statusModalCheckButton: '[role="dialog"] .pgn__modal-body button.btn-primary',
  /** The beta-tester filter above the table. */
  betaTesterFilter: 'select[name="isBetaTester"]',
  /** Per row: "Unenroll" link-button and the beta-tester overflow icon button. */
  rowUnenrollButton: 'button.btn-link',
  rowBetaTesterMenuButton: 'button.btn-icon',
  /** The popover the row menu opens; its single item grants or removes the role. */
  rowMenuPopover: '.popover .dropdown-item',

  // ---- Grading -----------------------------------------------------------
  /** "Single Learner" / "All Learners" — the two buttons of the toggle group, in that order. */
  gradingScopeGroup: '#main-content [role="group"].btn-group',
  /** "Specify Learner" input (`data-testid` from the MFE) and its Select button. */
  learnerField: '[data-testid="specify-learner-field"]',
  learnerInput: 'input[name="emailOrUsername"]',
  /**
   * "Problem location" input (`data-testid` from the MFE); the input itself has
   * no `name`, only a placeholder.
   */
  problemField: '[data-testid="specify-problem-field"]',
  problemInput: '[data-testid="specify-problem-field"] input',
  /** The Select button beside either field: the button inside the field container. */
  fieldSelectButton: 'button.btn-primary',
  /**
   * The action cards, in order. Single learner: Reset Attempts, Rescore
   * Submission (two buttons: rescore, rescore-if-higher), Override Score (a number
   * input + button), Delete History, Task Status. All learners: Reset Attempts,
   * Rescore Submission, Task Status.
   */
  actionCard: '#main-content .pgn__card',
  actionCardButton: 'button.btn-primary',
  /** Override Score card: the new score. */
  overrideScoreInput: 'input[name="Score"]',
  /** Header: "View Gradebook" link, the overflow dropdown, and the Studio grading link. */
  gradebookLink: '#main-content a.btn[href*="/gradebook/"]',
  studioGradingLink: '#main-content a[target="_blank"][href*="/settings/grading"]',

  // ---- Date Extensions ---------------------------------------------------
  /** "+ Add Individual Extension" — the primary button beside the table controls. */
  addExtensionButton: '#main-content button.btn-primary',
  /** Add-extension modal fields. */
  extensionLearnerInput: '[role="dialog"] input[name="emailOrUsername"]',
  extensionSubsectionSelect: '[role="dialog"] select[name="blockId"]',
  extensionDateInput: '[role="dialog"] input[name="dueDate"]',
  extensionTimeInput: '[role="dialog"] input[name="dueTime"]',
  extensionReasonInput: '[role="dialog"] input[name="reason"]',
  /** Per row: "Reset" link-button in the last column, then a confirm modal. */
  rowResetExtensionButton: 'button.btn-link',

  // ---- Data Downloads ----------------------------------------------------
  /** The "Generate Reports" section heading (the one `id` the tab has). */
  generateReportsHeading: '#generate-reports',
  /** The report-group tabs; keyed by the non-localized `data-rb-event-key`. */
  reportTabList: '#main-content [role="tablist"]',
  reportTab: (tabKey: string) => `#main-content [role="tab"][data-rb-event-key="${tabKey}"]`,
  /** The visible panel and its report rows' buttons, in `INSTRUCTOR_REPORT_ROWS` order. */
  activeReportPanel: '#main-content [role="tabpanel"].active',
  reportRowButton: 'button.btn-primary',
  /** The problem-location input in the Problem Responses row. */
  problemResponsesInput: '#main-content [role="tabpanel"].active input',
  /** "Available Reports" table: the download link-button in a row. */
  reportDownloadButton: 'button.btn-link.btn-sm',

  // ---- Certificates ------------------------------------------------------
  /**
   * Shown instead of the tab's tools when platform-wide certificate generation
   * is off ("Certificate management features are not enabled…").
   */
  certificatesDisabledAlert: '#main-content [role="alert"].alert-warning',
  /** The header overflow menu; its item opens the "Student Generated Certificates" modal. */
  certificatesMoreMenu: '#certificates-more-menu',
  /** That modal's one checkbox: enable student-generated certificates for the course. */
  studentGeneratedCheckbox: '[role="dialog"] input[type="checkbox"]',
  /**
   * The two header buttons, in order: "Invalidate Certificate", then "Grant
   * Exception(s)". Both `.text-nowrap`, neither has an id.
   */
  certificatesHeaderButton: '#main-content .text-nowrap.btn',
  /** Issued / Generation History toggle and panels. */
  issuedTab: '#certificates-tab-issued',
  historyTab: '#certificates-tab-history',
  issuedPanel: '#certificates-tabpanel-issued',
  historyPanel: '#certificates-tabpanel-history',
  /** Toolbar: username/e-mail search, the status filter dropdown, "Regenerate Certificates". */
  certificatesSearchInput: 'input[name="searchfield-input"]',
  certificatesFilterDropdown: '#filter-dropdown',
  regenerateButton: '#main-content button.btn-outline-primary.text-nowrap',
  /** Grant-exceptions modal: Individual / Bulk tabs, then the learner and notes fields. */
  grantExceptionsModal: '[role="dialog"].grant-exceptions-modal',
  grantExceptionsIndividualTab: '#grant-exceptions-tabs-tab-single',
  invalidateModal: '[role="dialog"].invalidate-certificate-modal',
} as const;
