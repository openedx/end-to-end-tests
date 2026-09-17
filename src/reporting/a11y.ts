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

/** One axe violation as `checkA11y` serialises it into a test attachment. */
export interface A11yAttachmentViolation {
  readonly id?: string;
  readonly impact?: string | null;
  readonly help?: string;
  readonly helpUrl?: string;
  readonly nodes?: readonly unknown[];
}

/** Parsed body of one `a11y-violations*.json` attachment written by `checkA11y`. */
export interface A11yAttachment {
  readonly url: string;
  readonly failing: readonly A11yAttachmentViolation[];
  readonly baselined: readonly A11yAttachmentViolation[];
  readonly belowThreshold: readonly A11yAttachmentViolation[];
}

/** Name prefix `checkA11y` gives its attachments (a label may follow). */
export const A11Y_ATTACHMENT_PREFIX = 'a11y-violations';

/**
 * Parses a `checkA11y` attachment body. Returns `null` for anything that is not
 * the expected JSON object, so a malformed attachment is skipped rather than
 * failing the whole report. Missing lists read as empty.
 */
export function parseA11yAttachment(body: string): A11yAttachment | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const raw = parsed as Partial<Record<A11yStatus | 'url', unknown>>;
  const list = (value: unknown): readonly A11yAttachmentViolation[] =>
    Array.isArray(value) ? (value as A11yAttachmentViolation[]) : [];
  return {
    url: typeof raw.url === 'string' ? raw.url : '(unknown)',
    failing: list(raw.failing),
    baselined: list(raw.baselined),
    belowThreshold: list(raw.belowThreshold),
  };
}

/** Renders one violation the way the results sheet shows it: `id (impact): help`. */
export function describeA11yViolation(v: A11yAttachmentViolation): string {
  const id = v.id ?? '(unknown)';
  const impact = v.impact ? ` (${v.impact})` : '';
  const help = v.help ? `: ${v.help}` : '';
  return `${id}${impact}${help}`;
}
