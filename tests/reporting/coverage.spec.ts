import { test, expect } from '@playwright/test';

import { summarizeCoverage, type TestOutcome } from '../../src/reporting';

test.describe('summarizeCoverage', { tag: '@unit' }, () => {
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

    expect(summary.byTestId).toEqual([
      {
        testId: 'TC-00003',
        status: 'failed',
        verdict: 'failed',
        counts: { passed: 1, failed: 1 },
      },
    ]);
  });

  test('reports a case with passing and skipped coverage as partial', () => {
    // The shape a case takes when part of it is blocked on an upstream defect and
    // held in a `test.fixme`: the worst status alone would report the whole case as
    // skipped and hide the coverage that does exist.
    const summary = summarizeCoverage([
      { title: 'covered', status: 'passed', testIds: ['TC-00016'] },
      { title: 'covered too', status: 'passed', testIds: ['TC-00016'] },
      { title: 'blocked upstream', status: 'skipped', testIds: ['TC-00016'] },
    ]);

    expect(summary.byTestId).toEqual([
      {
        testId: 'TC-00016',
        status: 'skipped',
        verdict: 'partial',
        counts: { passed: 2, skipped: 1 },
      },
    ]);
    expect(summary.verdicts).toEqual({ verified: 0, partial: 1, unverified: 0, failed: 0 });
  });

  test('reports a case whose every test was skipped as unverified', () => {
    const summary = summarizeCoverage([
      { title: 'gated off', status: 'skipped', testIds: ['TC-00032'] },
    ]);

    expect(summary.byTestId[0]?.verdict).toBe('unverified');
    expect(summary.verdicts.unverified).toBe(1);
  });

  test('reports a case whose every test passed as verified', () => {
    const summary = summarizeCoverage([
      { title: 'a', status: 'passed', testIds: ['TC-00003'] },
      { title: 'b', status: 'passed', testIds: ['TC-00003'] },
    ]);

    expect(summary.byTestId[0]).toEqual({
      testId: 'TC-00003',
      status: 'passed',
      verdict: 'verified',
      counts: { passed: 2 },
    });
    expect(summary.verdicts.verified).toBe(1);
  });

  test('a timed-out or interrupted test counts as a failure for its case', () => {
    for (const status of ['timedOut', 'interrupted'] as const) {
      const summary = summarizeCoverage([
        { title: 'passing half', status: 'passed', testIds: ['TC-00022'] },
        { title: 'other half', status, testIds: ['TC-00022'] },
      ]);
      expect(summary.byTestId[0]?.verdict, status).toBe('failed');
    }
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
    expect(summary.verdicts).toEqual({ verified: 0, partial: 0, unverified: 0, failed: 0 });
  });
});
