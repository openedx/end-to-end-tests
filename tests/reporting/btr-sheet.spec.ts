import { createVerify, generateKeyPairSync } from 'node:crypto';

import { test, expect } from '@playwright/test';

import {
  SheetsApiError,
  SheetsClient,
  mintAccessToken,
  parseServiceAccountKey,
  parseSpreadsheetId,
  signAssertion,
  type FetchLike,
} from '../../scripts/btr-sheet/google.mts';
import { parseCoverageGaps } from '../../scripts/btr-sheet/coverage-gaps.mts';
import {
  EXPORT_TAB,
  LATEST_TAB,
  META_TAB,
  PlanRefusal,
  RUNS_TAB,
  columnLetter,
  isRunTab,
  planPublish,
  rangeFor,
  reorderRequests,
  uniqueTabTitle,
  wantedTabOrder,
  type PlanInput,
  type SpreadsheetState,
} from '../../scripts/btr-sheet/plan.mts';
import {
  EXPORT_HEADER,
  EXPORT_INFO_LABELS,
  EXPORT_WIDTH,
  HEADER_ROWS,
  RUNS_HEADER,
  TABLE_HEADER,
  formatStamp,
  hyperlink,
  parseMeta,
  plainCell,
  renderExport,
  renderHeaderBlock,
  renderRunSheet,
  renderRunsRow,
  renderTable,
  sanitizeTabTitle,
  staleGapRows,
  tabTitleFor,
} from '../../scripts/btr-sheet/render.mts';
import type { BtrRun, RunTest } from '../../src/reporting';

/* ------------------------------------------------------------------ fixtures */

function runTest(over: Partial<RunTest> = {}): RunTest {
  return {
    title: 'signs in',
    spec: 'tests/lms/auth/login.spec.ts',
    project: 'smoke',
    testIds: ['TC-00003'],
    status: 'passed',
    durationMs: 1234,
    attempts: 1,
    note: '',
    ...over,
  };
}

const CI_RUN: BtrRun = {
  schemaVersion: 1,
  generatedAt: '2026-09-15T09:16:00.000Z',
  run: {
    startedAt: '2026-09-15T09:14:05.000Z',
    durationMs: 125_400,
    status: 'failed',
    lmsBaseUrl: 'http://local.openedx.io',
    filter: { paths: [], grep: '', grepInvert: '@unit' },
    ci: {
      runId: '123456',
      runAttempt: '1',
      runUrl: 'https://github.com/openedx/end-to-end-tests/actions/runs/123456',
      repository: 'openedx/end-to-end-tests',
      workflow: 'Tutor E2E Test',
      eventName: 'schedule',
      ref: 'main',
      sha: 'abcdef1234567890',
      release: 'verawood',
    },
  },
  totals: { tests: 3, passed: 1, failed: 1, skipped: 1, flaky: 0, annotated: 3, unannotated: 0 },
  verdicts: { verified: 0, partial: 1, unverified: 0, failed: 1 },
  cases: [
    {
      testId: 'TC-00003',
      verdict: 'partial',
      specs: ['tests/lms/auth/login.spec.ts'],
      projects: ['smoke'],
      tests: [
        runTest(),
        runTest({
          title: 'rejects a bad password',
          status: 'skipped',
          durationMs: 10,
          note: 'skipped: no ADMIN_USERNAME',
        }),
      ],
      durationMs: 1244,
      attempts: 2,
    },
    {
      testId: 'TC-00016',
      verdict: 'failed',
      specs: ['tests/lms/catalog/discovery.spec.ts'],
      projects: ['regression'],
      tests: [
        runTest({
          title: '=filters by org',
          spec: 'tests/lms/catalog/discovery.spec.ts',
          project: 'regression',
          testIds: ['TC-00016'],
          status: 'failed',
          durationMs: 30_000,
          attempts: 3,
          note: 'failed: expect(locator).toBeVisible()',
        }),
      ],
      durationMs: 30_000,
      attempts: 3,
    },
  ],
  tests: [],
};

const LOCAL_RUN: BtrRun = {
  ...CI_RUN,
  run: { ...CI_RUN.run, ci: null, status: 'passed' },
};

const CTX = { release: 'verawood' };

const EMPTY_SHEET: SpreadsheetState = {
  title: 'Untitled spreadsheet',
  sheets: [{ sheetId: 0, title: 'Sheet1', index: 0 }],
  defaultSheetHasValues: false,
};

const BOOTSTRAPPED: SpreadsheetState = {
  title: 'Open edX e2e BTR results — verawood',
  sheets: [
    { sheetId: 1, title: LATEST_TAB, index: 0 },
    { sheetId: 2, title: RUNS_TAB, index: 1 },
    { sheetId: 3, title: META_TAB, index: 2 },
    { sheetId: 5, title: EXPORT_TAB, index: 3 },
    { sheetId: 4, title: '2026-09-12 09h00 UTC', index: 4 },
  ],
  meta: [
    ['schema_version', '1'],
    ['release', 'verawood'],
  ],
};

