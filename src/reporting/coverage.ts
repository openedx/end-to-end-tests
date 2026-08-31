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

/**
 * How a case's coverage came out once every test mapped to it is taken together.
 *
 * A single status is not enough once a case is covered by several tests, which is
 * the normal shape here: a case usually has passing coverage *and* a `test.fixme`
 * holding the part that is blocked on an upstream defect. Collapsing that to the
 * worst status alone reports the whole case as skipped and hides the coverage that
 * does exist.
 */
export type CoverageVerdict =
  /** Every test mapped to the case passed. */
  | 'verified'
  /** Some passed, some did not run — usually a `fixme` for a known defect. */
  | 'partial'
  /** Nothing ran: every test was skipped or gated off. */
  | 'unverified'
  /** At least one test mapped to the case did not pass. */
  | 'failed';

/** A BTR case ID paired with the outcome of the test(s) that cover it. */
export interface TestIdOutcome {
  readonly testId: string;
  /**
   * Worst observed status across the case's tests. Retained as the single-value
   * summary; {@link verdict} and {@link counts} say what it is hiding.
   */
  readonly status: TestStatus;
  /** Rolled-up reading of the case's coverage. */
  readonly verdict: CoverageVerdict;
  /** How many of the case's tests ended in each status. */
  readonly counts: Readonly<Partial<Record<TestStatus, number>>>;
}

/** Tallies of {@link CoverageVerdict} across every mapped case. */
export type VerdictTotals = Readonly<Record<CoverageVerdict, number>>;

export interface CoverageSummary {
  /** Total tests seen (excluding the setup project, which the reporter filters). */
  readonly total: number;
  /** Tests carrying at least one `test_id` annotation. */
  readonly annotated: number;
  /** Tests with no `test_id` annotation. */
  readonly unannotated: number;
  /** `annotated / total`, or 1 when there are no tests. */
  readonly coverageRatio: number;
  /** Every mapped BTR case ID and how its coverage came out. */
  readonly byTestId: readonly TestIdOutcome[];
  /** How many cases fall into each verdict, for the run's headline. */
  readonly verdicts: VerdictTotals;
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

/** Statuses that mean the test ran and did not pass. */
const FAILING_STATUSES: readonly TestStatus[] = ['failed', 'timedOut', 'interrupted'];

/**
 * Reads a case's per-status counts as a verdict. A failure anywhere dominates;
 * otherwise it comes down to whether anything passed and whether anything was
 * held back.
 */
export function verdictFor(counts: Readonly<Partial<Record<TestStatus, number>>>): CoverageVerdict {
  if (FAILING_STATUSES.some((status) => (counts[status] ?? 0) > 0)) {
    return 'failed';
  }
  const passed = counts.passed ?? 0;
  const skipped = counts.skipped ?? 0;

  if (passed === 0) {
    return 'unverified';
  }
  return skipped > 0 ? 'partial' : 'verified';
}

/**
 * Aggregates per-test outcomes into a coverage summary: how many tests are mapped
 * to a BTR case, the outcome per case ID (worst wins if several tests share one),
 * and which tests are still unannotated.
 */
export function summarizeCoverage(outcomes: readonly TestOutcome[]): CoverageSummary {
  const byId = new Map<
    string,
    { status: TestStatus; counts: Partial<Record<TestStatus, number>> }
  >();
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
      if (existing) {
        existing.status = worst(existing.status, outcome.status);
        existing.counts[outcome.status] = (existing.counts[outcome.status] ?? 0) + 1;
      } else {
        byId.set(id, { status: outcome.status, counts: { [outcome.status]: 1 } });
      }
    }
  }

  const total = outcomes.length;
  const byTestId = [...byId.entries()]
    .map(([testId, { status, counts }]) => ({
      testId,
      status,
      verdict: verdictFor(counts),
      counts,
    }))
    .sort((a, b) => a.testId.localeCompare(b.testId));

  const verdicts: Record<CoverageVerdict, number> = {
    verified: 0,
    partial: 0,
    unverified: 0,
    failed: 0,
  };
  for (const entry of byTestId) {
    verdicts[entry.verdict] += 1;
  }

  return {
    total,
    annotated,
    unannotated: total - annotated,
    coverageRatio: total === 0 ? 1 : annotated / total,
    byTestId,
    verdicts,
    unannotatedTitles,
  };
}
