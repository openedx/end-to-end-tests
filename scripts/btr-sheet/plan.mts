/**
 * Decides what to do to a spreadsheet for one publish, as data: given what the
 * spreadsheet looks like now and the rendered run, produce the Sheets API
 * requests and value writes, in order. Pure, so bootstrap / already-bootstrapped
 * / title-collision / release-mismatch are all unit-tested without a network.
 *
 * Execution order (the client in `publish-btr-sheet.mts` follows it):
 *   1. `structure`  — `spreadsheets.batchUpdate`: add tabs, hide `_meta`, freeze,
 *                     title the spreadsheet, delete the empty default tab, and
 *                     put the run tabs newest first.
 *   2. `clear`      — `values.clear` on each range (the old `Latest` and `Export` content).
 *   3. `writes`     — `values.batchUpdate` with every grid (RAW so nothing we
 *                     wrote as text is re-parsed; formulas are USER_ENTERED).
 *   4. `append`     — `values.append` of the `Runs` row (server allocates the row,
 *                     so two concurrent publishes cannot clobber each other).
 *   5. `finish`     — `spreadsheets.batchUpdate`: auto-resize the new tab.
 */

import type { BtrRun } from '../../src/reporting/btr-run.ts';

import type { CoverageGaps } from './coverage-gaps.mts';
import {
  HEADER_ROWS,
  RUNS_HEADER,
  TABLE_HEADER,
  TABLE_HEADER_ROW,
  parseMeta,
  renderExport,
  renderMeta,
  renderRunSheet,
  renderRunsRow,
  tabTitleFor,
  type Grid,
  type PublishContext,
} from './render.mts';

export const LATEST_TAB = 'Latest';
export const RUNS_TAB = 'Runs';
export const META_TAB = '_meta';
/** The flat per-case view a BTR test-plan sheet imports; rewritten with `Latest`. */
export const EXPORT_TAB = 'Export';

/** Google's default title for a fresh spreadsheet (English locale). */
const UNTITLED = 'Untitled spreadsheet';

/** One tab as `spreadsheets.get` describes it. */
export interface SheetInfo {
  readonly sheetId: number;
  readonly title: string;
  readonly index: number;
}

/** What the client learned about the spreadsheet before planning. */
export interface SpreadsheetState {
  readonly title: string;
  readonly sheets: readonly SheetInfo[];
  /** `_meta!A:B` rows when the tab exists; `undefined` when it does not. */
  readonly meta?: Grid;
  /**
   * Whether the pre-existing single tab has any values. Probed by the client
   * only when bootstrapping; decides whether that tab can be deleted.
   */
  readonly defaultSheetHasValues?: boolean;
}

/** A Sheets `batchUpdate` request. Kept loose: the API has dozens of shapes. */
export type SheetsRequest = Readonly<Record<string, unknown>>;

export interface ValueWrite {
  readonly range: string;
  readonly values: Grid;
}

export interface PublishPlan {
  readonly runTab: { readonly title: string; readonly sheetId: number };
  readonly bootstrapping: boolean;
  readonly updateLatest: boolean;
  readonly structure: readonly SheetsRequest[];
  readonly clear: readonly string[];
  readonly writes: readonly ValueWrite[];
  readonly append: ValueWrite;
  readonly finish: readonly SheetsRequest[];
}

export interface PlanInput {
  readonly state: SpreadsheetState;
  readonly run: BtrRun;
  readonly ctx: PublishContext;
  /** Whether this run may replace `Latest` (unfiltered, default-branch run). */
  readonly updateLatest: boolean;
  /** Publish time, for `_meta.bootstrapped_at`. */
  readonly now: string;
  /** Publisher identification written to `_meta`. */
  readonly publisher: string;
  /** The manual-check table from `docs/coverage_gaps.md`; without it `Export` goes by the run alone. */
  readonly gaps?: CoverageGaps;
}

/** Thrown when publishing must stop before any write. */
export class PlanRefusal extends Error {}

/** A1 range covering a grid from the tab's top-left cell. */
export function rangeFor(tab: string, grid: Grid): string {
  const rows = Math.max(grid.length, 1);
  const cols = Math.max(...grid.map((r) => r.length), 1);
  return `'${tab.replace(/'/g, "''")}'!A1:${columnLetter(cols)}${rows}`;
}

/** 1 → A, 26 → Z, 27 → AA. */
export function columnLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** Picks sheet ids that cannot collide with existing tabs or each other. */
function idAllocator(existing: readonly SheetInfo[]): () => number {
  let next = Math.max(0, ...existing.map((s) => s.sheetId)) + 1;
  return () => next++;
}

function addSheet(
  sheetId: number,
  title: string,
  index: number,
  extra: Record<string, unknown> = {},
): SheetsRequest {
  return { addSheet: { properties: { sheetId, title, index, ...extra } } };
}

