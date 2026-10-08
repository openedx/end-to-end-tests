import type { ReporterDescription } from '@playwright/test';

/**
 * The suite's reporters, shared by `playwright.config.ts` (a run) and
 * `merge.config.ts` (`playwright merge-reports`, which combines the blob
 * reports of sharded CI runs). Keeping one list means a merged report is built
 * by exactly the reporters a single run uses, so its files have the same
 * shape. Paths resolve from the config file's directory, the repository root
 * for both.
 */
const BASE_REPORTERS: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never' }],
  ['./src/reporting/coverage-reporter.ts'],
  ['./src/reporting/btr-run-reporter.ts'],
  ['./src/reporting/a11y-reporter.ts'],
  ['./src/reporting/timing-reporter.ts'],
];

/**
 * Playwright's JUnit reporter, appended when `PLAYWRIGHT_JUNIT_OUTPUT_FILE` is set.
 *
 * CI systems that read JUnit XML to populate a test tab (GitLab, Jenkins, CircleCI)
 * need it in the reporter list. `--reporter=junit` on the command line would *replace*
 * the whole list, silently stopping the BTR, a11y and timing reporters from producing
 * anything, so the choice is made here instead: every consumer gets a machine-readable
 * result by setting one variable, and none has to know what else this list declares.
 *
 * Declared here rather than in `playwright.config.ts` so that a merge
 * (`merge.config.ts`) writes it too — across shards, the merged report is the one worth
 * reporting, and a per-shard JUnit file would describe only part of the run.
 */
function junitReporter(): ReporterDescription[] {
  const outputFile = process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE;
  // Playwright's junit reporter reads the same variable for its path; passing it
  // explicitly keeps the dependency visible rather than implicit.
  return outputFile ? [['junit', { outputFile }]] : [];
}

export const SUITE_REPORTERS: ReporterDescription[] = [...BASE_REPORTERS, ...junitReporter()];
