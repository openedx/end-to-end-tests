/**
 * Turns a `btr-run.json` report into the cell grids the results sheet shows.
 * Pure: no I/O, no Sheets API types, so it is unit-tested from fixture JSON.
 *
 * Every publish writes the same content twice — to `Latest` and to a new
 * timestamped run tab — and one row to the `Runs` index. The layouts are fixed
 * here so the sheet stays comparable across runs. A publish that replaces
 * `Latest` also rewrites `Export`: the flat, one-row-per-case view that a BTR
 * test-plan sheet pulls in with `IMPORTRANGE` and looks up by test id.
 */

import type { BtrRun, RunCase, RunTest } from '../../src/reporting/btr-run.ts';

import type { CoverageGap, CoverageGaps } from './coverage-gaps.mts';

/** What the publisher knows that the run report does not. */
export interface PublishContext {
  /** Open edX release the sheet is for (`main`, `verawood`, …). */
  readonly release: string;
  /** GitHub Environment name for external-target runs; empty for Tutor runs. */
  readonly environment?: string;
}

/** A 2-D grid of cell values, rows × columns, as the Sheets values API takes it. */
export type Grid = readonly (readonly string[])[];

/** Columns of the per-case results table on `Latest` and every run tab. */
export const TABLE_HEADER: readonly string[] = [
  'BTR Test ID',
  'Result',
  'Spec(s)',
  'Test(s)',
  'Notes',
  'Duration (s)',
  'Attempts',
  'Project',
];

/**
 * Columns A:E of the `Export` tab: what a test-plan sheet imports. The order is
 * a contract with the lookup formulas in that sheet, so append, never reorder.
 */
export const EXPORT_HEADER: readonly string[] = [
  'BTR Test ID',
  'E2E Result',
  'E2E Manual Check',
  'E2E Notes',
  'E2E Test Run URL',
];

/** Width of the `Export` grid: A:E, a blank column, then the run-info label and value. */
export const EXPORT_WIDTH = EXPORT_HEADER.length + 3;

/** Labels of the run-info block in `Export!G:H`, top to bottom. The last is one line for display. */
export const EXPORT_INFO_LABELS: readonly string[] = [
  'Release',
  'Run',
  'Run URL',
  'Started (UTC)',
  'Commit',
  'Coverage gaps reviewed against',
  'Summary',
];

/** How much of the run's own notes one `Export` cell carries before pointing at the run. */
const EXPORT_NOTES_MAX = 300;

/** Columns of the `Runs` index tab. */
export const RUNS_HEADER: readonly string[] = [
  'Started (UTC)',
  'Run',
  'Workflow',
  'Target',
  'Ref',
  'Commit',
  'Duration (s)',
  'Overall',
  'Passed',
  'Failed',
  'Skipped',
  'Flaky',
  'Verified',
  'Partial',
  'Unverified',
  'Failed cases',
  'Tab',
];

/** Sheets tab titles: at most 100 characters, none of `[ ] * ? / \ :`. */
const TAB_TITLE_MAX = 100;
const TAB_TITLE_FORBIDDEN = /[[\]*?/\\:]/g;

