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
} as const;

export type Timeouts = typeof TIMEOUTS;