function freezeRows(sheetId: number, rows: number): SheetsRequest {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: rows } },
      fields: 'gridProperties.frozenRowCount',
    },
  };
}

function moveSheet(sheetId: number, index: number): SheetsRequest {
  return { updateSheetProperties: { properties: { sheetId, index }, fields: 'index' } };
}

/** The tabs the publisher owns besides the run tabs, in the order they lead the spreadsheet. */
const FIXED_TABS: readonly string[] = [LATEST_TAB, RUNS_TAB, META_TAB, EXPORT_TAB];

/**
 * A run tab's title starts with the UTC stamp `formatStamp` writes
 * (`2026-09-15 09h14 UTC`, optionally followed by ` · <environment or run id>`).
 * Anything else was added by a person and is never reordered among the run tabs.
 */
const RUN_TAB_TITLE = /^\d{4}-\d{2}-\d{2} \d{2}h\d{2} UTC/;

/** Whether a tab is a run's snapshot, going by its title. */
export function isRunTab(title: string): boolean {
  return RUN_TAB_TITLE.test(title);
}

/** A tab's identity while its position is being worked out. */
type TabRef = Pick<SheetInfo, 'sheetId' | 'title'>;

/**
 * The order the tabs should end up in: the fixed tabs, then the run tabs newest
 * first (the stamp sorts as text), then anything else in the order it was found.
 */
export function wantedTabOrder<T extends TabRef>(tabs: readonly T[]): T[] {
  const fixed = FIXED_TABS.flatMap((title) => tabs.filter((t) => t.title === title));
  const runs = tabs
    .filter((t) => isRunTab(t.title))
    .sort((a, b) => (a.title < b.title ? 1 : a.title > b.title ? -1 : 0));
  const others = tabs.filter((t) => !FIXED_TABS.includes(t.title) && !isRunTab(t.title));
  return [...fixed, ...runs, ...others];
}

/**
 * The moves that turn `current` into `wanted` (the same tabs in another order).
 * Each one brings a tab leftwards into its final slot, so every index means
 * the same thing before and after the move; Sheets counts a rightward move's
 * index with the tab still in its old place. Tabs already in place are not touched.
 */
export function reorderRequests(
  current: readonly TabRef[],
  wanted: readonly TabRef[],
): SheetsRequest[] {
  const order = current.map((t) => t.sheetId);
  const requests: SheetsRequest[] = [];
  wanted.forEach(({ sheetId }, index) => {
    if (order[index] === sheetId) {
      return;
    }
    order.splice(order.indexOf(sheetId), 1);
    order.splice(index, 0, sheetId);
    requests.push(moveSheet(sheetId, index));
  });
  return requests;
}

/**
 * A run-tab title that does not collide with an existing tab: the same minute
 * on the same target appends the run id (or the start time's seconds locally).
 */
export function uniqueTabTitle(base: string, existing: readonly string[], run: BtrRun): string {
  if (!existing.includes(base)) {
    return base;
  }
  const suffix = run.run.ci?.runId ?? new Date(run.run.startedAt).getUTCSeconds().toString();
  let candidate = `${base} · ${suffix}`;
  let n = 2;
  while (existing.includes(candidate)) {
    candidate = `${base} · ${suffix} (${n++})`;
  }
  return candidate;
}

