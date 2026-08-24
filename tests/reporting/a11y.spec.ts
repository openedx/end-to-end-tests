import { test, expect } from '@playwright/test';

import { summarizeA11yViolations, type A11yOccurrence } from '../../src/reporting';

const occ = (over: Partial<A11yOccurrence>): A11yOccurrence => ({
  ruleId: 'color-contrast',
  impact: 'serious',
  help: 'Elements must meet contrast',
  helpUrl: 'https://example.com/color-contrast',
  status: 'baselined',
  url: 'https://lms.example.com/login',
  test: 'login a11y',
  nodeCount: 1,
  ...over,
});

test.describe('summarizeA11yViolations', { tag: '@unit' }, () => {
  test('rolls occurrences up per rule with totals', () => {
    const summary = summarizeA11yViolations([
      occ({
        ruleId: 'label',
        impact: 'critical',
        status: 'failing',
        nodeCount: 14,
        test: 'account',
      }),
      occ({ ruleId: 'color-contrast', status: 'baselined', nodeCount: 2 }),
      occ({ ruleId: 'region', impact: 'moderate', status: 'belowThreshold', nodeCount: 1 }),
    ]);

    expect(summary.totals).toEqual({ failing: 1, baselined: 1, belowThreshold: 1, rules: 3 });
    // Worst impact first: critical (label), then serious (color-contrast), then moderate (region).
    expect(summary.byRule.map((r) => r.ruleId)).toEqual(['label', 'color-contrast', 'region']);
    expect(summary.byRule[0]?.totalNodes).toBe(14);
  });

  test('merges a rule seen on multiple pages/statuses', () => {
    const summary = summarizeA11yViolations([
      occ({ ruleId: 'color-contrast', status: 'baselined', url: '/login', nodeCount: 2 }),
      occ({ ruleId: 'color-contrast', status: 'failing', url: '/register', nodeCount: 3 }),
    ]);

    expect(summary.byRule).toHaveLength(1);
    const rule = summary.byRule[0]!;
    expect([...rule.statuses].sort()).toEqual(['baselined', 'failing']);
    expect(rule.totalNodes).toBe(5);
    expect(rule.occurrences).toHaveLength(2);
  });

  test('de-duplicates identical occurrences (e.g. retries)', () => {
    const one = occ({ ruleId: 'label', status: 'failing', nodeCount: 14 });
    const summary = summarizeA11yViolations([one, { ...one }]);

    expect(summary.totals.failing).toBe(1);
    expect(summary.byRule[0]?.occurrences).toHaveLength(1);
  });

  test('an empty run yields empty totals', () => {
    const summary = summarizeA11yViolations([]);
    expect(summary.totals).toEqual({ failing: 0, baselined: 0, belowThreshold: 0, rules: 0 });
    expect(summary.byRule).toEqual([]);
  });
});
