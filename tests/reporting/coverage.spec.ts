import { test, expect } from '@playwright/test';

import { summarizeCoverage, type TestOutcome } from '../../src/reporting';

test.describe('summarizeCoverage @unit', () => {
  test('reports annotation coverage and per-case outcomes', () => {
    const outcomes: TestOutcome[] = [
      { title: 'login valid', status: 'passed', testIds: ['TC-00003'] },
      { title: 'login invalid', status: 'failed', testIds: ['TC-00003'] },
      { title: 'register', status: 'passed', testIds: ['TC-00002'] },
      { title: 'unmapped exploratory', status: 'passed', testIds: [] },
    ];

    const summary = summarizeCoverage(outcomes);

    expect(summary.total).toBe(4);
    expect(summary.annotated).toBe(3);
    expect(summary.unannotated).toBe(1);
    expect(summary.coverageRatio).toBeCloseTo(0.75);
    expect(summary.unannotatedTitles).toEqual(['unmapped exploratory']);
  });

  test('collapses several outcomes for one case to the worst status', () => {
    const summary = summarizeCoverage([
      { title: 'a', status: 'passed', testIds: ['TC-00003'] },
      { title: 'b', status: 'failed', testIds: ['TC-00003'] },
    ]);

    expect(summary.byTestId).toEqual([{ testId: 'TC-00003', status: 'failed' }]);
  });

  test('sorts case IDs deterministically', () => {
    const summary = summarizeCoverage([
      { title: 'b', status: 'passed', testIds: ['TC-00005'] },
      { title: 'a', status: 'passed', testIds: ['TC-00001'] },
    ]);

    expect(summary.byTestId.map((entry) => entry.testId)).toEqual(['TC-00001', 'TC-00005']);
  });

  test('treats an empty run as fully covered', () => {
    const summary = summarizeCoverage([]);
    expect(summary.total).toBe(0);
    expect(summary.coverageRatio).toBe(1);
    expect(summary.byTestId).toEqual([]);
  });
});
