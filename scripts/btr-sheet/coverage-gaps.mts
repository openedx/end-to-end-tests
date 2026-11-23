/**
 * Reads the "Cases needing a manual check" table out of `docs/coverage_gaps.md`:
 * the one hand-maintained input to the BTR results export. A run can say that a
 * case's tests passed; it cannot say that the tests cover only part of the
 * case, or that the case asks for wording the suite does not read. This table
 * does. Pure, so the committed file is validated by a `@unit` spec.
 */

/** Why a case needs a person although its tests may pass. */
export const GAP_REASONS = ['no test', 'gap', 'wording', 'email', 'visual', 'partial'] as const;

export type GapReason = (typeof GAP_REASONS)[number];

export interface CoverageGap {
  readonly testId: string;
  readonly reason: GapReason;
  /** What the suite does not check, as the sheet's notes column will show it. */
  readonly text: string;
}

export interface CoverageGaps {
  /** The "Reviewed against:" line, so a reader can see how old the review is. */
  readonly reviewedAgainst: string;
  readonly byTestId: ReadonlyMap<string, CoverageGap>;
  /** Everything wrong with the table. Rows with a problem are left out of `byTestId`. */
  readonly problems: readonly string[];
}

const TABLE_START = '<!-- manual-check-table:start -->';
const TABLE_END = '<!-- manual-check-table:end -->';
const TEST_ID = /^TC-\d{5}$/;

/** Splits a Markdown table row into trimmed cells, honouring `\|` inside a cell. */
function cellsOf(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());
}

function isReason(value: string): value is GapReason {
  return (GAP_REASONS as readonly string[]).includes(value);
}

/**
 * Parses the document. Never throws: a missing table or a bad row is reported
 * in `problems`, so the publisher can warn and carry on while the unit spec
 * fails the build.
 */
export function parseCoverageGaps(markdown: string): CoverageGaps {
  const problems: string[] = [];
  const byTestId = new Map<string, CoverageGap>();
  const reviewedAgainst = /^Reviewed against:\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';
  if (!reviewedAgainst) {
    problems.push('No "Reviewed against:" line.');
  }

  const start = markdown.indexOf(TABLE_START);
  const end = markdown.indexOf(TABLE_END);
  if (start === -1 || end === -1 || end < start) {
    problems.push(`No table between ${TABLE_START} and ${TABLE_END}.`);
    return { reviewedAgainst, byTestId, problems };
  }

  const rows = markdown
    .slice(start + TABLE_START.length, end)
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .slice(2); // header and its separator

  let previous = '';
  for (const line of rows) {
    const [testId = '', reason = '', text = '', ...extra] = cellsOf(line);
    if (!TEST_ID.test(testId)) {
      problems.push(`'${testId}' is not a BTR test id (TC-NNNNN).`);
      continue;
    }
    if (extra.length > 0) {
      problems.push(`${testId}: more than three cells; escape a '|' inside the text as '\\|'.`);
      continue;
    }
    if (!isReason(reason)) {
      problems.push(`${testId}: reason '${reason}' is not one of ${GAP_REASONS.join(', ')}.`);
      continue;
    }
    if (!text) {
      problems.push(`${testId}: no text saying what is not checked.`);
      continue;
    }
    if (byTestId.has(testId)) {
      problems.push(`${testId}: listed more than once.`);
      continue;
    }
    if (testId < previous) {
      problems.push(`${testId}: out of order; rows are sorted by test id.`);
    }
    previous = testId;
    byTestId.set(testId, { testId, reason, text });
  }
  if (byTestId.size === 0 && problems.length === 0) {
    problems.push('The table has no rows.');
  }
  return { reviewedAgainst, byTestId, problems };
}
