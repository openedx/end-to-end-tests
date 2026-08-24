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
} as const;

export type Timeouts = typeof TIMEOUTS;
