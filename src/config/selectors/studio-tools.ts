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
  /** The dropzone's react-dropzone `<input type=file>`, which takes the upload. */
  fileInput: '[data-testid="dropzone"] input[type="file"]',
  /** One step of the import progress stepper (five for an import). */
  step: '.import [data-testid="course-stepper__step"]',
  /** The "View course outline" button the MFE reveals once the import succeeds. */
  successButton: '.import section button.btn',
} as const;

/** A stepper step carries this class once its stage completes. */
export const STUDIO_STEPPER_STATE = { done: 'done' } as const;

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