function planFor(state: SpreadsheetState, over: Partial<PlanInput> = {}) {
  return planPublish({
    state,
    run: CI_RUN,
    ctx: CTX,
    updateLatest: true,
    now: '2026-09-15T09:16:30.000Z',
    publisher: 'test',
    ...over,
  });
}

/**
 * Replays a structure batch the way Sheets applies it, returning the tab titles
 * in their final order: an add or a leftward move puts the tab at exactly the
 * index named. Rightward moves are counted, since their index means something else.
 */
function replayTabOrder(
  state: SpreadsheetState,
  structure: readonly Readonly<Record<string, unknown>>[],
): { order: string[]; rightwardMoves: number } {
  const order = [...state.sheets].sort((a, b) => a.index - b.index).map((s) => s.title);
  const titleOf = new Map<unknown, string>(state.sheets.map((s) => [s.sheetId, s.title]));
  let rightwardMoves = 0;
  for (const request of structure) {
    const add = request.addSheet as { properties: Record<string, unknown> } | undefined;
    const move = request.updateSheetProperties as
      { properties: Record<string, unknown>; fields: string } | undefined;
    if (add) {
      titleOf.set(add.properties.sheetId, add.properties.title as string);
      order.splice(add.properties.index as number, 0, add.properties.title as string);
    } else if (move?.fields === 'index') {
      const title = titleOf.get(move.properties.sheetId) ?? '';
      const to = move.properties.index as number;
      rightwardMoves += to > order.indexOf(title) ? 1 : 0;
      order.splice(order.indexOf(title), 1);
      order.splice(to, 0, title);
    }
  }
  return { order, rightwardMoves };
}

/* -------------------------------------------------------------------- render */

/** Header block as a label → value map. */
function byLabelOf(block: readonly (readonly string[])[]): Record<string, string> {
  return Object.fromEntries(block.map(([k, v]) => [k ?? '', v ?? '']));
}

