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
