import { test, expect } from '../src/fixtures';

/**
 * Proof that an external provider **reuses the suite's own building blocks** —
 * here the extended `test`/fixtures imported straight from `src/` — so it adds
 * coverage without redoing any infrastructure. Runs in the mirrored
 * `smoke [external-example]` project (needs a reachable target).
 */
test('external smoke spec reuses community fixtures', { tag: '@smoke' }, async ({ config }) => {
  expect(config.baseUrls.lms).toMatch(/^https?:\/\//);
});
