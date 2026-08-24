# `src/a11y/` — accessibility gate

**Single responsibility:** run `@axe-core/playwright` against a screen and fail on
critical/serious WCAG 2.2 AA violations, with a known-debt baseline that reports
rather than blocks.

Contains:

- `check.ts` — `checkA11y(page, options)`: the gate a spec calls as an explicit
  assertion line. Scans with the WCAG 2.2 AA tag set, attaches every violation
  (failing, baselined, below-threshold) to the test as JSON for triage, and fails
  on any critical/serious violation that is not baselined.
- `partition.ts` — pure policy (`partitionViolations`): splits axe results into
  failing / baselined / below-threshold. Unit-tested without a browser.
- `baseline.ts` — `A11Y_BASELINE`: rule IDs tolerated as known debt.

## Where violations are collected

Each `checkA11y` scan attaches its full result (`a11y-violations-<label>.json`:
failing, baselined, below-threshold) to the running test, so it shows up in the
Playwright HTML report per screen.

The always-on **`A11yReporter`** (`src/reporting/a11y-reporter.ts`, wired in
`playwright.config.ts`) consolidates every scan in a run into one triage-ready
list at **`test-results/a11y-violations.json`** — grouped by rule, worst impact
first, with the pages/tests each appears on, total offending nodes, and whether it
is currently `failing`, `baselined` (known debt), or `belowThreshold`. Start from
that file to work through the backlog (e.g. the current `label` and
`color-contrast` debt). It is written locally only; uploading it is a CI concern.

## Baseline vs. disabling rules

A baselined rule is **still executed** and its violations are **still reported** —
we simply do not fail the gate for it yet. This differs deliberately from
disabling a rule (axe's `disableRules`, or the WGU suite's `disabledRules`), which
hides the rule entirely and lets new screens regress unseen. Keep the baseline
short, justify every entry, and remove entries as the debt is fixed.

## Usage

```ts
import { checkA11y } from '../../../src/a11y';

test('the login screen meets WCAG 2.2 AA', async ({ page, loginPage }) => {
  await loginPage.goto();
  await checkA11y(page, { label: 'login' });
});
```
