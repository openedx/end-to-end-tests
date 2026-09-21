/**
 * Turns a `btr-run.json` report into the cell grids the results sheet shows.
 * Pure: no I/O, no Sheets API types, so it is unit-tested from fixture JSON.
 *
 * Every publish writes the same content twice — to `Latest` and to a new
 * timestamped run tab — and one row to the `Runs` index. The layouts are fixed
 * here so the sheet stays comparable across runs.
 */

import type { BtrRun, RunCase, RunTest } from '../../src/reporting/btr-run.ts';

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
