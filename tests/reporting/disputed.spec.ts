import { test, expect } from '@playwright/test';

import { DISPUTED_ANNOTATION_TYPE, disputed } from '../../src/reporting';

test.describe('disputed', { tag: '@unit' }, () => {
  test('builds a trimmed annotation', () => {
    expect(disputed('  RBAC-004: a failed list is a toast, by design ')).toEqual({
      type: DISPUTED_ANNOTATION_TYPE,
      description: 'RBAC-004: a failed list is a toast, by design',
    });
  });

  test('rejects a blank reason', () => {
    expect(() => disputed('   ')).toThrow(/non-empty reason/);
  });
});
