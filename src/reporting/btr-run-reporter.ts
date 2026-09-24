import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

import { A11Y_ATTACHMENT_PREFIX, describeA11yViolation, parseA11yAttachment } from './a11y';
import { ciMetaFromEnv, summarizeRun, type RunAttempt, type RunMeta } from './btr-run';
import { normalizeStatus } from './coverage';
import { profileOf, projectOf, shardOf } from './project';
import { testIdsFromAnnotations } from './test-id';

export interface BtrRunReporterOptions {
  /** Where to write the JSON report. Relative paths resolve from the config dir. */
  readonly outputFile?: string;
  /**
   * Projects excluded from the report — infrastructure, not BTR scenarios.
   * Defaults to the setup and node-only unit projects.
   */
  readonly excludeProjects?: readonly string[];
}

const DEFAULT_OUTPUT = 'test-results/btr-run.json';
const DEFAULT_EXCLUDED = ['setup', 'unit'];

/** Playwright's default grep, which means "no filter". */
const MATCH_ALL = '/.*/';

function grepToString(grep: RegExp | RegExp[] | null | undefined): string {
  if (!grep) {
    return '';
  }
  const text = (Array.isArray(grep) ? grep : [grep]).map(String).join(' ');
  return text === MATCH_ALL ? '' : text;
}

/**
 * The commit actually checked out, which is what a `test_ref` run tests. Falls
 * back to nothing (the caller then uses `GITHUB_SHA`) when git is unavailable.
 */
function checkedOutSha(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Always-on reporter that records the run's BTR-relevant detail — per-test spec,
 * timing, retries, a why-note, and the run's metadata — to
 * `test-results/btr-run.json`. It writes a local file only; the sheet publisher
 * in `scripts/` reads that file in CI (reporting policy in `README.md`).
 *
 * Infrastructure projects (setup, unit) are excluded, as in `CoverageReporter`.
 */
export default class BtrRunReporter implements Reporter {
  private readonly outputFile: string;
  private readonly excluded: ReadonlySet<string>;
  private readonly attempts: RunAttempt[] = [];
  private configDir = process.cwd();
  private filter: RunMeta['filter'] = { paths: [], grep: '', grepInvert: '' };

  constructor(options: BtrRunReporterOptions = {}) {
    this.outputFile = options.outputFile ?? DEFAULT_OUTPUT;
    this.excluded = new Set(options.excludeProjects ?? DEFAULT_EXCLUDED);
  }

  onBegin(config: FullConfig): void {
    this.configDir = dirname(config.configFile ?? process.cwd());
    this.filter = {
      // Positional CLI paths are not exposed on FullConfig; the workflows pass
      // them through the DOMAINS variable that the run-suite action reads.
      paths: (process.env.DOMAINS ?? '').split(/\s+/).filter(Boolean),
      grep: grepToString(config.grep),
      grepInvert: grepToString(config.grepInvert),
    };
  }

  /** Fires once per **attempt**; `summarizeRun` collapses retries per `test.id`. */
  onTestEnd(test: TestCase, result: TestResult): void {
    const project = projectOf(test);
    if (this.excluded.has(project?.name ?? '')) {
      return;
    }

    const a11yFailures: string[] = [];
    for (const attachment of result.attachments) {
      if (!attachment.name.startsWith(A11Y_ATTACHMENT_PREFIX) || !attachment.body) {
        continue;
      }
      const parsed = parseA11yAttachment(attachment.body.toString('utf8'));
      for (const v of parsed?.failing ?? []) {
        a11yFailures.push(describeA11yViolation(v));
      }
    }

    this.attempts.push({
      testKey: test.id,
      title: test.titlePath().slice(1).join(' › '),
      spec: relative(this.configDir, test.location.file).split('\\').join('/'),
      project: project?.name ?? '',
      profile: profileOf(project),
      shard: shardOf(project),
      testIds: testIdsFromAnnotations(test.annotations),
      status: normalizeStatus(test.expectedStatus, result.status),
      rawStatus: result.status,
      expectedStatus: test.expectedStatus,
      durationMs: result.duration,
      annotations: test.annotations.map(({ type, description }) => ({ type, description })),
      ...(result.error?.message ? { errorMessage: result.error.message } : {}),
      a11yFailures,
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const run: RunMeta = {
      startedAt: result.startTime.toISOString(),
      durationMs: Math.round(result.duration),
      status: result.status,
      lmsBaseUrl: process.env.LMS_BASE_URL ?? null,
      filter: this.filter,
      ci: ciMetaFromEnv(process.env, checkedOutSha(this.configDir)),
    };
    const report = summarizeRun(this.attempts, run);

    const path = isAbsolute(this.outputFile)
      ? this.outputFile
      : resolve(this.configDir, this.outputFile);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(report, null, 2), 'utf8');

    const { passed, failed, skipped, flaky } = report.totals;
    console.log(
      `\n[btr-run] ${report.cases.length} BTR case(s) across ${report.totals.tests} test(s) — ` +
        `${passed} passed, ${failed} failed, ${skipped} skipped, ${flaky} flaky; ` +
        `${Math.round(run.durationMs / 1000)}s. Wrote ${this.outputFile}.`,
    );
  }
}