/** Builds the publish plan, or throws {@link PlanRefusal} when it must not proceed. */
export function planPublish(input: PlanInput): PublishPlan {
  const { state, run, ctx, now, publisher } = input;
  const byTitle = new Map(state.sheets.map((s) => [s.title, s]));
  const nextId = idAllocator(state.sheets);
  const structure: SheetsRequest[] = [];
  const writes: ValueWrite[] = [];
  const clear: string[] = [];

  const bootstrapping = !byTitle.has(LATEST_TAB);

  // Release guard: an existing sheet must have been bootstrapped for this release.
  if (!bootstrapping) {
    const meta = parseMeta(state.meta);
    if (!state.meta) {
      throw new PlanRefusal(
        `Spreadsheet has a '${LATEST_TAB}' tab but no '${META_TAB}' tab; it was not bootstrapped by this publisher. Refusing to write.`,
      );
    }
    if (meta.release !== ctx.release) {
      throw new PlanRefusal(
        `Spreadsheet is bootstrapped for release '${meta.release ?? '(none)'}' but this run is for '${ctx.release}'. Check the BTR_SHEET_URL_${ctx.release.toUpperCase()} variable.`,
      );
    }
  }

  // The tab order as it will be once the requests so far have run, so the new
  // run tab can be placed and any out-of-place tabs moved.
  const order: TabRef[] = [...state.sheets]
    .sort((a, b) => a.index - b.index)
    .map(({ sheetId, title }) => ({ sheetId, title }));

  // --- Bootstrap: Latest, Runs, _meta; title; drop the empty default tab. ---
  let latestId = byTitle.get(LATEST_TAB)?.sheetId;
  if (latestId === undefined) {
    latestId = nextId();
    structure.push(addSheet(latestId, LATEST_TAB, 0), freezeRows(latestId, TABLE_HEADER_ROW));
    order.splice(0, 0, { sheetId: latestId, title: LATEST_TAB });
  }
  let runsId = byTitle.get(RUNS_TAB)?.sheetId;
  if (runsId === undefined) {
    runsId = nextId();
    structure.push(addSheet(runsId, RUNS_TAB, 1), freezeRows(runsId, 1));
    writes.push({ range: rangeFor(RUNS_TAB, [RUNS_HEADER]), values: [RUNS_HEADER] });
    order.splice(1, 0, { sheetId: runsId, title: RUNS_TAB });
  }
  if (!byTitle.has(META_TAB)) {
    const metaId = nextId();
    structure.push(addSheet(metaId, META_TAB, 2, { hidden: true }));
    const meta = renderMeta(ctx.release, now, publisher);
    writes.push({ range: rangeFor(META_TAB, meta), values: meta });
    order.splice(2, 0, { sheetId: metaId, title: META_TAB });
  }
  // `Export` came after the first sheets were bootstrapped, so it is added to
  // those on their next publish, in its place after the other fixed tabs.
  if (!byTitle.has(EXPORT_TAB)) {
    const exportId = nextId();
    const index = FIXED_TABS.filter(
      (t) => t !== EXPORT_TAB && order.some((o) => o.title === t),
    ).length;
    structure.push(addSheet(exportId, EXPORT_TAB, index), freezeRows(exportId, 1));
    order.splice(index, 0, { sheetId: exportId, title: EXPORT_TAB });
  }
  if (bootstrapping) {
    if (state.title === UNTITLED || state.title === '') {
      structure.push({
        updateSpreadsheetProperties: {
          properties: { title: `Open edX e2e BTR results — ${ctx.release}` },
          fields: 'title',
        },
      });
    }
    // The single tab Google creates with a new spreadsheet, if still empty.
    if (state.sheets.length === 1 && state.defaultSheetHasValues === false) {
      const [only] = state.sheets;
      if (only && !FIXED_TABS.includes(only.title)) {
        structure.push({ deleteSheet: { sheetId: only.sheetId } });
        // `order` holds copies, so the tab is found by its id.
        const at = order.findIndex((o) => o.sheetId === only.sheetId);
        if (at !== -1) {
          order.splice(at, 1);
        }
      }
    }
  }

  // --- This run's tab, in its place among the run tabs: newest first, straight
  // after the fixed tabs. Then any tab that is out of place is moved, which on
  // a sheet in the older oldest-first layout reverses the run tabs once.
  const runTabTitle = uniqueTabTitle(tabTitleFor(run, ctx), [...byTitle.keys()], run);
  const runTabId = nextId();
  const runTab: TabRef = { sheetId: runTabId, title: runTabTitle };
  const wanted = wantedTabOrder([...order, runTab]);
  const runTabIndex = Math.min(wanted.indexOf(runTab), order.length);
  structure.push(
    addSheet(runTabId, runTabTitle, runTabIndex),
    freezeRows(runTabId, TABLE_HEADER_ROW),
  );
  order.splice(runTabIndex, 0, runTab);
  structure.push(...reorderRequests(order, wanted));

  const grid = renderRunSheet(run, ctx);
  writes.push({ range: rangeFor(runTabTitle, grid), values: grid });

  if (input.updateLatest) {
    clear.push(`'${LATEST_TAB}'`);
    writes.push({ range: rangeFor(LATEST_TAB, grid), values: grid });
    // `Export` follows `Latest`: only a complete, unfiltered default-branch run feeds it.
    const exported = renderExport(run, ctx, input.gaps);
    clear.push(`'${EXPORT_TAB}'`);
    writes.push({ range: rangeFor(EXPORT_TAB, exported), values: exported });
  }

  const runsRow = renderRunsRow(run, ctx, { title: runTabTitle, sheetId: runTabId });
  const append: ValueWrite = { range: `'${RUNS_TAB}'!A1`, values: [runsRow] };

  const finish: SheetsRequest[] = [
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId: runTabId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: TABLE_HEADER.length,
        },
      },
    },
  ];

  return {
    runTab: { title: runTabTitle, sheetId: runTabId },
    bootstrapping,
    updateLatest: input.updateLatest,
    structure,
    clear,
    writes,
    append,
    finish,
  };
}

/** Rows a `Latest`/run tab occupies before the table starts; exported for tests. */
export const RUN_SHEET_TABLE_OFFSET = HEADER_ROWS + 1;