/** Sheets `HYPERLINK` formula; quotes inside either argument are doubled. */
export function hyperlink(url: string, label: string): string {
  const q = (s: string) => s.replace(/"/g, '""');
  return `=HYPERLINK("${q(url)}", "${q(label)}")`;
}

/**
 * A cell value that Sheets will not interpret as a formula. Anything starting
 * with `=`, `+`, `-` or `@` is prefixed with an apostrophe (Sheets' own escape),
 * so a test title or error message can never execute as a formula.
 */
export function plainCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** `2026-09-15 09h14 UTC` — sortable, and legal as a tab title. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}h${pad(d.getUTCMinutes())} UTC`
  );
}

/** Makes any string a legal tab title (forbidden characters dropped, length capped). */
export function sanitizeTabTitle(title: string): string {
  const cleaned = title.replace(TAB_TITLE_FORBIDDEN, '').trim();
  return cleaned.length > TAB_TITLE_MAX ? cleaned.slice(0, TAB_TITLE_MAX).trimEnd() : cleaned;
}

/** Title of the run's own tab: the UTC start stamp, plus the environment for external runs. */
export function tabTitleFor(run: BtrRun, ctx: PublishContext): string {
  const stamp = formatStamp(run.run.startedAt);
  return sanitizeTabTitle(ctx.environment ? `${stamp} · ${ctx.environment}` : stamp);
}

const STATUS_MARK: Record<RunTest['status'], string> = {
  passed: '✓',
  failed: '✗',
  timedOut: '✗',
  interrupted: '✗',
  skipped: '⊘',
};

function seconds(ms: number, decimals: number): string {
  return (ms / 1000).toFixed(decimals);
}

function overallOf(run: BtrRun): string {
  if (run.totals.tests === 0) {
    return 'NO RESULTS';
  }
  return run.run.status === 'passed' ? 'PASS' : 'FAIL';
}

function targetOf(run: BtrRun, ctx: PublishContext): string {
  const url = run.run.lmsBaseUrl ?? '';
  return ctx.environment ? `${ctx.environment} (${url})` : url;
}

function filterOf(run: BtrRun): string {
  const { paths, grep, grepInvert } = run.run.filter;
  const parts = [
    paths.length > 0 ? `paths: ${paths.join(' ')}` : '',
    grep ? `grep: ${grep}` : '',
    grepInvert ? `grep-invert: ${grepInvert}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : 'none (full run)';
}

function runCell(run: BtrRun): string {
  const ci = run.run.ci;
  if (!ci) {
    return 'local';
  }
  const label = ci.runAttempt !== '1' ? `${ci.runId} (attempt ${ci.runAttempt})` : ci.runId;
  return hyperlink(ci.runUrl, label);
}

function commitCell(run: BtrRun): string {
  const ci = run.run.ci;
  if (!ci || !ci.sha) {
    return '';
  }
  const short = ci.sha.slice(0, 7);
  return ci.repository
    ? hyperlink(`${ci.runUrl.split('/actions/')[0]}/commit/${ci.sha}`, short)
    : short;
}

/**
 * The label/value block at the top of `Latest` and each run tab. Row count is
 * fixed ({@link HEADER_ROWS}) so the table always starts at the same row.
 */
export function renderHeaderBlock(run: BtrRun, ctx: PublishContext): Grid {
  const ci = run.run.ci;
  const t = run.totals;
  const v = run.verdicts;
  return [
    ['Run', runCell(run)],
    ['Workflow', ci ? `${ci.workflow} (${ci.eventName})` : 'local run'],
    ['Release', ctx.release],
    ['Target', targetOf(run, ctx)],
    ['Ref', ci?.ref ?? ''],
    ['Commit', commitCell(run)],
    ['Started (UTC)', run.run.startedAt],
    ['Duration (s)', seconds(run.run.durationMs, 0)],
    ['Tests', `${t.passed} passed / ${t.failed} failed / ${t.skipped} skipped / ${t.flaky} flaky`],
    [
      'BTR cases',
      `${v.verified} verified / ${v.partial} partial / ${v.unverified} unverified / ${v.failed} failed`,
    ],
    ['Annotated', `${t.annotated} of ${t.tests} tests carry a BTR test ID`],
    ['Overall', overallOf(run)],
    ['Filter', filterOf(run)],
  ];
}

/** Number of rows {@link renderHeaderBlock} produces. */
export const HEADER_ROWS = 13;

/** 1-based row of the results table's header (header block, one blank row). */
export const TABLE_HEADER_ROW = HEADER_ROWS + 2;

function testLines(tests: readonly RunTest[]): string {
  return tests.map((t) => `${STATUS_MARK[t.status]} ${t.title}`).join('\n');
}

