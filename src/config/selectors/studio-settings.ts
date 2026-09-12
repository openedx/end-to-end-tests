/**
 * The authoring MFE's Settings pages: Schedule & Details and Grading.
 *
 * Measured on Tutor `main` (2026-09-08). Reached through the Studio URLs
 * `/settings/details/<key>` and `/settings/grading/<key>`, which the platform
 * redirects to the MFE (whose mount path differs by release, so nothing here
 * depends on it). The MFE puts test IDs on most Grading controls and on none of
 * the Schedule & Details ones, which are anchored by their stable `id`/`name`.
 */

/**
 * The "You've made some changes" bar both pages show once a field differs from
 * what was loaded, with the "Cancel" and "Save changes" actions. It stays mounted
 * with `aria-hidden` flipping, so callers judge a save by the response it causes,
 * not by the bar disappearing.
 */
export const STUDIO_SETTINGS_SAVE_BAR_SELECTORS = {
  /** The bar (a Paragon alert). Grading also tags it `grading-settings-save-alert`. */
  bar: '.alert[aria-labelledby="notification-warning-title"]',
  /** "Save changes" — the bar's stateful primary button. */
  saveButton: '.alert[aria-labelledby="notification-warning-title"] .pgn__stateful-btn',
  /** "Cancel" — reverts the unsaved edits. */
  cancelButton: '.alert[aria-labelledby="notification-warning-title"] .btn-tertiary',
} as const;

export const STUDIO_SCHEDULE_DETAILS_SELECTORS = {
  /** The "Course pacing" radio group (`name="selfPaced"`). */
  pacingRadio: 'input[type="radio"][name="selfPaced"]',
  /** "Instructor-paced" radio (`value="false"`). */
  instructorPacedRadio: 'input[type="radio"][name="selfPaced"][value="false"]',
  /** "Self-paced" radio (`value="true"`). */
  selfPacedRadio: 'input[type="radio"][name="selfPaced"][value="true"]',

  /** "Course start date" — text field, `MM/DD/YYYY`, UTC. */
  startDate: '#startDate-date',
  /** "Course start time" — text field, `HH:MM`, UTC. */
  startTime: '#startDate-time',
  endDate: '#endDate-date',
  endTime: '#endDate-time',
  enrollmentStartDate: '#enrollmentStart-date',
  enrollmentStartTime: '#enrollmentStart-time',
  enrollmentEndDate: '#enrollmentEnd-date',
  enrollmentEndTime: '#enrollmentEnd-time',
  /**
   * "Certificates available date" / time — rendered only when the target lets
   * the field show (`can_show_certificate_available_date_field`, off by default).
   */
  certificateAvailableDate: '#certificateAvailableDate-date',
  certificateAvailableTime: '#certificateAvailableDate-time',

  /** "Course language" dropdown toggle. */
  languageDropdown: '#languageDropdown',
  /** "Course short description" textarea. */
  shortDescription: 'textarea[name="shortDescription"]',

  /** Course card image: the drop zone's file input ("Upload course card image"). */
  courseImageFileInput: '.pgn__dropzone input[type="file"]',
  /** Course card image path field ("Your course image URL" placeholder). */
  courseImagePath: '.introducing-section input[placeholder="Your course image URL"]',
  /** "Course introduction video": the YouTube video-ID field. */
  introVideoId: '.introducing-section input[placeholder="YouTube video ID"]',
  /** The embedded preview the MFE renders for a set video ID. */
  introVideoFrame: '.introducing-section .introduction-video iframe',
  /** "Delete current video" — the only button in the video card's footer. */
  deleteIntroVideoButton: '.introducing-section .pgn__card-footer button.btn',

  /** "Hours of effort per week" (`HH:MM`). */
  effort: '.requirements-section input[placeholder="HH:MM"]',
  /** "Prerequisite course" dropdown toggle. */
  prerequisiteDropdown: '#prerequisiteDropdown',
  /** One entry of an open Paragon dropdown menu on this page. */
  dropdownItem: '.dropdown-menu.show .dropdown-item',
} as const;

export const STUDIO_GRADING_SELECTORS = {
  /** The "Overall grade range" editor. */
  scale: '.grading-scale',
  /** "Add new grading segment" (the `+` icon button). */
  addSegmentButton: '[data-testid="grading-scale-btn-add-segment"]',
  /**
   * One grade segment. The MFE renders one extra `segment--1` copy of the top
   * segment as a layout aid; `segment-0` upwards are the real ones, top grade
   * first, the failing bucket last (its name field is disabled).
   */
  segment: '[data-testid="grading-scale-segment"]:not(.segment--1)',
  /** A segment's letter/name field. */
  segmentNameInput: '[data-testid="grading-scale-segment-input"]',
  /** A segment's "lower - upper" range text. */
  segmentRange: '[data-testid="grading-scale-segment-number"]',
  /** A segment's "Remove" link (absent on the failing bucket). */
  segmentRemoveButton: '[data-testid="grading-scale-btn-remove"]',
  /**
   * The draggable boundary handles (`role="slider"`, `aria-valuenow` = the cutoff
   * in percent). One per segment; the fixed 100% handle is hidden and disabled.
   */
  segmentHandle: '.grading-scale-segment-btn-resize[role="slider"]:not([disabled])',

  /** "Grace period on deadline" (`HH:MM`). */
  gracePeriod: '[data-testid="deadline-period-input"]',

  /** One assignment type's card. */
  assignmentType: '.course-grading-assignment-wrapper',
  /** "Assignment type name". */
  assignmentTypeName: '[data-testid="assignment-type-name-input"]',
  /** "Abbreviation". */
  assignmentShortLabel: '[data-testid="assignment-shortLabel-input"]',
  /** "Weight of total grade" (percent). */
  assignmentWeight: '[data-testid="assignment-weight-input"]',
  /** "Total number". */
  assignmentMinCount: '[data-testid="assignment-minCount-input"]',
  /** "Number of droppable". */
  assignmentDropCount: '[data-testid="assignment-dropCount-input"]',
  /** The card's "Delete" button. */
  assignmentDeleteButton: '.course-grading-assignment-delete-btn',
  /**
   * "New assignment type" — the primary button that follows the assignment
   * cards; the save bar's own primary button is a stateful button, excluded.
   */
  addAssignmentTypeButton: '.grading button.btn-primary:not(.pgn__stateful-btn)',

  /** The save bar, as Grading tags it. */
  saveBar: '[data-testid="grading-settings-save-alert"]',
} as const;
