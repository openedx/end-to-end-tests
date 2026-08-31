# `src/reporting/` — BTR test-case IDs & coverage

**Single responsibility:** link specs to the BTR Release Test Plan and report
annotation coverage every run.

Contains:

- `test-id.ts` — the `test_id` annotation convention. `testId('TC-00003')` builds
  a validated annotation for a test's options; IDs are `TC-` + digits and are
  never inferred from the title. `testIdsFromAnnotations` reads them back.
- `coverage.ts` — pure aggregation (`summarizeCoverage`): annotated vs.
  unannotated counts, the outcome per BTR case ID, and the titles of
  still-unannotated tests. No Playwright types, so it is unit-tested directly.

  A case is usually covered by **several** tests, and often by passing coverage
  plus a `test.fixme` holding the part blocked on an upstream defect, so each case
  carries three things rather than one status:

  | Field     | Meaning                                                                                                                                      |
  | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
  | `status`  | worst status across the case's tests (unchanged; a single-value summary)                                                                     |
  | `counts`  | how many of the case's tests ended in each status                                                                                            |
  | `verdict` | `verified` (all passed) / `partial` (some passed, some did not run) / `unverified` (nothing ran) / `failed` (something ran and did not pass) |

  `verdict` is the field to read: `status` alone reports a case as _skipped_ when
  one `fixme` sibling exists, which hides coverage that does exist. `verdicts`
  totals them for the run's headline.

- `coverage-reporter.ts` — the always-on Playwright reporter that adapts run
  events onto `summarizeCoverage` and writes `test-results/btr-coverage.json`.
- `a11y.ts` — pure aggregation (`summarizeA11yViolations`) that rolls per-scan
  violations up per rule (worst impact first; de-duplicated across retries).
- `a11y-reporter.ts` — the always-on reporter that reads each test's
  `a11y-violations-*` attachments (from `checkA11y`) and writes the consolidated
  `test-results/a11y-violations.json` — the working list of accessibility
  violations, tagged failing / baselined / below-threshold with the pages they
  appear on.

## Policy

Both reporters write **local files only**. Uploading them is a CI-only concern:
the `run_tests_tutor.yml` workflow publishes `btr-coverage.json` and
`a11y-violations.json` as the `suite-reports-<release>` build artifact (in
addition to the full report bundle). Writing results to the `VERAWOOD TESTS` sheet
is a separate, manual, `workflow_dispatch`-gated step — never on PR/push/schedule
and never from a local machine.

Infrastructure projects (`setup`, `unit`) are excluded from coverage so the
numbers reflect the user-facing scenarios the BTR plan tracks.

## Usage

```ts
import { testId } from '../../../src/reporting';

test(
  'signs in with valid credentials',
  { tag: '@smoke', annotation: testId('TC-00003') },
  async ({ page }) => {
    /* ... */
  },
);
```