test.describe('render', { tag: '@unit' }, () => {
  test('formats the UTC stamp without characters a tab title forbids', () => {
    expect(formatStamp('2026-09-15T09:14:05.000Z')).toBe('2026-09-15 09h14 UTC');
    expect(tabTitleFor(CI_RUN, CTX)).toBe('2026-09-15 09h14 UTC');
    expect(tabTitleFor(CI_RUN, { ...CTX, environment: 'staging/eu' })).toBe(
      '2026-09-15 09h14 UTC · stagingeu',
    );
  });

  test('sanitises and caps tab titles', () => {
    expect(sanitizeTabTitle('a[b]*c?d/e\\f:g')).toBe('abcdefg');
    expect(sanitizeTabTitle('x'.repeat(150))).toHaveLength(100);
  });

  test('escapes quotes in HYPERLINK and neutralises formula-looking cells', () => {
    expect(hyperlink('https://x/?q="a"', 'say "hi"')).toBe(
      '=HYPERLINK("https://x/?q=""a""", "say ""hi""")',
    );
    expect(plainCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(plainCell('+1')).toBe("'+1");
    expect(plainCell('plain')).toBe('plain');
  });

  test('header block has the fixed row count and links the run and commit', () => {
    const block = renderHeaderBlock(CI_RUN, CTX);
    expect(block).toHaveLength(HEADER_ROWS);
    const byLabel = byLabelOf(block);
    expect(byLabel['Run']).toBe(
      '=HYPERLINK("https://github.com/openedx/end-to-end-tests/actions/runs/123456", "123456")',
    );
    expect(byLabel['Commit']).toBe(
      '=HYPERLINK("https://github.com/openedx/end-to-end-tests/commit/abcdef1234567890", "abcdef1")',
    );
    expect(byLabel['Release']).toBe('verawood');
    expect(byLabel['Duration (s)']).toBe('125');
    expect(byLabel['Overall']).toBe('FAIL');
    expect(byLabel['Filter']).toBe('grep-invert: @unit');
    expect(byLabel['Tests']).toBe('1 passed / 1 failed / 1 skipped / 0 flaky');
  });

  test('header block marks a local run and an empty run', () => {
    const local = byLabelOf(renderHeaderBlock(LOCAL_RUN, CTX));
    expect(local['Run']).toBe('local');
    expect(local['Commit']).toBe('');
    const empty = byLabelOf(
      renderHeaderBlock(
        { ...LOCAL_RUN, totals: { ...LOCAL_RUN.totals, tests: 0 }, cases: [] },
        CTX,
      ),
    );
    expect(empty['Overall']).toBe('NO RESULTS');
    expect(empty['Filter']).toBe('grep-invert: @unit');
  });

  test('table has one row per case with multi-line specs, marked titles and prefixed notes', () => {
    const table = renderTable(CI_RUN);
    expect(table[0]).toEqual(TABLE_HEADER);
    expect(table[1]).toEqual([
      'TC-00003',
      'partial',
      'tests/lms/auth/login.spec.ts',
      '✓ signs in\n⊘ rejects a bad password',
      'rejects a bad password: skipped: no ADMIN_USERNAME',
      '1.2',
      '2',
      'smoke',
    ]);
    // A single-test case shows the bare note. The status mark leads the cell, so a
    // title starting with "=" cannot be read as a formula.
    expect(table[2]?.[3]).toBe('✗ =filters by org');
    expect(table[2]?.[4]).toBe('failed: expect(locator).toBeVisible()');
    expect(table[2]?.[5]).toBe('30.0');
  });

  test('run sheet pads every row to the table width and leaves a blank row', () => {
    const grid = renderRunSheet(CI_RUN, CTX);
    expect(grid.every((row) => row.length === TABLE_HEADER.length)).toBe(true);
    expect(grid[HEADER_ROWS]).toEqual(Array(TABLE_HEADER.length).fill(''));
    expect(grid[HEADER_ROWS + 1]).toEqual(TABLE_HEADER);
  });

  test('Runs row matches the Runs header width and links the tab by gid', () => {
    const row = renderRunsRow(CI_RUN, CTX, { title: '2026-09-15 09h14 UTC', sheetId: 42 });
    expect(row).toHaveLength(RUNS_HEADER.length);
    expect(row[0]).toBe('2026-09-15T09:14:05.000Z');
    expect(row[7]).toBe('FAIL');
    expect(row.at(-1)).toBe('=HYPERLINK("#gid=42", "2026-09-15 09h14 UTC")');
  });

  test('parseMeta tolerates missing and ragged rows', () => {
    expect(parseMeta(undefined)).toEqual({});
    expect(parseMeta([['release', 'main'], ['odd'], []])).toEqual({ release: 'main', odd: '' });
  });
});

/* ---------------------------------------------------------------------- plan */

const GAPS = parseCoverageGaps(
  [
    'Reviewed against: Willow Test Sheet V2.0 (2026-11-19), suite at abc1234.',
    '<!-- manual-check-table:start -->',
    '| Test ID | Reason | What the suite does not check |',
    '| --- | --- | --- |',
    '| TC-00003 | no test | Stale: the run has tests for it. |',
    '| TC-00005 | no test | Third-party SSO needs a real identity provider. |',
    '| TC-00020 | wording | Expects a link labeled Discover. |',
    '| TC-00021 | partial | Only the single-item path is driven. |',
    '<!-- manual-check-table:end -->',
  ].join('\n'),
);

/** A case for the Export fixtures; one passing test unless given others. */
function exportCase(
  testId: string,
  verdict: BtrRun['cases'][number]['verdict'],
  tests: readonly RunTest[] = [runTest()],
): BtrRun['cases'][number] {
  return { testId, verdict, specs: [], projects: [], tests, durationMs: 0, attempts: tests.length };
}

const SKIP_NOTE =
  'skipped: Installation does not have: wiki. Declare it in CAPABILITIES to run this spec.';

const EXPORT_RUN: BtrRun = {
  ...CI_RUN,
  cases: [
    exportCase('TC-00003', 'verified'),
    exportCase('TC-00016', 'failed', [
      runTest({ status: 'failed', note: '=failed: expect(locator).toBeVisible()' }),
    ]),
    exportCase('TC-00017', 'unverified', [
      runTest({ title: 'a › b › opens the wiki', status: 'skipped', note: SKIP_NOTE }),
      runTest({ title: 'a › b › edits the wiki', status: 'skipped', note: SKIP_NOTE }),
    ]),
    exportCase('TC-00020', 'verified'),
    exportCase('TC-00021', 'partial', [
      runTest(),
      runTest({
        title: 'x › y › bulk path',
        status: 'skipped',
        note: 'fixme: needs seeded content',
      }),
      runTest({ title: 'x › y › retried', note: 'flaky: passed on attempt 2' }),
    ]),
    exportCase('TC-00423', 'verified', [
      runTest({ note: 'in default: disputed: the switch is disabled, not hidden' }),
    ]),
    exportCase('TC-00272', 'verified', [runTest({ note: 'flaky: passed on attempt 2' })]),
    // A known defect: the run holds these back (partial / unverified), the sheet says failed.
    exportCase('TC-00038', 'partial', [
      runTest(),
      runTest({
        title: 'n › takes a note',
        status: 'skipped',
        note: 'expected failure (known defect): NOTES-001: the block is not annotatable',
      }),
    ]),
    exportCase('TC-00060', 'unverified', [
      runTest({
        status: 'skipped',
        note: 'in default: expected failure (known defect): BASE-004: logos differ',
      }),
    ]),
    // Fixmes held for a product defect: a finding id, or an issue link.
    exportCase('TC-00160', 'unverified', [
      runTest({ status: 'skipped', note: 'fixme: PLAT-008: gating is not enforced' }),
    ]),
    exportCase('TC-00568', 'partial', [
      runTest(),
      runTest({
        status: 'skipped',
        note: 'in default: fixme: no rows for superusers — https://github.com/openedx/openedx-authz/issues/347',
      }),
    ]),
    // Fixmes that are the suite's own gap, even when they cite a finding.
    exportCase('TC-00214', 'unverified', [
      runTest({
        status: 'skipped',
        note: 'fixme: Suite gap: read-back not established (`VAL-001`)',
      }),
    ]),
    exportCase('TC-00287', 'partial', [
      runTest(),
      runTest({ status: 'skipped', note: 'fixme: Needs a graded problem with a due date' }),
    ]),
    exportCase('TC-00311', 'unverified', [
      runTest({ status: 'skipped', note: 'fixme (no reason recorded)' }),
    ]),
  ],
};

const RUN_URL = 'https://github.com/openedx/end-to-end-tests/actions/runs/123456';

test.describe('renderExport', { tag: '@unit' }, () => {
  const grid = renderExport(EXPORT_RUN, CTX, GAPS);
  const byId = new Map(grid.slice(1).map((row) => [row[0], row.slice(1, 5)]));

  test('has the contract header, one width, and rows sorted by test id', () => {
    expect(grid[0]?.slice(0, 5)).toEqual([...EXPORT_HEADER]);
    expect(new Set(grid.map((row) => row.length))).toEqual(new Set([EXPORT_WIDTH]));
    expect(grid.slice(1).map((row) => row[0])).toEqual([
      'TC-00003',
      'TC-00005',
      'TC-00016',
      'TC-00017',
      'TC-00020',
      'TC-00021',
      'TC-00038',
      'TC-00060',
      'TC-00160',
      'TC-00214',
      'TC-00272',
      'TC-00287',
      'TC-00311',
      'TC-00423',
      'TC-00568',
    ]);
  });

  test('a clean verified case needs no manual check; a stale no-test row is ignored', () => {
    expect(byId.get('TC-00003')).toEqual(['verified', 'no', '', RUN_URL]);
    expect(staleGapRows(EXPORT_RUN, GAPS)).toEqual(['TC-00003']);
    expect(staleGapRows(EXPORT_RUN, undefined)).toEqual([]);
  });

  test('a flaky pass stays verified with its note and no manual check', () => {
    expect(byId.get('TC-00272')).toEqual(['verified', 'no', 'flaky: passed on attempt 2', RUN_URL]);
  });

  test('anything but verified needs a manual check, and a failure passes through', () => {
    expect(byId.get('TC-00016')).toEqual([
      'failed',
      'yes',
      "'=failed: expect(locator).toBeVisible()", // cannot run as a formula
      RUN_URL,
    ]);
  });

  test('an expected failure for a known defect reads failed, naming the defect', () => {
    expect(byId.get('TC-00038')).toEqual([
      'failed',
      'yes',
      'expected failure (known defect): NOTES-001: the block is not annotatable',
      RUN_URL,
    ]);
    expect(byId.get('TC-00060')).toEqual([
      'failed',
      'yes',
      'in default: expected failure (known defect): BASE-004: logos differ',
      RUN_URL,
    ]);
  });

  test('a fixme held for a product defect reads failed; a suite-gap fixme does not', () => {
    expect(byId.get('TC-00160')?.slice(0, 2)).toEqual(['failed', 'yes']); // finding id
    expect(byId.get('TC-00568')?.slice(0, 2)).toEqual(['failed', 'yes']); // issue link
    expect(byId.get('TC-00214')?.slice(0, 2)).toEqual(['unverified', 'yes']); // "Suite gap"
    expect(byId.get('TC-00287')?.slice(0, 2)).toEqual(['partial', 'yes']); // no defect cited
    expect(byId.get('TC-00311')?.slice(0, 2)).toEqual(['unverified', 'yes']); // no reason at all
  });

  test('a capability skip is reworded for testers and said once', () => {
    expect(byId.get('TC-00017')).toEqual([
      'unverified',
      'yes',
      'not run in CI: needs wiki',
      RUN_URL,
    ]);
  });

  test('a verified case in the gaps table needs a manual check and says why', () => {
    expect(byId.get('TC-00020')).toEqual([
      'verified',
      'yes',
      'manual check (wording): Expects a link labeled Discover.',
      RUN_URL,
    ]);
  });

  test('the gap reason leads, then each noted test under its own name', () => {
    expect(byId.get('TC-00021')).toEqual([
      'partial',
      'yes',
      [
        'manual check (partial): Only the single-item path is driven.',
        'bulk path: fixme: needs seeded content',
        'retried: flaky: passed on attempt 2',
      ].join('\n'),
      RUN_URL,
    ]);
  });

  test('a disputed pass needs a manual check without a table row', () => {
    expect(byId.get('TC-00423')?.slice(0, 2)).toEqual(['verified', 'yes']);
  });

  test('a no-test case the run did not see gets its own unverified row', () => {
    expect(byId.get('TC-00005')).toEqual([
      'unverified',
      'yes',
      'manual check (no test): Third-party SSO needs a real identity provider.',
      RUN_URL,
    ]);
  });

  test('long run notes are cut with a pointer to the run', () => {
    const filler = 'x'.repeat(40);
    const many = Array.from({ length: 12 }, (_, i) =>
      runTest({ title: `s › test ${i}`, status: 'skipped', note: `fixme: ${filler} ${i}` }),
    );
    const cut = renderExport(
      { ...CI_RUN, cases: [exportCase('TC-00001', 'unverified', many)] },
      CTX,
    );
    const lines = (cut[1]?.[3] ?? '').split('\n');
    expect(lines[0]).toBe(`test 0: fixme: ${filler} 0`);
    expect(lines.length).toBeLessThan(12);
    expect(lines.at(-1)).toBe(`(+${12 - (lines.length - 1)} more, see run)`);

    const long = renderExport(
      {
        ...CI_RUN,
        cases: [exportCase('TC-00001', 'failed', [runTest({ note: 'y'.repeat(900) })])],
      },
      CTX,
    );
    expect(long[1]?.[3]).toBe(`${'y'.repeat(300)}…`);
  });

  test('carries the run it came from beside the table', () => {
    expect(grid.slice(0, EXPORT_INFO_LABELS.length).map((row) => row.slice(5))).toEqual([
      ['', 'Release', 'verawood'],
      ['', 'Run', '123456'],
      ['', 'Run URL', RUN_URL],
      ['', 'Started (UTC)', '2026-09-15T09:14:05.000Z'],
      ['', 'Commit', 'abcdef1'],
      [
        '',
        'Coverage gaps reviewed against',
        'Willow Test Sheet V2.0 (2026-11-19), suite at abc1234.',
      ],
      ['', 'Summary', 'e2e on verawood · run 123456 · 2026-09-15 · abcdef1'],
    ]);
    // Rows past the block (header + 15 cases = 16 rows, 7 labels) are blank there.
    expect(grid.slice(EXPORT_INFO_LABELS.length).map((row) => row.slice(5))).toEqual(
      Array.from({ length: 9 }, () => ['', '', '']),
    );
  });

  test('without a gaps table and outside CI it still renders, by the run alone', () => {
    const local = renderExport(LOCAL_RUN, CTX);
    expect(local).toHaveLength(EXPORT_INFO_LABELS.length); // 2 cases, padded to the info block
    expect(local[1]?.slice(0, 5)).toEqual([
      'TC-00003',
      'partial',
      'yes',
      'skipped: no ADMIN_USERNAME',
      '',
    ]);
    expect(local[6]?.slice(6)).toEqual(['Summary', 'e2e on verawood · run local · 2026-09-15']);
  });
});

test.describe('planPublish', { tag: '@unit' }, () => {
  test('bootstraps an empty spreadsheet: tabs, title, meta, default tab removed', () => {
    const plan = planFor(EMPTY_SHEET);
    expect(plan.bootstrapping).toBe(true);

    const kinds = plan.structure.map((r) => Object.keys(r)[0]);
    expect(kinds).toEqual([
      'addSheet', // Latest
      'updateSheetProperties',
      'addSheet', // Runs
      'updateSheetProperties',
      'addSheet', // _meta
      'addSheet', // Export
      'updateSheetProperties',
      'updateSpreadsheetProperties',
      'deleteSheet',
      'addSheet', // run tab
      'updateSheetProperties',
    ]);
    const added = plan.structure
      .filter((r) => 'addSheet' in r)
      .map((r) => (r as { addSheet: { properties: Record<string, unknown> } }).addSheet.properties);
    expect(added.map((p) => p.title)).toEqual([
      LATEST_TAB,
      RUNS_TAB,
      META_TAB,
      EXPORT_TAB,
      plan.runTab.title,
    ]);
    expect(added.map((p) => p.sheetId)).toEqual([1, 2, 3, 4, 5]); // none collide with Sheet1 (0)
    expect(added[2]?.hidden).toBe(true);
    expect(added[3]?.index).toBe(3);
    // Run tab goes after Latest/Runs/_meta/Export once Sheet1 is gone.
    expect(added[4]?.index).toBe(4);
    expect(plan.structure).toContainEqual({ deleteSheet: { sheetId: 0 } });
    expect(plan.structure).toContainEqual({
      updateSpreadsheetProperties: {
        properties: { title: 'Open edX e2e BTR results — verawood' },
        fields: 'title',
      },
    });

    const ranges = plan.writes.map((w) => w.range);
    expect(ranges).toEqual([
      "'Runs'!A1:Q1",
      "'_meta'!A1:B4",
      `'${plan.runTab.title}'!A1:H${HEADER_ROWS + 1 + 1 + CI_RUN.cases.length}`,
      `'Latest'!A1:H${HEADER_ROWS + 1 + 1 + CI_RUN.cases.length}`,
      `'Export'!A1:H${EXPORT_INFO_LABELS.length}`,
    ]);
    expect(plan.writes[1]?.values).toContainEqual(['release', 'verawood']);
    expect(plan.clear).toEqual(["'Latest'", "'Export'"]);
    expect(plan.append.range).toBe("'Runs'!A1");
    expect(plan.append.values[0]?.at(-1)).toBe(`=HYPERLINK("#gid=5", "${plan.runTab.title}")`);
  });

  test('keeps a non-empty default tab and a custom spreadsheet title', () => {
    const plan = planFor({ ...EMPTY_SHEET, title: 'My sheet', defaultSheetHasValues: true });
    const kinds = plan.structure.map((r) => Object.keys(r)[0]);
    expect(kinds).not.toContain('deleteSheet');
    expect(kinds).not.toContain('updateSpreadsheetProperties');
  });

  test('on a bootstrapped sheet only adds the run tab and rewrites Latest', () => {
    const plan = planFor(BOOTSTRAPPED);
    expect(plan.bootstrapping).toBe(false);
    expect(plan.structure.map((r) => Object.keys(r)[0])).toEqual([
      'addSheet',
      'updateSheetProperties',
    ]);
    const add = plan.structure[0] as { addSheet: { properties: Record<string, unknown> } };
    // Newest first: ahead of the older run tab, straight after the fixed tabs.
    expect(add.addSheet.properties).toMatchObject({
      sheetId: 6,
      index: 4,
      title: plan.runTab.title,
    });
    expect(plan.writes.map((w) => w.range.split('!')[0])).toEqual([
      `'${plan.runTab.title}'`,
      "'Latest'",
      "'Export'",
    ]);
    expect(plan.clear).toEqual(["'Latest'", "'Export'"]);
  });

  test('does not touch Latest for a filtered or off-branch run', () => {
    const plan = planFor(BOOTSTRAPPED, { updateLatest: false });
    expect(plan.clear).toEqual([]);
    expect(plan.writes.map((w) => w.range.split('!')[0])).toEqual([`'${plan.runTab.title}'`]);
    expect(plan.append.range).toBe("'Runs'!A1");
  });

  test('refuses a sheet bootstrapped for another release', () => {
    expect(() => planFor(BOOTSTRAPPED, { ctx: { release: 'ulmo' } })).toThrow(PlanRefusal);
    expect(() => planFor(BOOTSTRAPPED, { ctx: { release: 'ulmo' } })).toThrow(
      /bootstrapped for release 'verawood' but this run is for 'ulmo'.*BTR_SHEET_URL_ULMO/,
    );
  });

  test('refuses a sheet with Latest but no _meta', () => {
    const state: SpreadsheetState = {
      ...BOOTSTRAPPED,
      sheets: BOOTSTRAPPED.sheets.filter((s) => s.title !== META_TAB),
      meta: undefined,
    };
    expect(() => planFor(state)).toThrow(/no '_meta' tab/);
  });

  test('re-creates a missing Runs tab on an otherwise bootstrapped sheet', () => {
    const state: SpreadsheetState = {
      ...BOOTSTRAPPED,
      sheets: BOOTSTRAPPED.sheets.filter((s) => s.title !== RUNS_TAB),
    };
    const plan = planFor(state);
    expect(plan.bootstrapping).toBe(false);
    expect(plan.writes[0]?.range).toBe("'Runs'!A1:Q1");
  });

  test('avoids a run-tab title collision by appending the run id', () => {
    const state: SpreadsheetState = {
      ...BOOTSTRAPPED,
      sheets: [...BOOTSTRAPPED.sheets, { sheetId: 9, title: '2026-09-15 09h14 UTC', index: 5 }],
    };
    expect(planFor(state).runTab.title).toBe('2026-09-15 09h14 UTC · 123456');
    expect(uniqueTabTitle('t', ['t', 't · 123456'], CI_RUN)).toBe('t · 123456 (2)');
    expect(uniqueTabTitle('t', ['t'], LOCAL_RUN)).toBe('t · 5');
  });

  test('adds Export to a sheet bootstrapped before it existed, after the fixed tabs', () => {
    const state: SpreadsheetState = {
      ...BOOTSTRAPPED,
      sheets: BOOTSTRAPPED.sheets
        .filter((s) => s.title !== EXPORT_TAB)
        .map((s, index) => ({ ...s, index })),
    };
    const plan = planFor(state);
    expect(plan.bootstrapping).toBe(false);
    const { order, rightwardMoves } = replayTabOrder(state, plan.structure);
    expect(rightwardMoves).toBe(0);
    expect(order).toEqual([
      LATEST_TAB,
      RUNS_TAB,
      META_TAB,
      EXPORT_TAB,
      plan.runTab.title,
      '2026-09-12 09h00 UTC',
    ]);
    expect(plan.writes.map((w) => w.range.split('!')[0])).toContain("'Export'");
  });

  test('a run that leaves Latest alone leaves Export alone too', () => {
    const plan = planFor(BOOTSTRAPPED, { updateLatest: false });
    expect(plan.clear).toEqual([]);
    expect(plan.writes.map((w) => w.range.split('!')[0])).not.toContain("'Export'");
  });

  test('tells run tabs from tabs a person added', () => {
    expect(isRunTab('2026-09-15 09h14 UTC')).toBe(true);
    expect(isRunTab('2026-09-15 09h14 UTC · staging')).toBe(true);
    expect(isRunTab('2026-09-15 09h14 UTC · 123456 (2)')).toBe(true);
    expect(isRunTab(LATEST_TAB)).toBe(false);
    expect(isRunTab('Notes 2026-09-15')).toBe(false);
  });

  test('reverses run tabs left oldest-first, leaving other tabs after them', () => {
    const titles = [
      LATEST_TAB,
      RUNS_TAB,
      META_TAB,
      EXPORT_TAB,
      '2026-09-10 09h00 UTC',
      'Scratch',
      '2026-09-12 09h00 UTC',
      '2026-09-12 09h00 UTC · 777',
      '2026-09-14 09h00 UTC',
    ];
    const state: SpreadsheetState = {
      ...BOOTSTRAPPED,
      sheets: titles.map((title, index) => ({ sheetId: index + 1, title, index })),
    };
    const plan = planFor(state);

    const { order, rightwardMoves } = replayTabOrder(state, plan.structure);
    expect(rightwardMoves).toBe(0);
    expect(order).toEqual([
      LATEST_TAB,
      RUNS_TAB,
      META_TAB,
      EXPORT_TAB,
      plan.runTab.title, // 2026-09-15 09h14 UTC
      '2026-09-14 09h00 UTC',
      '2026-09-12 09h00 UTC · 777',
      '2026-09-12 09h00 UTC',
      '2026-09-10 09h00 UTC',
      'Scratch',
    ]);
  });

  test('a run older than the newest tab lands in date order, not first', () => {
    const state: SpreadsheetState = {
      ...BOOTSTRAPPED,
      sheets: [...BOOTSTRAPPED.sheets, { sheetId: 9, title: 'Scratch', index: 5 }].map((s) =>
        s.sheetId === 4 ? { ...s, title: '2026-09-20 09h00 UTC' } : s,
      ),
    };
    const plan = planFor(state);
    const add = plan.structure[0] as { addSheet: { properties: Record<string, unknown> } };
    expect(add.addSheet.properties.index).toBe(5); // after the 09-20 tab, before Scratch
    expect(plan.structure.map((r) => Object.keys(r)[0])).toEqual([
      'addSheet',
      'updateSheetProperties', // freeze only: nothing to move
    ]);
  });

  test('reorder helpers move nothing when the tabs are already in place', () => {
    const tabs = [
      LATEST_TAB,
      RUNS_TAB,
      META_TAB,
      '2026-09-14 09h00 UTC',
      '2026-09-12 09h00 UTC',
    ].map((title, sheetId) => ({ sheetId, title }));
    expect(wantedTabOrder(tabs)).toEqual(tabs);
    expect(reorderRequests(tabs, wantedTabOrder(tabs))).toEqual([]);
    // A fixed tab dragged out of place is brought back to the front.
    const dragged = [tabs[3], tabs[0], tabs[1], tabs[2], tabs[4]].filter((t) => t !== undefined);
    expect(wantedTabOrder(dragged)).toEqual(tabs);
    expect(reorderRequests(dragged, tabs)).toEqual([
      { updateSheetProperties: { properties: { sheetId: 0, index: 0 }, fields: 'index' } },
      { updateSheetProperties: { properties: { sheetId: 1, index: 1 }, fields: 'index' } },
      { updateSheetProperties: { properties: { sheetId: 2, index: 2 }, fields: 'index' } },
    ]);
  });

  test('A1 helpers', () => {
    expect(columnLetter(1)).toBe('A');
    expect(columnLetter(26)).toBe('Z');
    expect(columnLetter(27)).toBe('AA');
    expect(rangeFor("O'Brien", [['a', 'b'], ['c']])).toBe("'O''Brien'!A1:B2");
    expect(rangeFor('t', [])).toBe("'t'!A1:A1");
  });
});

/* -------------------------------------------------------------------- google */

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY = {
  client_email: 'bot@project.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test.describe('google', { tag: '@unit' }, () => {
  test('parses a key and rejects junk', () => {
    expect(parseServiceAccountKey(JSON.stringify(KEY)).client_email).toBe(KEY.client_email);
    expect(() => parseServiceAccountKey('nope')).toThrow(/not valid JSON/);
    expect(() => parseServiceAccountKey('{"client_email":"x"}')).toThrow(/missing/);
  });

  test('signs an RS256 assertion Google can verify, with the Sheets scope', () => {
    const jwt = signAssertion(KEY, 1_700_000_000);
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      iss: KEY.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature!, 'base64url'))).toBe(true);
  });

  test('mints a token from the token endpoint and reports a refusal without key material', async () => {
    const calls: { url: string; body: string }[] = [];
    const ok: FetchLike = (url, init) => {
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
      return Promise.resolve(jsonResponse(200, { access_token: 'tok', expires_in: 3600 }));
    };
    await expect(mintAccessToken(KEY, ok, 1_700_000_000)).resolves.toBe('tok');
    expect(calls[0]?.url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[0]?.body).toMatch(/^grant_type=urn%3Aietf.*&assertion=/);

    const denied: FetchLike = () => Promise.resolve(jsonResponse(401, { error: 'invalid_grant' }));
    await expect(mintAccessToken(KEY, denied)).rejects.toThrow(/answered 401/);
  });

  test('extracts the spreadsheet id from a URL or accepts a bare id', () => {
    expect(
      parseSpreadsheetId('https://docs.google.com/spreadsheets/d/1AbC-dEf_GhI/edit#gid=0'),
    ).toBe('1AbC-dEf_GhI');
    expect(parseSpreadsheetId('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe(
      '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
    );
    expect(() => parseSpreadsheetId('https://example.com/x')).toThrow(/not a Google Sheets URL/);
  });

  test('client hits the right endpoints with the bearer token', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: FetchLike = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse(200, { values: [['a']] }));
    };
    const client = new SheetsClient('tok', 'SHEET', { fetchImpl });

    await client.get();
    await client.valuesGet("'_meta'!A1:B20");
    await client.valuesClear("'Latest'");
    await client.valuesBatchUpdate([{ range: "'Latest'!A1:B1", values: [['x', 'y']] }]);
    await client.valuesAppend("'Runs'!A1", [['r']]);
    await client.batchUpdate([{ addSheet: {} }]);
    await client.batchUpdate([]); // no-op, no call

    expect(calls.map((c) => c.url)).toEqual([
      'https://sheets.googleapis.com/v4/spreadsheets/SHEET?fields=properties.title,sheets.properties',
      "https://sheets.googleapis.com/v4/spreadsheets/SHEET/values/'_meta'!A1%3AB20",
      "https://sheets.googleapis.com/v4/spreadsheets/SHEET/values/'Latest':clear",
      'https://sheets.googleapis.com/v4/spreadsheets/SHEET/values:batchUpdate',
      "https://sheets.googleapis.com/v4/spreadsheets/SHEET/values/'Runs'!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
      'https://sheets.googleapis.com/v4/spreadsheets/SHEET:batchUpdate',
    ]);
    expect(
      calls.every(
        (c) => (c.init?.headers as Record<string, string>).authorization === 'Bearer tok',
      ),
    ).toBe(true);
    const batchBody = calls[3]?.init?.body;
    expect(JSON.parse(typeof batchBody === 'string' ? batchBody : '')).toEqual({
      valueInputOption: 'USER_ENTERED',
      data: [{ range: "'Latest'!A1:B1", values: [['x', 'y']] }],
    });
  });

  test('retries 429/5xx with backoff and gives up with a typed error', async () => {
    const responses = [
      jsonResponse(503, { error: { message: 'busy' } }),
      jsonResponse(429, { error: { message: 'busy' } }),
      jsonResponse(200, {}),
    ];
    const slept: number[] = [];
    const fetchImpl: FetchLike = () => Promise.resolve(responses.shift() ?? jsonResponse(200, {}));
    const client = new SheetsClient('tok', 'SHEET', {
      fetchImpl,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    await expect(client.get()).resolves.toEqual({});
    expect(slept).toEqual([1000, 2000]);

    const always503: FetchLike = () =>
      Promise.resolve(jsonResponse(503, { error: { message: 'down' } }));
    const failing = new SheetsClient('tok', 'SHEET', {
      fetchImpl: always503,
      sleep: () => Promise.resolve(),
    });
    await expect(failing.get()).rejects.toThrow(SheetsApiError);
    await expect(failing.get()).rejects.toThrow(/HTTP 503: down/);
  });

  test('a 403 tells the operator who to share the sheet with, without retrying', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = () => {
      calls += 1;
      return Promise.resolve(
        jsonResponse(403, { error: { message: 'The caller does not have permission' } }),
      );
    };
    const client = new SheetsClient('tok', 'SHEET', { fetchImpl, clientEmail: KEY.client_email });
    await expect(client.get()).rejects.toThrow(
      /HTTP 403: The caller does not have permission Share the spreadsheet with bot@project\.iam\.gserviceaccount\.com as an Editor\./,
    );
    expect(calls).toBe(1);
  });
});
