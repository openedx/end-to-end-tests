import { test, expect } from '@playwright/test';

import {
  casesFrom,
  ciMetaFromEnv,
  errorSnippet,
  finalTests,
  noteFor,
  summarizeRun,
  totalsFrom,
  type RunAttempt,
  type RunMeta,
} from '../../src/reporting';

/**
 * A passing attempt with sensible defaults; override what the case is about. A
 * test is identified by its title across CI profiles, so each key gets its own
 * default title unless the case sets one.
 */
function attempt(overrides: Partial<RunAttempt> = {}): RunAttempt {
  const testKey = overrides.testKey ?? 'k1';
  return {
    testKey,
    title: testKey === 'k1' ? 'signs in' : `signs in (${testKey})`,
    spec: 'tests/lms/auth/login.spec.ts',
    project: 'smoke',
    testIds: ['TC-00003'],
    status: 'passed',
    rawStatus: 'passed',
    expectedStatus: 'passed',
    durationMs: 1000,
    annotations: [{ type: 'test_id', description: 'TC-00003' }],
    a11yFailures: [],
    ...overrides,
  };
}

const LOCAL_RUN: RunMeta = {
  startedAt: '2026-09-15T09:00:00.000Z',
  durationMs: 120_000,
  status: 'passed',
  lmsBaseUrl: 'http://local.openedx.io',
  filter: { paths: [], grep: '', grepInvert: '' },
  ci: null,
};

test.describe('noteFor', { tag: '@unit' }, () => {
  test('is empty for a clean first-attempt pass', () => {
    expect(noteFor(attempt(), 1)).toBe('');
  });

  test('flags a pass that needed a retry as flaky', () => {
    expect(noteFor(attempt(), 2)).toBe('flaky: passed on attempt 2');
  });

  test('reports a runtime skip with its reason', () => {
    const a = attempt({
      status: 'skipped',
      rawStatus: 'skipped',
      annotations: [{ type: 'skip', description: 'Installation does not have: wiki.' }],
    });
    expect(noteFor(a, 1)).toBe('skipped: Installation does not have: wiki.');
  });

  test('reports a declarative fixme without a reason as such', () => {
    const a = attempt({
      status: 'skipped',
      rawStatus: 'skipped',
      expectedStatus: 'skipped',
      annotations: [{ type: 'fixme' }],
    });
    expect(noteFor(a, 1)).toBe('fixme (no reason recorded)');
  });

  test('prefers a known_gap reason and appends the issue link to a fixme', () => {
    const a = attempt({
      status: 'skipped',
      rawStatus: 'skipped',
      expectedStatus: 'skipped',
      annotations: [
        { type: 'fixme' },
        { type: 'issue', description: 'https://github.com/openedx/x/issues/1' },
        { type: 'known_gap', description: 'PLAT-009: navigation returns 500' },
      ],
    });
    expect(noteFor(a, 1)).toBe(
      'fixme: PLAT-009: navigation returns 500 — https://github.com/openedx/x/issues/1',
    );
  });

  test('reads a duly failing test.fail as a known defect', () => {
    const a = attempt({
      status: 'skipped',
      rawStatus: 'failed',
      expectedStatus: 'failed',
      annotations: [{ type: 'issue', description: 'https://github.com/openedx/x/issues/2' }],
      errorMessage: 'expect(received).toBe(expected)',
    });
    expect(noteFor(a, 1)).toBe(
      'expected failure (known defect): https://github.com/openedx/x/issues/2',
    );
  });

  test('calls out a test.fail that unexpectedly passed', () => {
    const a = attempt({ status: 'failed', rawStatus: 'passed', expectedStatus: 'failed' });
    expect(noteFor(a, 1)).toMatch(/^UNEXPECTED PASS/);
  });

  test('uses the first line of the error, without colour codes, for a failure', () => {
    const a = attempt({
      status: 'failed',
      rawStatus: 'failed',
      errorMessage: '\n\u001b[31mError: \u001b[39mexpect(locator).toBeVisible()\n\nLocator: …',
    });
    expect(noteFor(a, 3)).toBe('failed: Error: expect(locator).toBeVisible()');
  });

  test('labels a timeout and keeps the error detail', () => {
    const a = attempt({
      status: 'timedOut',
      rawStatus: 'timedOut',
      errorMessage: 'Test timeout of 60000ms exceeded.',
    });
    expect(noteFor(a, 1)).toBe('timed out: Test timeout of 60000ms exceeded.');
  });

  test('prefers the a11y violation list over the generic expect error', () => {
    const a = attempt({
      status: 'failed',
      rawStatus: 'failed',
      errorMessage: 'expect(received).toEqual(expected)',
      a11yFailures: ['color-contrast (serious): Elements must meet minimum color contrast'],
    });
    expect(noteFor(a, 1)).toBe(
      'failed: a11y: color-contrast (serious): Elements must meet minimum color contrast',
    );
  });

  test('reports an interrupted attempt', () => {
    const a = attempt({ status: 'interrupted', rawStatus: 'interrupted' });
    expect(noteFor(a, 1)).toBe('interrupted (run aborted)');
  });
});

