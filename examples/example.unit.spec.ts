import { test, expect } from '@playwright/test';

/**
 * Proof that `CUSTOM_TEST_DIRS` works: this file lives **outside** `tests/`, so
 * the default `testDir` never discovers it — yet it runs in the mirrored
 * `unit/examples` project when `CUSTOM_TEST_DIRS=./examples`. A node-only `@unit`
 * spec uses `@playwright/test` (the suite's single copy), not the suite fixtures,
 * which pull in the config-bound capability gate and so need a target.
 */
test('external unit spec is discovered via CUSTOM_TEST_DIRS', { tag: '@unit' }, () => {
  expect(2 + 2).toBe(4);
});
