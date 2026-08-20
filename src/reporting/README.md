# `src/reporting/` — BTR test-case IDs & coverage

**Single responsibility:** link specs to the BTR Release Test Plan and report
annotation coverage every run.

Contains:

- `test-id.ts` — the `test_id` annotation convention. `testId('TC-00003')` builds
  a validated annotation for a test's options; IDs are `TC-` + digits and are
  never inferred from the title. `testIdsFromAnnotations` reads them back.
- `coverage.ts` — pure aggregation (`summarizeCoverage`): annotated vs.
  unannotated counts, the outcome per BTR case ID (worst wins if several tests
  share one), and the titles of still-unannotated tests. No Playwright types, so
  it is unit-tested directly.
- `coverage-reporter.ts` — the always-on Playwright reporter that adapts run
  events onto `summarizeCoverage` and writes `test-results/btr-coverage.json`.

## Policy

The reporter writes a **local file only**. Uploading it is a CI-only concern, and
writing results to the `VERAWOOD TESTS` sheet is a separate, manual,
`workflow_dispatch`-gated step — never on PR/push/schedule and never from a local
machine.

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
