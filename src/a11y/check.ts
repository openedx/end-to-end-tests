import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { A11Y_BASELINE } from './baseline';
import { describeViolation, partitionViolations } from './partition';

/**
 * axe tag set for WCAG 2.2 Level AA (each level builds on the previous). The gate
 * targets this standard per the suite's accessibility policy.
 */
export const WCAG_22_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export interface CheckA11yOptions {
  /** Restrict the scan to a CSS selector (e.g. a form) instead of the whole page. */
  readonly include?: string;
  /** Override the known-debt baseline (mainly for testing). */
  readonly baseline?: ReadonlySet<string>;
  /** Label used in the attachment name, to tell multiple scans in one test apart. */
  readonly label?: string;
}

/**
 * Runs the accessibility gate against the current page state and fails the test
 * on any critical/serious violation that is not baselined.
 *
 * All violations (failing, baselined, and below-threshold) are attached to the
 * test as JSON for triage, so the report shows known debt without blocking on it.
 * This is the intended read for a spec: an explicit gate line the spec owns.
 */
export async function checkA11y(page: Page, options: CheckA11yOptions = {}): Promise<void> {
  const baseline = options.baseline ?? A11Y_BASELINE;

  let builder = new AxeBuilder({ page }).withTags(WCAG_22_AA_TAGS);
  if (options.include) {
    builder = builder.include(options.include);
  }
  const results = await builder.analyze();

  const partitioned = partitionViolations(results.violations, baseline);
  const suffix = options.label ? `-${options.label}` : '';

  await test.info().attach(`a11y-violations${suffix}.json`, {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        url: results.url,
        failing: partitioned.failing,
        baselined: partitioned.baselined,
        belowThreshold: partitioned.belowThreshold,
      },
      null,
      2,
    ),
  });

  expect(
    partitioned.failing.map(describeViolation),
    'critical/serious accessibility violations (WCAG 2.2 AA)',
  ).toEqual([]);
}
