# `src/reporting/` — BTR test-case IDs & coverage

**Single responsibility:** turn what Playwright already knows about a run into
the suite's local report files — BTR coverage, the accessibility backlog, and
per-test / per-step timings.

Contains:

- `test-id.ts` — the `test_id` annotation convention. `testId('TC-00003')` builds
  a validated annotation for a test's options; IDs are `TC-` + digits and are
  never inferred from the title. `testIdsFromAnnotations` reads them back.
- `coverage.ts` — pure aggregation (`summarizeCoverage`): annotated vs.
  unannotated counts, the outcome per BTR case ID, and the titles of
  still-unannotated tests. No Playwright types, so it is unit-tested directly.

  A case is usually covered by **several** tests, and often by passing coverage
  plus a `test.fail` or `test.fixme` holding the part blocked on an upstream
  defect, so each case carries three things rather than one status:

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
  Two normalisations happen here: a retried test counts **once**, by its final
  attempt (`finalAttempts`); and a `test.fail()` expected failure counts as
  `skipped` (a known gap, like a `fixme`) while an _unexpected pass_ counts as
  `failed`, so a stale marker shows up in the report as well as in the run.
- `known-gap.ts` — the `known_gap` annotation. `knownGap('why')` records the
  reason a declarative `test.fixme` is held back, so the run report (and the
  results sheet) can say why instead of "fixme (no reason recorded)".
- `btr-run.ts` — pure aggregation (`summarizeRun`) for the **run detail**
  report: one row per BTR case with the specs and projects that drive it, every
  test's final status, summed duration and attempt count, and a one-line note
  (skip reason, fixme/known gap + issue link, `test.fail` reading, first line of
  the error, or failing a11y rules — see `noteFor`). Plus run metadata: start,
  duration, Playwright's overall status, the filter used, and in CI the run
  link, workflow, ref, commit and Open edX release (`ciMetaFromEnv`).
- `btr-run-reporter.ts` — the always-on reporter that adapts run events onto
  `summarizeRun` and writes `test-results/btr-run.json`. Same normalisations as
  the coverage reporter (`normalizeStatus`, last attempt wins); reads
  `GITHUB_*`, `OPENEDX_RELEASE`, `BTR_TEST_REF`, `DOMAINS`, `LMS_BASE_URL` from
  the environment and the checked-out commit from `git rev-parse HEAD`.
- `a11y.ts` — pure aggregation (`summarizeA11yViolations`) that rolls per-scan
  violations up per rule (worst impact first; de-duplicated across retries).
- `a11y-reporter.ts` — the always-on reporter that reads each test's
  `a11y-violations-*` attachments (from `checkA11y`) and writes the consolidated
  `test-results/a11y-violations.json` — the working list of accessibility
  violations, tagged failing / baselined / below-threshold with the pages they
  appear on.
- `timing.ts` — pure shaping (`flattenSteps`, `testRowsToCsv`, `stepRowsToCsv`)
  of per-attempt test and step timings into flat CSV rows. No Playwright types,
  so it is unit-tested directly.
- `timing-reporter.ts` — the always-on reporter that writes two CSV files made
  for import into a spreadsheet or database:

  | File                             | One row per                                                                                                                                                |
  | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `test-results/timings-tests.csv` | test **attempt** (retries kept, told apart by `retry`): project, file, title, BTR `test_ids`, tags, status, expected status, worker, start time, duration. |
  | `test-results/timings-steps.csv` | recorded **step** at any depth: category (`pw:api`, `expect`, `hook`, `fixture`, `test.step`), ancestry `path`, failed flag, start time, duration.         |

  Every row carries `run_started_at` (ISO, UTC) and `base_url`, so files from
  many runs append into one table and compare across time and targets. Nothing
  is measured here — Playwright records all of it for the HTML report; the
  reporter only reshapes it. The step file is verbose by default (every
  `pw:api` call); pass `stepCategories: ['test.step', 'hook']` in
  `playwright.config.ts` for a coarser file.

## Policy

All reporters write **local files only**. Uploading them is a CI-only
concern: the shared `run-suite` composite action (used by both
`run_tests_tutor.yml` and `run_tests_external.yml`) publishes
`btr-coverage.json`, `btr-run.json`, `a11y-violations.json` and
`timings-*.csv` as a `suite-reports-*` build artifact alongside the full
report bundle. Publishing `btr-run.json` to the per-release BTR results sheets
is a separate, opt-in CI step (in progress); it never runs on PR/push and never
from a local machine against a real sheet.

Infrastructure projects (`setup`, `unit`) are excluded from coverage so the
numbers reflect the user-facing scenarios the BTR plan tracks. Note this relies
on the suite's own tests (`tests/conventions`, `tests/accounts`, …) being tagged
`@unit` so they land in the `unit` project; an untagged infrastructure test would
count as unannotated coverage.

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
