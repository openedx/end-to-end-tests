import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

import { SUITE_REPORTERS } from './src/reporting/reporters';

// A run loads `.env` through `getConfig()`; a merge reads no configuration, so
// load it here for the reporters that record the target (`LMS_BASE_URL`).
dotenv.config({ quiet: true });

/**
 * Configuration for `npx playwright merge-reports --config merge.config.ts <dir>`,
 * which CI runs over the blob reports of every shard to produce the single
 * HTML report and `test-results/` report files a one-job run would have
 * written. Only `testDir` (to resolve spec paths) and the reporters matter.
 */
export default defineConfig({
  testDir: './tests',
  reporter: SUITE_REPORTERS,
});
