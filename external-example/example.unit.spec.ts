import { test, expect } from '@playwright/test';

/**
 * Proof that `CUSTOM_TEST_DIRS` works: this file lives **outside** `tests/`, so
 * the default `testDir` never discovers it — yet it runs in the mirrored
 * `unit [external-example]` project when `CUSTOM_TEST_DIRS=./external-example`.
 * Pure logic, no browser or target needed.
 */
test('external unit spec is discovered via CUSTOM_TEST_DIRS', { tag: '@unit' }, () => {
  expect(2 + 2).toBe(4);
});
