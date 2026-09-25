import type { ReporterDescription } from '@playwright/test';

/**
 * The suite's reporters, shared by `playwright.config.ts` (a run) and
 * `merge.config.ts` (`playwright merge-reports`, which combines the blob
 * reports of sharded CI runs). Keeping one list means a merged report is built
 * by exactly the reporters a single run uses, so its files have the same
 * shape. Paths resolve from the config file's directory, the repository root
 * for both.
 */
export const SUITE_REPORTERS: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never' }],
  ['./src/reporting/coverage-reporter.ts'],
  ['./src/reporting/btr-run-reporter.ts'],
  ['./src/reporting/a11y-reporter.ts'],
  ['./src/reporting/timing-reporter.ts'],
];
