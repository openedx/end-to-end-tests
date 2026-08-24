/**
 * Pure aggregation logic for the BTR coverage reporter, kept free of Playwright
 * types so it can be unit-tested without a runner. The thin reporter in
 * `coverage-reporter.ts` adapts Playwright's events onto these shapes.
 */

/** Outcome of a single test, normalized from Playwright's status vocabulary. */
export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/** One test's contribution to the report: its title and any mapped BTR case IDs. */
export interface TestOutcome {
  readonly title: string;
  readonly status: TestStatus;
  readonly testIds: readonly string[];
}

/** A BTR case ID paired with the outcome of the test(s) that cover it. */
export interface TestIdOutcome {
  readonly testId: string;
  readonly status: TestStatus;
}

export interface CoverageSummary {
  /** Total tests seen (excluding the setup project, which the reporter filters). */
  readonly total: number;
  /** Tests carrying at least one `test_id` annotation. */
  readonly annotated: number;
  /** Tests with no `test_id` annotation. */
  readonly unannotated: number;
  /** `annotated / total`, or 1 when there are no tests. */
  readonly coverageRatio: number;
  /** Every mapped BTR case ID and its worst observed outcome. */
  readonly byTestId: readonly TestIdOutcome[];
  /** Titles of tests with no `test_id`, so gaps are easy to close. */
  readonly unannotatedTitles: readonly string[];
}

/** Ordering used to collapse multiple outcomes for one case ID to the worst one. */
const STATUS_SEVERITY: Record<TestStatus, number> = {
  passed: 0,
  skipped: 1,
  interrupted: 2,
  timedOut: 3,
  failed: 4,
};

function worst(a: TestStatus, b: TestStatus): TestStatus {
  return STATUS_SEVERITY[b] > STATUS_SEVERITY[a] ? b : a;
}

/**
 * Aggregates per-test outcomes into a coverage summary: how many tests are mapped
 * to a BTR case, the outcome per case ID (worst wins if several tests share one),
 * and which tests are still unannotated.
 */
export function summarizeCoverage(outcomes: readonly TestOutcome[]): CoverageSummary {
  const byId = new Map<string, TestStatus>();
  const unannotatedTitles: string[] = [];
  let annotated = 0;

  for (const outcome of outcomes) {
    if (outcome.testIds.length === 0) {
      unannotatedTitles.push(outcome.title);
      continue;
    }
    annotated += 1;
    for (const id of outcome.testIds) {
      const existing = byId.get(id);
      byId.set(id, existing ? worst(existing, outcome.status) : outcome.status);
    }
  }

  const total = outcomes.length;
  const byTestId = [...byId.entries()]
    .map(([testId, status]) => ({ testId, status }))
    .sort((a, b) => a.testId.localeCompare(b.testId));

  return {
    total,
    annotated,
    unannotated: total - annotated,
    coverageRatio: total === 0 ? 1 : annotated / total,
    byTestId,
    unannotatedTitles,
  };
}
