import { test, expect } from '@playwright/test';
import type { ImpactValue, Result } from 'axe-core';

import { partitionViolations } from '../../src/a11y';

/** Minimal axe {@link Result} for testing the partition policy. */
function violation(id: string, impact: ImpactValue): Result {
  return {
    id,
    impact,
    tags: [],
    description: `${id} description`,
    help: `${id} help`,
    helpUrl: `https://example.com/${id}`,
    nodes: [],
  };
}

test.describe('partitionViolations', { tag: '@unit' }, () => {
  const empty = new Set<string>();

  test('fails only on critical/serious violations', () => {
    const result = partitionViolations(
      [
        violation('color-contrast', 'serious'),
        violation('aria-hidden', 'critical'),
        violation('landmark', 'moderate'),
        violation('region', 'minor'),
      ],
      empty,
    );

    expect(result.failing.map((v) => v.id)).toEqual(['color-contrast', 'aria-hidden']);
    expect(result.belowThreshold.map((v) => v.id)).toEqual(['landmark', 'region']);
    expect(result.baselined).toEqual([]);
  });

  test('demotes baselined rules from failing to reported', () => {
    const result = partitionViolations(
      [violation('color-contrast', 'serious'), violation('aria-hidden', 'critical')],
      new Set(['color-contrast']),
    );

    expect(result.failing.map((v) => v.id)).toEqual(['aria-hidden']);
    expect(result.baselined.map((v) => v.id)).toEqual(['color-contrast']);
  });

  test('does not fail when every critical/serious rule is baselined', () => {
    const result = partitionViolations(
      [violation('color-contrast', 'serious')],
      new Set(['color-contrast']),
    );
    expect(result.failing).toEqual([]);
  });
});
