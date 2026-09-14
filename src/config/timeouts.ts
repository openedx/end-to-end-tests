/**
 * Centralized timeout budgets, in milliseconds.
 *
 * Every wait in the suite derives from one of these named constants — there are
 * no fixed `sleep`/`waitForTimeout` calls (ADR-0002, stability rules). Adjusting
 * a category here changes it everywhere, and each value is justified so it can be
 * reviewed rather than copy-pasted.
 */
export const TIMEOUTS = {
  /** Whole-test budget. */
  test: 60_000,

  /** A single web-first assertion (`expect(...)`) retry budget. */
  expect: 10_000,

  /** A single action (click, fill, press) budget. */
  action: 15_000,

  /** A navigation (`goto`, `waitForURL`) budget - MFEs can be slow to hydrate. */
  navigation: 30_000,

  /**
   * Budget for one content block to register completion after it is brought into
   * view. The platform marks an HTML block complete only after it has been
   * visible for its own dwell delay (`data-mark-completed-on-view-after-delay`,
   * 5s on a default install), so this must comfortably exceed that delay plus the
   * round trip of the resulting completion call.
   */
  blockCompletion: 20_000,

  /**
   * How long to give an overlay that may never come before deciding it will not.
   * The course-home tour dialog mounts only after the outline's own user-tour
   * request resolves, and only for a first visit, so a page object cannot assert
   * it into existence: it waits this long for it and otherwise moves on. Kept
   * short because every returning-user visit pays the full budget.
   */
  optionalOverlay: 5_000,

  /**
   * Whole-test budget for the spec that works through an entire course. Every
   * HTML block costs the platform's dwell delay, so this scales with the course:
   * the demo course's 264 HTML blocks alone account for around 22 minutes.
   */
  courseCrawlTest: 2_700_000,

  /**
   * Whole-test budget for specs that work through course content. View-based
   * completion costs the platform's dwell delay per block, so a spec covering a
   * handful of units takes minutes rather than seconds.
   */
  contentTest: 300_000,

  /**
   * Budget for a Studio course re-run to finish. The copy runs as a Celery task
   * on the CMS worker; an empty course takes a few seconds, a populated one
   * proportionally longer.
   */
  courseRerun: 120_000,

  /**
   * Budget for a course export or import task to reach its terminal state. Both
   * run on the CMS worker; the export of an empty course took about two seconds
   * when measured, so this is headroom for a populated course and a busy worker.
   */
  courseTransfer: 180_000,

  /**
   * Budget for the worker-scoped course fixture (`authoredCourse`) to provision
   * its course: one Studio API call plus the search that makes it idempotent.
   */
  studioSetup: 60_000,

  /**
   * Budget for a Studio settings page to answer the write its save bar triggers
   * (`PUT course_details`, `POST course_grading`). Comfortably above `action`
   * because several authoring workers save at once on a shared CMS, and the save
   * button is a stateful control that mounts with the save bar.
   */
  studioSettingsSave: 30_000,
} as const;
