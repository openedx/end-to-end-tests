/**
 * Pure aggregation for the BTR **run detail** report, free of Playwright types so
 * it can be unit-tested without a runner. The thin reporter in
 * `btr-run-reporter.ts` adapts Playwright's events onto these shapes and writes
 * `test-results/btr-run.json`; the sheet publisher (`scripts/`) reads that file
 * and nothing else from the run.
 *
 * Where `coverage.ts` answers "which BTR cases did this run exercise, and how did
 * each come out", this module keeps everything the results sheet also needs per
 * case: the specs that drive it, per-test timing and retries, and a human-readable
 * note saying why a test was skipped, held back, or failed.
 */

import {
  verdictFor,
  type CoverageVerdict,
  type TestAttempt,
  type TestStatus,
  type VerdictTotals,
} from './coverage';
import { ISSUE_ANNOTATION_TYPE } from './issue';
import { KNOWN_GAP_ANNOTATION_TYPE } from './known-gap';

/** A test annotation as Playwright reports it. */
export interface Annotation {
  readonly type: string;
  readonly description?: string;
}

/**
 * One attempt of one test, with everything the run report needs from it.
 * Several attempts share a `testKey` when a test is retried.
 */
export interface RunAttempt extends TestAttempt {
  /** Spec path relative to the repo root (the config directory), posix separators. */
  readonly spec: string;
  /** Playwright project the test ran in (`smoke`, `studio-author`, …). */
  readonly project: string;
  /** Playwright's own status for the attempt, before `test.fail()` normalisation. */
  readonly rawStatus: TestStatus;
  /** What Playwright expected (`failed` for a `test.fail()` test, `skipped` for a fixme). */
  readonly expectedStatus: TestStatus;
  readonly durationMs: number;
  readonly annotations: readonly Annotation[];
  /** First line of the failure message, ANSI stripped. Absent when the attempt passed. */
  readonly errorMessage?: string;
  /** Accessibility violations that failed the `checkA11y` gate, as `id (impact): help`. */
  readonly a11yFailures: readonly string[];
}

/** One test's final outcome in the run, with the note the sheet shows for it. */
export interface RunTest {
  readonly title: string;
  readonly spec: string;
  readonly project: string;
  readonly testIds: readonly string[];
  readonly status: TestStatus;
  /** Sum of all attempts' durations, so retries count against the case's time. */
  readonly durationMs: number;
  /** How many times the test ran; more than one means it was retried. */
  readonly attempts: number;
  /** Why the test was skipped / held back / failed. Empty when it passed cleanly. */
  readonly note: string;
}

/** One BTR case row: every test mapped to it, rolled up. */
export interface RunCase {
  readonly testId: string;
  readonly verdict: CoverageVerdict;
  readonly specs: readonly string[];
  readonly projects: readonly string[];
  readonly tests: readonly RunTest[];
  readonly durationMs: number;
  readonly attempts: number;
}

/** Run metadata that only exists in CI. `null` for a local run. */
export interface CiMeta {
  readonly runId: string;
  readonly runAttempt: string;
  readonly runUrl: string;
  readonly repository: string;
  readonly workflow: string;
  readonly eventName: string;
  /** Branch/tag the suite was checked out from (the tested ref, not the workflow's). */
  readonly ref: string;
  readonly sha: string;
  /** Open edX release the target runs (`main`, `verawood`, …) when the workflow knows it. */
  readonly release: string | null;
}

export interface RunMeta {
  readonly startedAt: string;
  readonly durationMs: number;
  /** Playwright's verdict for the whole run. */
  readonly status: 'passed' | 'failed' | 'timedout' | 'interrupted';
  readonly lmsBaseUrl: string | null;
  /** What narrowed the run, so a partial run is obviously partial. Empty strings = nothing. */
  readonly filter: {
    readonly paths: readonly string[];
    readonly grep: string;
    readonly grepInvert: string;
  };
  readonly ci: CiMeta | null;
}

export interface RunTotals {
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  /** Tests that passed only after a retry (a subset of `passed`). */
  readonly flaky: number;
  readonly annotated: number;
  readonly unannotated: number;
}

