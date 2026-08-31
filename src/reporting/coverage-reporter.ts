import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

import { summarizeCoverage, type TestOutcome } from './coverage';
import { testIdsFromAnnotations } from './test-id';

export interface CoverageReporterOptions {
  /** Where to write the JSON mapping. Relative paths resolve from the config dir. */
  readonly outputFile?: string;
  /**
   * Projects excluded from coverage — infrastructure, not BTR scenarios. Defaults
   * to the setup and node-only unit projects.
   */
  readonly excludeProjects?: readonly string[];
}

const DEFAULT_OUTPUT = 'test-results/btr-coverage.json';
const DEFAULT_EXCLUDED = ['setup', 'unit'];

/** Finds the enclosing project's name for a test, walking up the suite tree. */
function projectNameOf(test: TestCase): string {
  let suite: Suite | undefined = test.parent;
  while (suite) {
    const project = suite.project?.();
    if (project) {
      return project.name;
    }
    suite = suite.parent;
  }
  return '';
}

/**
 * Always-on reporter that maps every annotated test to its BTR case ID and its
 * outcome, and reports annotation **coverage** (annotated vs. unannotated) each
 * run. It writes a local JSON file only — uploading it is a CI-only concern and
 * writing to the BTR sheet is a separate, manual, opt-in step (reporting policy).
 *
 * Infrastructure projects (setup, unit) are excluded so coverage reflects the
 * user-facing scenarios the BTR plan tracks.
 */
export default class CoverageReporter implements Reporter {
  private readonly outputFile: string;
  private readonly excluded: ReadonlySet<string>;
  private readonly outcomes: TestOutcome[] = [];
  private configDir = process.cwd();

  constructor(options: CoverageReporterOptions = {}) {
    this.outputFile = options.outputFile ?? DEFAULT_OUTPUT;
    this.excluded = new Set(options.excludeProjects ?? DEFAULT_EXCLUDED);
  }

  onBegin(config: FullConfig): void {
    this.configDir = dirname(config.configFile ?? process.cwd());
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (this.excluded.has(projectNameOf(test))) {
      return;
    }
    this.outcomes.push({
      title: test.titlePath().slice(1).join(' › '),
      status: result.status,
      testIds: testIdsFromAnnotations(test.annotations),
    });
  }

  async onEnd(): Promise<void> {
    const summary = summarizeCoverage(this.outcomes);

    const path = isAbsolute(this.outputFile)
      ? this.outputFile
      : resolve(this.configDir, this.outputFile);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({ generatedAt: new Date().toISOString(), ...summary }, null, 2),
      'utf8',
    );

    const pct = Math.round(summary.coverageRatio * 100);
    const { verified, partial, unverified, failed } = summary.verdicts;
    console.log(
      `\n[btr-coverage] ${summary.annotated}/${summary.total} tests carry a test_id ` +
        `(${pct}% annotated); ${summary.byTestId.length} BTR case(s) exercised — ` +
        `${verified} verified, ${partial} partial, ${unverified} unverified, ${failed} failed. ` +
        `Wrote ${this.outputFile}.`,
    );
  }
}
