import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

import { testIdsFromAnnotations } from './test-id';
import {
  flattenSteps,
  slowestTests,
  stepRowsToCsv,
  testRowsToCsv,
  type StepNode,
  type StepTimingRow,
  type TestTimingRow,
  type TimingRunContext,
} from './timing';

export interface TimingReporterOptions {
  /** Where to write the per-test CSV. Relative paths resolve from the config dir. */
  readonly testsFile?: string;
  /** Where to write the per-step CSV. Relative paths resolve from the config dir. */
  readonly stepsFile?: string;
  /**
   * Step categories to include in the steps file. Defaults to every category
   * Playwright records (`test.step`, `hook`, `fixture`, `pw:api`, `expect`, …).
   * Restrict to e.g. `['test.step', 'hook']` for a coarser, smaller file.
   */
  readonly stepCategories?: readonly string[];
  /** How many of the slowest tests to print at the end of the run. */
  readonly slowestCount?: number;
}

const DEFAULT_TESTS_FILE = 'test-results/timings-tests.csv';
const DEFAULT_STEPS_FILE = 'test-results/timings-steps.csv';
const DEFAULT_SLOWEST = 5;

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

function toStepNode(step: TestStep): StepNode {
  return {
    title: step.title,
    category: step.category,
    startedAt: step.startTime.toISOString(),
    durationMs: step.duration,
    failed: step.error !== undefined,
    steps: step.steps.map(toStepNode),
  };
}

/**
 * Always-on reporter that records how long every test attempt and every step
 * took, as two CSV files made for import into a spreadsheet or database:
 *
 * - `test-results/timings-tests.csv` — one row per attempt (retries kept, keyed
 *   by `retry`), with project, file, title, BTR `test_ids`, tags, status, the
 *   worker it ran on, start time and duration.
 * - `test-results/timings-steps.csv` — one row per recorded step at any depth,
 *   with its category (`pw:api`, `expect`, `hook`, `fixture`, `test.step`) and
 *   its ancestry path, so a `page.goto` inside a fixture stays attributable.
 *
 * Every row carries `run_started_at` and `base_url`, so files from many runs can
 * be appended into one table and compared across time and targets. Playwright
 * already measures all of this; the reporter only reshapes what the HTML report
 * buries in per-test zips. Local only — uploading is a CI concern (reporting
 * policy).
 */
export default class TimingReporter implements Reporter {
  private readonly testsFile: string;
  private readonly stepsFile: string;
  private readonly categories: ReadonlySet<string> | undefined;
  private readonly slowestCount: number;
  private readonly testRows: TestTimingRow[] = [];
  private readonly stepRows: StepTimingRow[] = [];
  private configDir = process.cwd();
  private context: TimingRunContext = { runStartedAt: new Date().toISOString(), baseUrl: '' };

  constructor(options: TimingReporterOptions = {}) {
    this.testsFile = options.testsFile ?? DEFAULT_TESTS_FILE;
    this.stepsFile = options.stepsFile ?? DEFAULT_STEPS_FILE;
    this.categories = options.stepCategories ? new Set(options.stepCategories) : undefined;
    this.slowestCount = options.slowestCount ?? DEFAULT_SLOWEST;
  }

  onBegin(config: FullConfig): void {
    this.configDir = dirname(config.configFile ?? process.cwd());
    const baseUrl = config.projects.find((p) => p.use.baseURL)?.use.baseURL ?? '';
    this.context = { runStartedAt: new Date().toISOString(), baseUrl };
  }

  /** Fires once per **attempt**; every attempt is kept and distinguished by `retry`. */
  onTestEnd(test: TestCase, result: TestResult): void {
    const identity = {
      project: projectNameOf(test),
      file: relative(this.configDir, test.location.file),
      title: test.titlePath().slice(1).join(' › '),
      retry: result.retry,
    };
    this.testRows.push({
      ...identity,
      testIds: testIdsFromAnnotations(test.annotations),
      tags: test.tags,
      status: result.status,
      expectedStatus: test.expectedStatus,
      workerIndex: result.workerIndex,
      startedAt: result.startTime.toISOString(),
      durationMs: result.duration,
    });
    this.stepRows.push(...flattenSteps(identity, result.steps.map(toStepNode), this.categories));
  }

  async onEnd(): Promise<void> {
    await Promise.all([
      this.write(this.testsFile, testRowsToCsv(this.context, this.testRows)),
      this.write(this.stepsFile, stepRowsToCsv(this.context, this.stepRows)),
    ]);

    const slowest = slowestTests(this.testRows, this.slowestCount)
      .map((row) => `  ${String(row.durationMs).padStart(7)} ms  ${row.title}`)
      .join('\n');
    console.log(
      `\n[timing] ${this.testRows.length} test attempt(s), ${this.stepRows.length} step(s). ` +
        `Wrote ${this.testsFile} and ${this.stepsFile}.` +
        (slowest ? `\n[timing] slowest:\n${slowest}` : ''),
    );
  }

  private async write(file: string, content: string): Promise<void> {
    const path = isAbsolute(file) ? file : resolve(this.configDir, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
}
