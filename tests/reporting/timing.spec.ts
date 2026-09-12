import { test, expect } from '@playwright/test';

import {
  csvField,
  flattenSteps,
  slowestTests,
  stepRowsToCsv,
  testRowsToCsv,
  type StepNode,
  type TestTimingRow,
} from '../../src/reporting';

const context = { runStartedAt: '2026-09-12T10:00:00.000Z', baseUrl: 'https://lms.example' };
const identity = { project: 'smoke', file: 'tests/lms/auth/login.spec.ts', title: 'a', retry: 0 };

function step(title: string, category: string, steps: StepNode[] = []): StepNode {
  return {
    title,
    category,
    startedAt: '2026-09-12T10:00:01.000Z',
    durationMs: 10,
    failed: false,
    steps,
  };
}

test.describe('timing report', { tag: '@unit' }, () => {
  test('flattens nested steps with depth and ancestry path', () => {
    const rows = flattenSteps(identity, [
      step('Before Hooks', 'hook', [
        step('fixture: page', 'fixture', [step('browser.newPage', 'pw:api')]),
      ]),
      step('page.goto', 'pw:api'),
    ]);

    expect(rows.map((r) => [r.depth, r.path])).toEqual([
      [0, 'Before Hooks'],
      [1, 'Before Hooks › fixture: page'],
      [2, 'Before Hooks › fixture: page › browser.newPage'],
      [0, 'page.goto'],
    ]);
  });

  test('filters by category without losing the children of hidden steps', () => {
    const rows = flattenSteps(
      identity,
      [
        step('Before Hooks', 'hook', [
          step('fixture: page', 'fixture', [step('browser.newPage', 'pw:api')]),
        ]),
      ],
      new Set(['pw:api']),
    );

    expect(rows.map((r) => r.path)).toEqual(['Before Hooks › fixture: page › browser.newPage']);
  });

  test('quotes CSV fields that contain separators, quotes or newlines', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField(42)).toBe('42');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });

  test('writes one header and one line per test attempt', () => {
    const rows: TestTimingRow[] = [
      {
        ...identity,
        title: 'Login › signs in, then out',
        testIds: ['TC-00003', 'TC-00004'],
        tags: ['@smoke', '@authenticated'],
        status: 'passed',
        expectedStatus: 'passed',
        workerIndex: 2,
        startedAt: '2026-09-12T10:00:01.000Z',
        durationMs: 1234,
      },
    ];

    const csv = testRowsToCsv(context, rows).split('\n');

    expect(csv[0]).toBe(
      'run_started_at,base_url,project,file,title,test_ids,tags,retry,status,expected_status,worker_index,started_at,duration_ms',
    );
    expect(csv[1]).toBe(
      '2026-09-12T10:00:00.000Z,https://lms.example,smoke,tests/lms/auth/login.spec.ts,' +
        '"Login › signs in, then out",TC-00003 TC-00004,@smoke @authenticated,0,passed,passed,2,' +
        '2026-09-12T10:00:01.000Z,1234',
    );
    expect(csv).toHaveLength(3); // trailing newline
  });

  test('writes step rows with the same run context columns', () => {
    const rows = flattenSteps(identity, [step('page.goto', 'pw:api')]);
    const csv = stepRowsToCsv(context, rows).split('\n');

    expect(csv[0]).toBe(
      'run_started_at,base_url,project,file,title,retry,depth,path,step_title,category,failed,started_at,duration_ms',
    );
    expect(csv[1]).toBe(
      '2026-09-12T10:00:00.000Z,https://lms.example,smoke,tests/lms/auth/login.spec.ts,a,0,0,' +
        'page.goto,page.goto,pw:api,false,2026-09-12T10:00:01.000Z,10',
    );
  });

  test('ranks the slowest attempts longest first', () => {
    const base = {
      ...identity,
      testIds: [],
      tags: [],
      status: 'passed',
      expectedStatus: 'passed',
      workerIndex: 0,
      startedAt: '',
    } as const;
    const rows: TestTimingRow[] = [
      { ...base, title: 'fast', durationMs: 5 },
      { ...base, title: 'slow', durationMs: 500 },
      { ...base, title: 'mid', durationMs: 50 },
    ];

    expect(slowestTests(rows, 2).map((r) => r.title)).toEqual(['slow', 'mid']);
  });
});
