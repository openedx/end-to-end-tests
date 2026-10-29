import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

import { buildProjects } from './playwright.projects';
import { resolveExternalTestDirs } from './src/config';
import { SUITE_REPORTERS } from './src/reporting/reporters';

// A run loads `.env` through `getConfig()`; a merge reads no configuration, so
// load it here for the reporters that record the target (`LMS_BASE_URL`).
dotenv.config({ quiet: true });

/**
 * Configuration for `npx playwright merge-reports --config merge.config.ts <dir>`,
 * which CI runs over the blob reports of every shard to produce the single
 * HTML report and `test-results/` report files a one-job run would have
 * written. It shares `buildProjects` (and so the CUSTOM_TEST_DIRS directory
 * list) with `playwright.config.ts`, so a merge resolves and attributes the
 * external specs' paths exactly as the run did.
 */
export default defineConfig({
  testDir: './tests',
  projects: buildProjects(resolveExternalTestDirs()),
  reporter: SUITE_REPORTERS,
});
