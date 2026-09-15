/**
 * Pure aggregation for the timing report: turns per-attempt test and step
 * timings into flat, spreadsheet-friendly rows and serialises them as CSV.
 * No Playwright types, so it is unit-tested directly (like `coverage.ts`).
 */

export type TimingStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/** The columns shared by both CSV files, identifying the run and the test. */
export interface TimingRunContext {
  /** ISO timestamp taken when the run began; the key to group rows of one run. */
  readonly runStartedAt: string;
  /** The target the suite ran against (an empty string for node-only runs). */
  readonly baseUrl: string;
}

/** One row of `timings-tests.csv`: a single attempt of a single test. */
export interface TestTimingRow {
  readonly project: string;
  readonly file: string;
  readonly title: string;
  readonly testIds: readonly string[];
  readonly tags: readonly string[];
  readonly retry: number;
  readonly status: TimingStatus;
  readonly expectedStatus: TimingStatus;
  readonly workerIndex: number;
  readonly startedAt: string;
  readonly durationMs: number;
}

/** A step as read from a test result, before flattening. */
export interface StepNode {
  readonly title: string;
  readonly category: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly failed: boolean;
  readonly steps: readonly StepNode[];
}

/** One row of `timings-steps.csv`: a step at any depth, with its ancestry. */
export interface StepTimingRow {
  readonly project: string;
  readonly file: string;
  readonly title: string;
  readonly retry: number;
  readonly depth: number;
  /** Titles from the outermost step down to this one, joined with ` › `. */
  readonly path: string;
  readonly stepTitle: string;
  readonly category: string;
  readonly failed: boolean;
  readonly startedAt: string;
  readonly durationMs: number;
}

export const TEST_COLUMNS = [
  'run_started_at',
  'base_url',
  'project',
  'file',
  'title',
  'test_ids',
  'tags',
  'retry',
  'status',
  'expected_status',
  'worker_index',
  'started_at',
  'duration_ms',
] as const;

export const STEP_COLUMNS = [
  'run_started_at',
  'base_url',
  'project',
  'file',
  'title',
  'retry',
  'depth',
  'path',
  'step_title',
  'category',
  'failed',
  'started_at',
  'duration_ms',
] as const;

const PATH_SEPARATOR = ' › ';

/**
 * Flattens a step tree into rows, depth-first in execution order, keeping only
 * steps whose category is in `categories` (every category when omitted). A
 * filtered-out step still contributes its children, so hiding `pw:api` noise
 * keeps the `test.step` blocks that wrap it.
 */
export function flattenSteps(
  test: Pick<StepTimingRow, 'project' | 'file' | 'title' | 'retry'>,
  steps: readonly StepNode[],
  categories?: ReadonlySet<string>,
): StepTimingRow[] {
  const rows: StepTimingRow[] = [];
  const visit = (node: StepNode, ancestors: readonly string[]): void => {
    const path = [...ancestors, node.title];
    if (!categories || categories.has(node.category)) {
      rows.push({
        ...test,
        depth: ancestors.length,
        path: path.join(PATH_SEPARATOR),
        stepTitle: node.title,
        category: node.category,
        failed: node.failed,
        startedAt: node.startedAt,
        durationMs: node.durationMs,
      });
    }
    for (const child of node.steps) {
      visit(child, path);
    }
  };
  for (const step of steps) {
    visit(step, []);
  }
  return rows;
}

/** Quotes a CSV field per RFC 4180 only when it needs quoting. */
export function csvField(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(fields: readonly (string | number | boolean)[]): string {
  return fields.map(csvField).join(',');
}

/** Serialises the per-test rows as CSV (header + one line per attempt). */
export function testRowsToCsv(context: TimingRunContext, rows: readonly TestTimingRow[]): string {
  const lines = [
    csvLine(TEST_COLUMNS),
    ...rows.map((row) =>
      csvLine([
        context.runStartedAt,
        context.baseUrl,
        row.project,
        row.file,
        row.title,
        row.testIds.join(' '),
        row.tags.join(' '),
        row.retry,
        row.status,
        row.expectedStatus,
        row.workerIndex,
        row.startedAt,
        row.durationMs,
      ]),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

/** Serialises the per-step rows as CSV (header + one line per step). */
export function stepRowsToCsv(context: TimingRunContext, rows: readonly StepTimingRow[]): string {
  const lines = [
    csvLine(STEP_COLUMNS),
    ...rows.map((row) =>
      csvLine([
        context.runStartedAt,
        context.baseUrl,
        row.project,
        row.file,
        row.title,
        row.retry,
        row.depth,
        row.path,
        row.stepTitle,
        row.category,
        row.failed,
        row.startedAt,
        row.durationMs,
      ]),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

/** The `count` slowest test attempts, longest first — for the console headline. */
export function slowestTests(
  rows: readonly TestTimingRow[],
  count: number,
): readonly TestTimingRow[] {
  return [...rows].sort((a, b) => b.durationMs - a.durationMs).slice(0, count);
}
