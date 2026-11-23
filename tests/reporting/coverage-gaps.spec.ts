import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect } from '@playwright/test';

import { GAP_REASONS, parseCoverageGaps } from '../../scripts/btr-sheet/coverage-gaps.mts';

const START = '<!-- manual-check-table:start -->';
const END = '<!-- manual-check-table:end -->';

function doc(rows: readonly string[], reviewed = 'Reviewed against: sheet V1, suite at abc1234.') {
  return [
    '# Coverage gaps',
    '',
    reviewed,
    '',
    START,
    '',
    '| Test ID | Reason | What the suite does not check |',
    '| ------- | ------ | ----------------------------- |',
    ...rows,
    '',
    END,
    '',
  ].join('\n');
}

test.describe('coverage gaps table', { tag: '@unit' }, () => {
  test('the committed docs/coverage_gaps.md parses cleanly', () => {
    const markdown = readFileSync(join(process.cwd(), 'docs', 'coverage_gaps.md'), 'utf8');
    const gaps = parseCoverageGaps(markdown);
    expect(gaps.problems).toEqual([]);
    expect(gaps.reviewedAgainst).not.toBe('');
    expect(gaps.byTestId.size).toBeGreaterThan(0);
    // Every reason the document's legend offers is one the parser accepts.
    const legend = [...markdown.matchAll(/^\| `([a-z ]+)`\s+\|/gm)].map((m) => m[1]);
    expect(legend).toEqual([...GAP_REASONS]);
  });

  test('reads rows, the review line and an escaped pipe', () => {
    const gaps = parseCoverageGaps(
      doc([
        '| TC-00002 | email | No test reads the activation mail. |',
        '| TC-00008 | wording | Expects "a \\| b" on the button. |',
      ]),
    );
    expect(gaps.problems).toEqual([]);
    expect(gaps.reviewedAgainst).toBe('sheet V1, suite at abc1234.');
    expect(gaps.byTestId.get('TC-00002')).toEqual({
      testId: 'TC-00002',
      reason: 'email',
      text: 'No test reads the activation mail.',
    });
    expect(gaps.byTestId.get('TC-00008')?.text).toBe('Expects "a | b" on the button.');
  });

  test('reports bad rows and leaves them out', () => {
    const gaps = parseCoverageGaps(
      doc([
        '| TC-00010 | partial | Fine. |',
        '| TC-10 | partial | Bad id. |',
        '| TC-00011 | sometimes | Bad reason. |',
        '| TC-00012 | partial |  |',
        '| TC-00010 | partial | Again. |',
        '| TC-00013 | partial | A | stray pipe. |',
        '| TC-00009 | partial | Out of order, but kept. |',
      ]),
    );
    expect([...gaps.byTestId.keys()]).toEqual(['TC-00010', 'TC-00009']);
    expect(gaps.problems).toEqual([
      "'TC-10' is not a BTR test id (TC-NNNNN).",
      "TC-00011: reason 'sometimes' is not one of no test, gap, wording, email, visual, partial.",
      'TC-00012: no text saying what is not checked.',
      'TC-00010: listed more than once.',
      "TC-00013: more than three cells; escape a '|' inside the text as '\\|'.",
      'TC-00009: out of order; rows are sorted by test id.',
    ]);
  });

  test('a missing table, review line or rows is a problem, not a throw', () => {
    expect(parseCoverageGaps('# Coverage gaps\n').problems).toEqual([
      'No "Reviewed against:" line.',
      `No table between ${START} and ${END}.`,
    ]);
    expect(parseCoverageGaps(doc([])).problems).toEqual(['The table has no rows.']);
    expect(parseCoverageGaps(doc(['| TC-00001 | gap | x |'], '')).problems).toEqual([
      'No "Reviewed against:" line.',
    ]);
  });
});