function noteLines(tests: readonly RunTest[]): string {
  const noted = tests.filter((t) => t.note);
  if (noted.length === 0) {
    return '';
  }
  return noted.map((t) => (tests.length > 1 ? `${t.title}: ${t.note}` : t.note)).join('\n');
}

function caseRow(c: RunCase): string[] {
  return [
    c.testId,
    c.verdict,
    c.specs.join('\n'),
    plainCell(testLines(c.tests)),
    plainCell(noteLines(c.tests)),
    seconds(c.durationMs, 1),
    String(c.attempts),
    c.projects.join('\n'),
  ];
}

/** The per-case table, header row first. */
export function renderTable(run: BtrRun): Grid {
  return [TABLE_HEADER, ...run.cases.map(caseRow)];
}

/**
 * Everything written to `Latest` and to a run tab: header block, a blank row,
 * then the table. Rows are padded to the table's width so one range write
 * covers the lot.
 */
export function renderRunSheet(run: BtrRun, ctx: PublishContext): Grid {
  const width = TABLE_HEADER.length;
  const pad = (row: readonly string[]): string[] => [
    ...row,
    ...Array.from({ length: width - row.length }, () => ''),
  ];
  return [...renderHeaderBlock(run, ctx).map(pad), pad([]), ...renderTable(run)];
}

/** One `Runs` index row, linking to the run's tab by sheet id. */
export function renderRunsRow(
  run: BtrRun,
  ctx: PublishContext,
  tab: { readonly title: string; readonly sheetId: number },
): readonly string[] {
  const ci = run.run.ci;
  const t = run.totals;
  const v = run.verdicts;
  return [
    run.run.startedAt,
    runCell(run),
    ci ? `${ci.workflow} (${ci.eventName})` : 'local run',
    targetOf(run, ctx),
    ci?.ref ?? '',
    commitCell(run),
    seconds(run.run.durationMs, 0),
    overallOf(run),
    String(t.passed),
    String(t.failed),
    String(t.skipped),
    String(t.flaky),
    String(v.verified),
    String(v.partial),
    String(v.unverified),
    String(v.failed),
    hyperlink(`#gid=${tab.sheetId}`, tab.title),
  ];
}

/* -------------------------------------------------------------------- Export */

const CAPABILITY_SKIP =
  /skipped: Installation does not have: ([^.\s]+)\. Declare it in CAPABILITIES to run this spec\./g;

/** A run note in a tester's terms: a capability skip is about the CI install, not the product. */
function testerNote(note: string): string {
  return note.replace(CAPABILITY_SKIP, 'not run in CI: needs $1');
}

/** Whether a test's note records a dispute with the sheet (possibly behind an `in <profile>: ` prefix). */
function isDisputed(test: RunTest): boolean {
  return /^(in [^:]+: )?disputed: /.test(test.note);
}

/**
 * The run's notes for a case, shortened for a test-plan sheet: the test's own
 * name rather than its whole title path, one line per distinct note, and a
 * pointer to the run once {@link EXPORT_NOTES_MAX} is reached.
 */
function exportRunNotes(tests: readonly RunTest[]): string {
  const noted = tests.filter((t) => t.note);
  const distinct = new Set(noted.map((t) => testerNote(t.note)));
  const lines =
    distinct.size === 1
      ? [...distinct]
      : noted.map((t) => `${t.title.split(' › ').at(-1) ?? t.title}: ${testerNote(t.note)}`);

  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (kept.length > 0 && length + line.length > EXPORT_NOTES_MAX) {
      break;
    }
    const cut =
      line.length > EXPORT_NOTES_MAX ? `${line.slice(0, EXPORT_NOTES_MAX).trimEnd()}…` : line;
    kept.push(cut);
    length += cut.length;
  }
  const dropped = lines.length - kept.length;
  return dropped > 0 ? [...kept, `(+${dropped} more, see run)`].join('\n') : kept.join('\n');
}

function gapNote(gap: CoverageGap): string {
  return `manual check (${gap.reason}): ${gap.text}`;
}

