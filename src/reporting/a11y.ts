/**
 * Pure aggregation for the accessibility reporter, free of Playwright and axe
 * types so it can be unit-tested without a runner. The thin reporter in
 * `a11y-reporter.ts` parses the per-test attachments into these shapes.
 */

/** Whether a violation failed the gate, was tolerated by the baseline, or was below the fail threshold. */
export type A11yStatus = 'failing' | 'baselined' | 'belowThreshold';

/** One occurrence of a rule violation on one scanned page in one test. */
export interface A11yOccurrence {
  readonly ruleId: string;
  readonly impact: string | null;
  readonly help: string;
  readonly helpUrl: string;
  readonly status: A11yStatus;
  readonly url: string;
  readonly test: string;
  readonly nodeCount: number;
}

/** All occurrences of a single rule, rolled up across pages and tests. */
export interface A11yRuleSummary {
  readonly ruleId: string;
  readonly impact: string | null;
  readonly help: string;
  readonly helpUrl: string;
  /** Distinct statuses seen for this rule (a rule may fail on one page, be baselined on another). */
  readonly statuses: readonly A11yStatus[];
  /** Total offending nodes across all occurrences. */
  readonly totalNodes: number;
  readonly occurrences: readonly Omit<A11yOccurrence, 'help' | 'helpUrl'>[];
}

export interface A11ySummary {
  readonly totals: {
    readonly failing: number;
    readonly baselined: number;
    readonly belowThreshold: number;
    readonly rules: number;
  };
  readonly byRule: readonly A11yRuleSummary[];
}

/** Impact ordering (worst first) for sorting the rule list. */
const IMPACT_RANK: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

function impactRank(impact: string | null): number {
  return (impact != null ? IMPACT_RANK[impact] : undefined) ?? 99;
}

/** Mutable rule accumulator used while building the summary. */
type MutableRule = {
  ruleId: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  statuses: A11yStatus[];
  totalNodes: number;
  occurrences: Array<Omit<A11yOccurrence, 'help' | 'helpUrl'>>;
};

/** Stable key for de-duplicating identical occurrences (e.g. across retries). */
function occurrenceKey(o: A11yOccurrence): string {
  return `${o.ruleId}|${o.status}|${o.url}|${o.test}|${o.nodeCount}`;
}

/**
 * Rolls a flat list of occurrences into a per-rule summary: how many failing /
 * baselined / below-threshold, and for each rule the pages and tests where it
 * appears. Identical occurrences (same rule, status, page, test, node count) are
 * de-duplicated so retries don't inflate counts. Rules are ordered worst-impact
 * first, then alphabetically.
 */
export function summarizeA11yViolations(rawOccurrences: readonly A11yOccurrence[]): A11ySummary {
  const seen = new Set<string>();
  const occurrences = rawOccurrences.filter((o) => {
    const key = occurrenceKey(o);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const totals = { failing: 0, baselined: 0, belowThreshold: 0, rules: 0 };
  const byRuleId = new Map<string, MutableRule>();

  for (const o of occurrences) {
    totals[o.status] += 1;

    let rule = byRuleId.get(o.ruleId);
    if (!rule) {
      rule = {
        ruleId: o.ruleId,
        impact: o.impact,
        help: o.help,
        helpUrl: o.helpUrl,
        statuses: [],
        totalNodes: 0,
        occurrences: [],
      };
      byRuleId.set(o.ruleId, rule);
    }

    if (!rule.statuses.includes(o.status)) {
      rule.statuses.push(o.status);
    }
    rule.occurrences.push({
      ruleId: o.ruleId,
      impact: o.impact,
      status: o.status,
      url: o.url,
      test: o.test,
      nodeCount: o.nodeCount,
    });
    rule.totalNodes += o.nodeCount;
  }

  const byRule = [...byRuleId.values()].sort(
    (a, b) => impactRank(a.impact) - impactRank(b.impact) || a.ruleId.localeCompare(b.ruleId),
  );

  return {
    totals: { ...totals, rules: byRule.length },
    byRule,
  };
}
