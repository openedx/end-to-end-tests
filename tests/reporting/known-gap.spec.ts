import { test, expect } from '@playwright/test';

import { KNOWN_GAP_ANNOTATION_TYPE, knownGap } from '../../src/reporting';

test.describe('knownGap', { tag: '@unit' }, () => {
  test('builds a trimmed annotation', () => {
    expect(knownGap('  PLAT-009: navigation returns 500 ')).toEqual({
      type: KNOWN_GAP_ANNOTATION_TYPE,
      description: 'PLAT-009: navigation returns 500',
    });
  });

  test('rejects a blank reason', () => {
    expect(() => knownGap('   ')).toThrow(/non-empty reason/);
  });
});