/**
 * Gap rows that no longer apply: `no test` rows for cases the run now has tests
 * for. They are ignored when rendering; the publisher reports them so the
 * table gets refreshed.
 */
export function staleGapRows(run: BtrRun, gaps: CoverageGaps | undefined): string[] {
  const ran = new Set(run.cases.map((c) => c.testId));
  return [...(gaps?.byTestId.values() ?? [])]
    .filter((gap) => gap.reason === 'no test' && ran.has(gap.testId))
    .map((gap) => gap.testId)
    .sort();
}

function exportRunInfo(run: BtrRun, ctx: PublishContext, gaps: CoverageGaps | undefined): string[] {
  const ci = run.run.ci;
  const runLabel = ci ? ci.runId : 'local';
  const commit = ci?.sha.slice(0, 7) ?? '';
  const day = run.run.startedAt.slice(0, 10);
  const summary = [`e2e on ${ctx.release}`, `run ${runLabel}`, day, commit]
    .filter(Boolean)
    .join(' · ');
  return [
    ctx.release,
    runLabel,
    ci?.runUrl ?? '',
    run.run.startedAt,
    commit,
    gaps?.reviewedAgainst ?? '',
    summary,
  ];
}

/**
 * The `Export` tab: one row per case in A:E, and the run it came from in G:H.
 *
 * - **E2E Result** is the run's verdict, unchanged.
 * - **E2E Manual Check** is `yes` unless the case is `verified`, disputes
 *   nothing, and is not in the coverage-gaps table.
 * - **E2E Notes** leads with the coverage-gaps reason, then the run's notes.
 * - Cases the table lists as `no test` get a row of their own (`unverified`),
 *   so the sheet can say why nothing ran. A case in neither the run nor the
 *   table has no row; the importing sheet's lookup supplies the default.
 */
export function renderExport(run: BtrRun, ctx: PublishContext, gaps?: CoverageGaps): Grid {
  const url = run.run.ci?.runUrl ?? '';
  const ran = new Set(run.cases.map((c) => c.testId));

  const rows = run.cases.map((c): string[] => {
    const found = gaps?.byTestId.get(c.testId);
    const gap = found && found.reason !== 'no test' ? found : undefined;
    const manual = c.verdict !== 'verified' || gap !== undefined || c.tests.some(isDisputed);
    const notes = [gap ? gapNote(gap) : '', exportRunNotes(c.tests)].filter(Boolean).join('\n');
    return [c.testId, c.verdict, manual ? 'yes' : 'no', plainCell(notes), url];
  });
  for (const gap of gaps?.byTestId.values() ?? []) {
    if (gap.reason === 'no test' && !ran.has(gap.testId)) {
      rows.push([gap.testId, 'unverified', 'yes', plainCell(gapNote(gap)), url]);
    }
  }
  rows.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));

  const info = exportRunInfo(run, ctx, gaps);
  const table: (readonly string[])[] = [EXPORT_HEADER, ...rows];
  const height = Math.max(table.length, EXPORT_INFO_LABELS.length);
  return Array.from({ length: height }, (_, i) => [
    ...(table[i] ?? EXPORT_HEADER.map(() => '')),
    '',
    EXPORT_INFO_LABELS[i] ?? '',
    plainCell(info[i] ?? ''),
  ]);
}

/** Rows of the hidden `_meta` tab. Read back by `plan.mts` before every publish. */
export function renderMeta(release: string, bootstrappedAt: string, publisher: string): Grid {
  return [
    ['schema_version', '1'],
    ['release', release],
    ['bootstrapped_at', bootstrappedAt],
    ['publisher', publisher],
  ];
}

/** Parses `_meta` rows back into a map, tolerating extra or missing rows. */
export function parseMeta(rows: Grid | undefined): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const row of rows ?? []) {
    const [key, value] = row;
    if (key) {
      meta[key] = value ?? '';
    }
  }
  return meta;
}