test.describe('errorSnippet', { tag: '@unit' }, () => {
  test('truncates long lines with an ellipsis', () => {
    const snippet = errorSnippet('x'.repeat(300));
    expect(snippet).toHaveLength(200);
    expect(snippet.endsWith('…')).toBe(true);
  });

  test('returns an empty string for a blank message', () => {
    expect(errorSnippet('\n  \n')).toBe('');
  });
});

test.describe('finalTests', { tag: '@unit' }, () => {
  test("collapses retries to the last attempt but sums every attempt's time", () => {
    const tests = finalTests([
      attempt({ rawStatus: 'failed', status: 'failed', durationMs: 5000, errorMessage: 'boom' }),
      attempt({ durationMs: 1500 }),
      attempt({ testKey: 'k2', title: 'other', testIds: [], durationMs: 200 }),
    ]);

    expect(tests).toHaveLength(2);
    expect(tests[0]).toMatchObject({
      title: 'signs in',
      status: 'passed',
      durationMs: 6500,
      attempts: 2,
      note: 'flaky: passed on attempt 2',
    });
    expect(tests[1]).toMatchObject({ title: 'other', attempts: 1, durationMs: 200, note: '' });
  });
});

test.describe('finalTests across CI profiles', { tag: '@unit' }, () => {
  // The same test from two profiles' blobs: merge-reports gives the second its
  // own key, the title (project › spec › test) stays the same.
  const skippedInDefault = attempt({
    testKey: 'default-id',
    title: 'signs in',
    profile: 'default',
    shard: 'd1',
    status: 'skipped',
    rawStatus: 'skipped',
    annotations: [{ type: 'skip', description: 'missing capability rbac-global' }],
  });

  test('reports the profile that ran a test over one that skipped it', () => {
    const tests = finalTests([
      skippedInDefault,
      attempt({ testKey: 'extended-id', title: 'signs in', profile: 'extended', shard: 'x1' }),
    ]);
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({
      status: 'passed',
      profile: 'extended',
      shard: 'x1',
      note: '',
      attempts: 1,
    });
  });

  test('keeps the first skip when every profile skipped the test', () => {
    const tests = finalTests([
      skippedInDefault,
      attempt({ ...skippedInDefault, testKey: 'extended-id', profile: 'extended', shard: 'x1' }),
    ]);
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({ status: 'skipped', profile: 'default' });
  });

  test('reports the worst result, naming its profile, when the profiles disagree', () => {
    const tests = finalTests([
      attempt({ testKey: 'default-id', title: 'signs in', profile: 'default' }),
      attempt({
        testKey: 'extended-id',
        title: 'signs in',
        profile: 'extended',
        status: 'failed',
        rawStatus: 'failed',
        errorMessage: 'boom',
      }),
    ]);
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({
      status: 'failed',
      profile: 'extended',
      note: 'in extended: failed: boom',
    });
  });

  test('does not name a profile when every profile that ran the test agrees', () => {
    const known = { status: 'skipped', rawStatus: 'failed', expectedStatus: 'failed' } as const;
    const tests = finalTests([
      attempt({ testKey: 'default-id', title: 'signs in', profile: 'default', ...known }),
      attempt({ testKey: 'extended-id', title: 'signs in', profile: 'extended', ...known }),
    ]);
    expect(tests[0]?.note).toBe('expected failure (known defect)');
  });

  test('counts the reported profile’s attempts and time, not the others’', () => {
    const tests = finalTests([
      { ...skippedInDefault, durationMs: 50 },
      attempt({
        testKey: 'extended-id',
        title: 'signs in',
        profile: 'extended',
        status: 'failed',
        rawStatus: 'failed',
        durationMs: 3000,
      }),
      attempt({ testKey: 'extended-id', title: 'signs in', profile: 'extended', durationMs: 1000 }),
    ]);
    expect(tests[0]).toMatchObject({
      status: 'passed',
      attempts: 2,
      durationMs: 4000,
      note: 'flaky: passed on attempt 2',
    });
  });

  test('prefers a known-gap run (test.fail) over a capability skip', () => {
    const tests = finalTests([
      skippedInDefault,
      attempt({
        testKey: 'extended-id',
        title: 'signs in',
        profile: 'extended',
        status: 'skipped',
        rawStatus: 'failed',
        expectedStatus: 'failed',
      }),
    ]);
    expect(tests[0]).toMatchObject({
      profile: 'extended',
      note: 'expected failure (known defect)',
    });
  });
});

