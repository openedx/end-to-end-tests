/**
 * The authoring MFE's Tools pages: Export, Import and the two Checklists, reached
 * through the Studio URLs `/export/<key>`, `/import/<key>` and `/checklists/<key>`
 * (which redirect to the MFE, whose mount path differs by release, so nothing
 * here depends on it).
 *
 * These pages carry almost no `data-testid`s, so anchors are the stable layout
 * classes (`.export`, `.import`) and the shared course-stepper structure. Never
 * the step titles or button labels — those are localized.
 */

export const STUDIO_EXPORT_SELECTORS = {
  /** The export page container — marks the MFE route as rendered. */
  page: '.export',
  /** The "Export course content" trigger: the card's full-width action button. */
  startButton: '.export button.btn-block',
  /** One step of the export progress stepper (four for an export). */
  step: '.export [data-testid="course-stepper__step"]',
  /** The finished-tarball download control — the anchor to the export output. */
  downloadLink: '.export a[href*="/export_output/"]',
} as const;

export const STUDIO_IMPORT_SELECTORS = {
  /** The import page container — marks the MFE route as rendered. */
  page: '.import',
  /** The dropzone; its react-dropzone `<input type=file>` takes the upload. */
  dropzone: '[data-testid="dropzone"]',
  fileInput: '[data-testid="dropzone"] input[type="file"]',
  /** One step of the import progress stepper (five for an import). */
  step: '.import [data-testid="course-stepper__step"]',
  /** The upload-percent readout, shown while the first (upload) step runs. */
  stepPercent: '.import [data-testid="course-stepper__step-percent"]',
  /** The "View course outline" button the MFE reveals once the import succeeds. */
  successButton: '.import section button.btn',
} as const;

/** A stepper step carries `done` once its stage completes; `error` on failure. */
export const STUDIO_STEPPER_STATE = { done: 'done', active: 'active', error: 'error' } as const;

export const STUDIO_CHECKLISTS_SELECTORS = {
  /**
   * The "N of M completed" subheader each checklist section renders once loaded;
   * present for the Launch checklist, so it marks the page as ready.
   */
  ready: '[data-testid="completion-subheader"]',
  /** One checklist item row, keyed on the platform's item id (e.g. `courseDates`). */
  item: (id: string) => `[data-testid="checklist-item-${id}"]`,
  /** The class a row carries only when the item is complete. */
  completeClass: 'checklist-item-complete',
  /** A row's completed marker icon — present only when the item is complete. */
  completedIcon: (id: string) =>
    `[data-testid="checklist-item-${id}"] [data-testid="completed-icon"]`,
} as const;

/** The Launch checklist's item ids (`assignmentDeadlines` is instructor-paced only). */
export const LAUNCH_CHECKLIST_ITEMS = [
  'welcomeMessage',
  'gradingPolicy',
  'certificate',
  'courseDates',
  'assignmentDeadlines',
  'proctoringEmail',
] as const;

/** The Best-practices checklist's item ids (`weeklyHighlights` is self-paced only). */
export const BEST_PRACTICES_CHECKLIST_ITEMS = [
  'videoDuration',
  'diverseSequences',
  'weeklyHighlights',
  'unitDepth',
] as const;
