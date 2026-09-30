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

  /**
   * Budget for a heavy Studio content write to answer — a clipboard paste, which
   * re-stages a whole unit's or component's OLX under a new parent. Measured well
   * under `studioSettingsSave` on an idle install, but on the shared CI CMS a
   * paste under load was seen to run past 30 s, so it gets its own roomier budget
   * (a plain create still uses the shorter ones).
   */
  contentWrite: 60_000,

  /**
   * Budget for an authoring change to become visible to a learner. The LMS
   * serves learner-facing structure from the block-structure cache, rebuilt by a
   * Celery task the platform schedules with a countdown
   * (`BLOCK_STRUCTURES_SETTINGS.COURSE_PUBLISH_TASK_DELAY`, 30 s on Tutor);
   * measured lags on an idle install ran from about one second (publishing a
   * unit) to 29 s (a release-date or visibility change). CI shares one CMS
   * worker between this task, re-runs, exports and grading, so this is four
   * times the measured maximum. Every learner-side reading after an authoring
   * change polls under this budget; none of them waits a fixed time.
   */
  contentPublish: 120_000,

  /**
   * Budget for a component editor's Save to be answered (`POST /xblock/<id>` with
   * the block's content) — the CMS renders the block's author view in the same
   * request, which is slow on a busy worker.
   */
  xblockEditorSave: 30_000,

  /**
   * Budget for an instructor-dashboard background task (report generation,
   * rescore, score override, certificate generation) to finish and for its
   * effect to be readable. These run on the LMS Celery worker: measured on an
   * idle install, every report on a course of a few learners was listed within
   * a second of being queued, a rescore or override landed in about one second,
   * and a certificate reached `downloadable` in 2.3 s — but a per-learner report
   * on the 697-learner demo course took 3 min 43 s, and CI shares the worker
   * with grading and publishing. Suite courses hold a handful of learners, so
   * this is ample headroom; readings poll under it and report their last value.
   */
  instructorTask: 120_000,

  /**
   * Budget for a content-library item (block, unit, collection) to show up in
   * the library MFE's search results after it is created or edited. Library
   * search is Meilisearch, indexed by the CMS on write: on an idle install a
   * new block was searchable on the first poll, but CI's single Celery worker
   * also runs publishes, re-runs and exports, so this is headroom for the
   * indexing task to be picked up late. Readings poll under it.
   */
  librarySearch: 60_000,

  /**
   * Budget for a course block linked to a library item to report an update
   * (`ready_to_sync`) after the library item is published. Measured at 1.4 s on
   * an idle install (the link is recomputed on publish, synchronously enough);
   * the budget covers a loaded CMS. Readings poll under it.
   */
  librarySync: 30_000,

  /**
   * Budget for a legacy-library → v2-library migration task to reach a terminal
   * state. Runs on the CMS Celery worker: a two-block legacy library migrated
   * in 4.1 s when measured; sized like `courseRerun`, which shares the worker.
   */
  libraryMigration: 120_000,
  /**
   * The course Libraries "Review Content Updates" tab catching up with a
   * downstream that already reports `ready_to_sync` — it is fed by the
   * course-content search index, reindexed by Celery on publish. Measured
   * 2026-09-16 on Tutor `main`: ~30 s in a fresh course, past 60 s while other
   * publishes queue ahead of it (LIB-002); a reload-poll under this budget
   * passed at 4.8 min worst case.
   */
  libraryReviewIndex: 120_000,

  /**
   * Budget for a taxonomy import to reach a usable state — `POST
   * taxonomies/import/` returns the created taxonomy synchronously (measured
   * well under a second for an 8-tag file on an idle Studio), so this is headroom
   * for a busy CMS and the follow-up org assignment. Sized like `studioSetup`
   * because it runs once per worker at fixture setup.
   */
  taxonomyImport: 60_000,
} as const;
