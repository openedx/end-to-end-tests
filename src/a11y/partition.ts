import type { ImpactValue, Result } from 'axe-core';

/**
 * Impact levels that fail the gate. WCAG-blocking issues are `critical` and
 * `serious`; `moderate`/`minor` are reported for triage but do not fail, matching
 * the epic's "fail on critical/serious" policy.
 */
export const FAILING_IMPACTS: ReadonlySet<ImpactValue> = new Set<ImpactValue>([
  'critical',
  'serious',
]);

export interface PartitionedViolations {
  /** Critical/serious violations not in the baseline — these fail the gate. */
  readonly failing: Result[];
  /** Violations tolerated via the known-debt baseline — reported, not failing. */
  readonly baselined: Result[];
  /** Below-threshold (moderate/minor) violations — reported, not failing. */
  readonly belowThreshold: Result[];
}

/**
 * Splits axe violations into what fails the gate versus what is only reported.
 *
 * A violation fails only when its impact is critical/serious **and** its rule is
 * not baselined. Pure and side-effect-free, so the gate's policy can be
 * unit-tested without launching a browser.
 */
export function partitionViolations(
  violations: readonly Result[],
  baseline: ReadonlySet<string>,
): PartitionedViolations {
  const failing: Result[] = [];
  const baselined: Result[] = [];
  const belowThreshold: Result[] = [];

  for (const violation of violations) {
    const isBlocking = violation.impact != null && FAILING_IMPACTS.has(violation.impact);
    if (!isBlocking) {
      belowThreshold.push(violation);
    } else if (baseline.has(violation.id)) {
      baselined.push(violation);
    } else {
      failing.push(violation);
    }
  }

  return { failing, baselined, belowThreshold };
}

/** A compact, human-readable one-liner for a violation, used in gate messages. */
export function describeViolation(violation: Result): string {
  const nodeCount = violation.nodes.length;
  return (
    `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help} — ` +
    `${nodeCount} node${nodeCount === 1 ? '' : 's'}`
  );
}