test.describe('casesFrom', { tag: '@unit' }, () => {
  test('makes one row per BTR case, sorted, with specs and projects de-duplicated', () => {
    const cases = casesFrom(
      finalTests([
        attempt({ testKey: 'a', testIds: ['TC-00003'], durationMs: 1000 }),
        attempt({
          testKey: 'b',
          title: 'rejects a bad password',
          testIds: ['TC-00003'],
          durationMs: 2000,
          status: 'skipped',
          rawStatus: 'skipped',
          annotations: [{ type: 'skip', description: 'no ADMIN_USERNAME' }],
        }),
        attempt({
          testKey: 'c',
          title: 'registers',
          spec: 'tests/lms/auth/register.spec.ts',
          project: 'regression',
          testIds: ['TC-00002'],
          durationMs: 3000,
        }),
      ]),
    );

    expect(cases.map((c) => c.testId)).toEqual(['TC-00002', 'TC-00003']);
    expect(cases[1]).toMatchObject({
      testId: 'TC-00003',
      verdict: 'partial',
      specs: ['tests/lms/auth/login.spec.ts'],
      projects: ['smoke'],
      durationMs: 3000,
      attempts: 2,
    });
    expect(cases[1]?.tests.map((t) => t.note)).toEqual(['', 'skipped: no ADMIN_USERNAME']);
    expect(cases[0]).toMatchObject({ verdict: 'verified', projects: ['regression'] });
  });

  test('puts a test with two IDs in both rows', () => {
    const cases = casesFrom(finalTests([attempt({ testIds: ['TC-00010', 'TC-00011'] })]));
    expect(cases.map((c) => c.testId)).toEqual(['TC-00010', 'TC-00011']);
    expect(cases.every((c) => c.tests.length === 1)).toBe(true);
  });

  test('leaves unannotated tests out of the case list', () => {
    expect(casesFrom(finalTests([attempt({ testIds: [] })]))).toEqual([]);
  });
});

