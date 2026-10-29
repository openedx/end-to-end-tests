import { test, expect } from '../src/fixtures';

/**
 * Proof that `CUSTOM_TEST_DIRS` works: this file lives **outside** `tests/`, so
 * the default `testDir` never discovers it — yet it runs in the mirrored
 * `unit/examples` project when `CUSTOM_TEST_DIRS=./examples`. Pure logic, no
 * browser or target needed. Imports `test`/`expect` from the suite (never a bare
 * `@playwright/test`), as external providers must.
 */
test('external unit spec is discovered via CUSTOM_TEST_DIRS', { tag: '@unit' }, () => {
  expect(2 + 2).toBe(4);
});