export interface BtrRun {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly run: RunMeta;
  readonly totals: RunTotals;
  readonly verdicts: VerdictTotals;
  readonly cases: readonly RunCase[];
  /** Every test the run saw (infrastructure projects excluded), for the artifact. */
  readonly tests: readonly RunTest[];
}

export const BTR_RUN_SCHEMA_VERSION = 1;

/** How much of an error message the sheet shows. */
const ERROR_SNIPPET_LENGTH = 200;

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/** Trims a Playwright error to its first meaningful line, without colour codes. */
export function errorSnippet(message: string): string {
  const firstLine =
    message
      .replace(ANSI_PATTERN, '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';
  return firstLine.length > ERROR_SNIPPET_LENGTH
    ? `${firstLine.slice(0, ERROR_SNIPPET_LENGTH - 1)}…`
    : firstLine;
}

function descriptionOf(annotations: readonly Annotation[], type: string): string | undefined {
  return annotations.find((a) => a.type === type && a.description)?.description;
}

/** The reason a test was held back, from the most to the least specific source. */
function holdBackReason(annotations: readonly Annotation[]): string {
  const reason =
    descriptionOf(annotations, KNOWN_GAP_ANNOTATION_TYPE) ??
    descriptionOf(annotations, 'fixme') ??
    descriptionOf(annotations, 'skip');
  const issue = descriptionOf(annotations, ISSUE_ANNOTATION_TYPE);
  const parts = [reason, issue].filter((p): p is string => p !== undefined);
  return parts.join(' — ');
}

/**
 * Builds the note the sheet shows for a test, from its final attempt and how many
 * attempts it took. One line; empty when the test passed first time with nothing
 * to say.
 */
export function noteFor(final: RunAttempt, attempts: number): string {
  const { annotations } = final;
  const isFixme = annotations.some((a) => a.type === 'fixme');

  if (final.expectedStatus === 'failed') {
    const why = holdBackReason(annotations);
    if (final.rawStatus === 'passed') {
      return 'UNEXPECTED PASS — stale test.fail marker; the known defect appears fixed';
    }
    return `expected failure (known defect)${why ? `: ${why}` : ''}`;
  }

  if (final.rawStatus === 'skipped') {
    const why = holdBackReason(annotations);
    if (isFixme) {
      return why ? `fixme: ${why}` : 'fixme (no reason recorded)';
    }
    return why ? `skipped: ${why}` : 'skipped (no reason recorded)';
  }

  if (final.rawStatus === 'interrupted') {
    return 'interrupted (run aborted)';
  }

  if (final.rawStatus === 'timedOut' || final.rawStatus === 'failed') {
    const label = final.rawStatus === 'timedOut' ? 'timed out' : 'failed';
    const a11y = final.a11yFailures.length > 0 ? `a11y: ${final.a11yFailures.join('; ')}` : '';
    const error = final.errorMessage ? errorSnippet(final.errorMessage) : '';
    const detail = a11y || error;
    return detail ? `${label}: ${detail}` : label;
  }

  if (attempts > 1) {
    return `flaky: passed on attempt ${attempts}`;
  }
  return '';
}

/**
 * Collapses attempts to one {@link RunTest} per test: the last attempt decides
 * the status and the note (as Playwright itself reports, and as `finalAttempts`
 * does for coverage), every attempt's time counts. Order of first appearance is
 * preserved.
 */
export function finalTests(attempts: readonly RunAttempt[]): RunTest[] {
  const byKey = new Map<string, { last: RunAttempt; count: number; durationMs: number }>();
  for (const attempt of attempts) {
    const acc = byKey.get(attempt.testKey);
    if (acc) {
      acc.last = attempt;
      acc.count += 1;
      acc.durationMs += attempt.durationMs;
    } else {
      byKey.set(attempt.testKey, { last: attempt, count: 1, durationMs: attempt.durationMs });
    }
  }
  return [...byKey.values()].map(({ last, count, durationMs }) => ({
    title: last.title,
    spec: last.spec,
    project: last.project,
    testIds: last.testIds,
    status: last.status,
    durationMs,
    attempts: count,
    note: noteFor(last, count),
  }));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Groups final tests by BTR case ID: one row per case, sorted by ID. */
export function casesFrom(tests: readonly RunTest[]): RunCase[] {
  const byId = new Map<string, RunTest[]>();
  for (const t of tests) {
    for (const id of t.testIds) {
      const list = byId.get(id) ?? [];
      list.push(t);
      byId.set(id, list);
    }
  }
  return [...byId.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([testId, caseTests]) => {
      const counts: Partial<Record<TestStatus, number>> = {};
      for (const t of caseTests) {
        counts[t.status] = (counts[t.status] ?? 0) + 1;
      }
      return {
        testId,
        verdict: verdictFor(counts),
        specs: unique(caseTests.map((t) => t.spec)),
        projects: unique(caseTests.map((t) => t.project)),
        tests: caseTests,
        durationMs: caseTests.reduce((sum, t) => sum + t.durationMs, 0),
        attempts: caseTests.reduce((sum, t) => sum + t.attempts, 0),
      };
    });
}

/** Tallies the run's headline numbers. */
export function totalsFrom(tests: readonly RunTest[]): RunTotals {
  const totals = {
    tests: tests.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    annotated: 0,
    unannotated: 0,
  };
  for (const t of tests) {
    if (t.status === 'passed') {
      totals.passed += 1;
      if (t.attempts > 1) {
        totals.flaky += 1;
      }
    } else if (t.status === 'skipped') {
      totals.skipped += 1;
    } else {
      totals.failed += 1;
    }
    if (t.testIds.length > 0) {
      totals.annotated += 1;
    } else {
      totals.unannotated += 1;
    }
  }
  return totals;
}

function verdictTotals(cases: readonly RunCase[]): VerdictTotals {
  const verdicts: Record<CoverageVerdict, number> = {
    verified: 0,
    partial: 0,
    unverified: 0,
    failed: 0,
  };
  for (const c of cases) {
    verdicts[c.verdict] += 1;
  }
  return verdicts;
}

/** Assembles the full report from the run's attempts and metadata. */
export function summarizeRun(
  attempts: readonly RunAttempt[],
  run: RunMeta,
  generatedAt: string = new Date().toISOString(),
): BtrRun {
  const tests = finalTests(attempts);
  const cases = casesFrom(tests);
  return {
    schemaVersion: BTR_RUN_SCHEMA_VERSION,
    generatedAt,
    run,
    totals: totalsFrom(tests),
    verdicts: verdictTotals(cases),
    cases,
    tests,
  };
}

/** The GitHub Actions variables the run metadata is read from. */
export interface CiEnv {
  readonly GITHUB_ACTIONS?: string;
  readonly GITHUB_RUN_ID?: string;
  readonly GITHUB_RUN_ATTEMPT?: string;
  readonly GITHUB_SERVER_URL?: string;
  readonly GITHUB_REPOSITORY?: string;
  readonly GITHUB_WORKFLOW?: string;
  readonly GITHUB_EVENT_NAME?: string;
  readonly GITHUB_REF_NAME?: string;
  readonly GITHUB_SHA?: string;
  /** Set by the workflows when a `test_ref` other than the workflow's branch was checked out. */
  readonly BTR_TEST_REF?: string;
  readonly OPENEDX_RELEASE?: string;
}

/**
 * Reads CI run metadata from the environment. Returns `null` outside GitHub
 * Actions so a local run is unmistakable in the report. `sha` prefers the value
 * of the checked-out commit when the caller resolved one (a `test_ref` run tests
 * a different commit from `GITHUB_SHA`).
 */
export function ciMetaFromEnv(env: CiEnv, checkedOutSha?: string): CiMeta | null {
  if (env.GITHUB_ACTIONS !== 'true' || !env.GITHUB_RUN_ID) {
    return null;
  }
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const repository = env.GITHUB_REPOSITORY ?? '';
  const runId = env.GITHUB_RUN_ID;
  return {
    runId,
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? '1',
    runUrl: `${server}/${repository}/actions/runs/${runId}`,
    repository,
    workflow: env.GITHUB_WORKFLOW ?? '',
    eventName: env.GITHUB_EVENT_NAME ?? '',
    ref: env.BTR_TEST_REF || env.GITHUB_REF_NAME || '',
    sha: checkedOutSha || env.GITHUB_SHA || '',
    release: env.OPENEDX_RELEASE || null,
  };
}