test.describe('totalsFrom', { tag: '@unit' }, () => {
  test('counts statuses, flaky passes and annotation coverage', () => {
    const totals = totalsFrom(
      finalTests([
        attempt({ testKey: 'a' }),
        attempt({ testKey: 'b', rawStatus: 'failed', status: 'failed' }),
        attempt({ testKey: 'b' }),
        attempt({ testKey: 'c', rawStatus: 'timedOut', status: 'timedOut' }),
        attempt({ testKey: 'd', rawStatus: 'skipped', status: 'skipped', testIds: [] }),
      ]),
    );
    expect(totals).toEqual({
      tests: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      flaky: 1,
      annotated: 3,
      unannotated: 1,
    });
  });
});

test.describe('summarizeRun', { tag: '@unit' }, () => {
  test('assembles the report with verdict totals and the run metadata', () => {
    const report = summarizeRun(
      [
        attempt({ testKey: 'a', testIds: ['TC-00003'] }),
        attempt({ testKey: 'b', testIds: ['TC-00004'], rawStatus: 'failed', status: 'failed' }),
      ],
      LOCAL_RUN,
      '2026-09-15T09:02:00.000Z',
    );

    expect(report.schemaVersion).toBe(1);
    expect(report.generatedAt).toBe('2026-09-15T09:02:00.000Z');
    expect(report.run).toBe(LOCAL_RUN);
    expect(report.verdicts).toEqual({ verified: 1, partial: 0, unverified: 0, failed: 1 });
    expect(report.cases).toHaveLength(2);
    expect(report.tests).toHaveLength(2);
  });

  test('keeps full metadata for a run with no annotated tests', () => {
    const report = summarizeRun([attempt({ testIds: [] })], LOCAL_RUN);
    expect(report.cases).toEqual([]);
    expect(report.totals).toMatchObject({ tests: 1, annotated: 0, unannotated: 1 });
    expect(report.run.status).toBe('passed');
  });

  test('handles a run that saw no tests at all', () => {
    const report = summarizeRun([], { ...LOCAL_RUN, status: 'failed' });
    expect(report.totals.tests).toBe(0);
    expect(report.verdicts).toEqual({ verified: 0, partial: 0, unverified: 0, failed: 0 });
  });
});

test.describe('ciMetaFromEnv', { tag: '@unit' }, () => {
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'openedx/end-to-end-tests',
    GITHUB_WORKFLOW: 'Tutor E2E Test',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF_NAME: 'main',
    GITHUB_SHA: 'abc123',
    OPENEDX_RELEASE: 'verawood',
  };

  test('is null outside GitHub Actions', () => {
    expect(ciMetaFromEnv({})).toBeNull();
    expect(ciMetaFromEnv({ GITHUB_RUN_ID: '1' })).toBeNull();
  });

  test('builds the run link and reads the release', () => {
    expect(ciMetaFromEnv(env)).toEqual({
      runId: '123',
      runAttempt: '2',
      runUrl: 'https://github.com/openedx/end-to-end-tests/actions/runs/123',
      repository: 'openedx/end-to-end-tests',
      workflow: 'Tutor E2E Test',
      eventName: 'workflow_dispatch',
      ref: 'main',
      sha: 'abc123',
      release: 'verawood',
    });
  });

  test("prefers the tested ref and the checked-out commit over the workflow's", () => {
    const meta = ciMetaFromEnv({ ...env, BTR_TEST_REF: 'feature/x' }, 'def456');
    expect(meta?.ref).toBe('feature/x');
    expect(meta?.sha).toBe('def456');
  });

  test('prefers the release the run-suite action declares', () => {
    expect(ciMetaFromEnv({ ...env, BTR_RELEASE: 'ulmo' })?.release).toBe('ulmo');
  });

  test('reads a missing release as null', () => {
    expect(ciMetaFromEnv({ ...env, OPENEDX_RELEASE: '' })?.release).toBeNull();
  });
});
