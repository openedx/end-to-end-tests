import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import type { FullConfig, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

import {
  A11Y_ATTACHMENT_PREFIX,
  parseA11yAttachment,
  summarizeA11yViolations,
  type A11yOccurrence,
  type A11yStatus,
} from './a11y';

export interface A11yReporterOptions {
  /** Where to write the aggregated JSON. Relative paths resolve from the config dir. */
  readonly outputFile?: string;
}

const DEFAULT_OUTPUT = 'test-results/a11y-violations.json';
const STATUSES: readonly A11yStatus[] = ['failing', 'baselined', 'belowThreshold'];

/**
 * Always-on reporter that consolidates every `checkA11y` scan into a single,
 * working list of accessibility violations at `test-results/a11y-violations.json`
 * — grouped by rule, with the pages/tests each appears on and whether it is
 * currently failing, baselined (known debt), or below the fail threshold.
 *
 * `checkA11y` attaches the per-scan detail to each test (visible in the HTML
 * report); this reporter turns those scattered attachments into one triage-ready
 * file. Local only — uploading it is a CI concern (reporting policy).
 */
export default class A11yReporter implements Reporter {
  private readonly outputFile: string;
  private readonly occurrences: A11yOccurrence[] = [];
  private configDir = process.cwd();

  constructor(options: A11yReporterOptions = {}) {
    this.outputFile = options.outputFile ?? DEFAULT_OUTPUT;
  }

  onBegin(config: FullConfig): void {
    this.configDir = dirname(config.configFile ?? process.cwd());
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const testTitle = test.titlePath().slice(1).join(' › ');

    for (const attachment of result.attachments) {
      if (!attachment.name.startsWith(A11Y_ATTACHMENT_PREFIX) || !attachment.body) {
        continue;
      }

      const parsed = parseA11yAttachment(attachment.body.toString('utf8'));
      if (!parsed) {
        continue;
      }

      const url = parsed.url;
      for (const status of STATUSES) {
        for (const v of parsed[status]) {
          this.occurrences.push({
            ruleId: v.id ?? '(unknown)',
            impact: v.impact ?? null,
            help: v.help ?? '',
            helpUrl: v.helpUrl ?? '',
            status,
            url,
            test: testTitle,
            nodeCount: v.nodes?.length ?? 0,
          });
        }
      }
    }
  }

  async onEnd(): Promise<void> {
    const summary = summarizeA11yViolations(this.occurrences);

    const path = isAbsolute(this.outputFile)
      ? this.outputFile
      : resolve(this.configDir, this.outputFile);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({ generatedAt: new Date().toISOString(), ...summary }, null, 2),
      'utf8',
    );

    const { failing, baselined, belowThreshold, rules } = summary.totals;
    console.log(
      `\n[a11y] ${rules} rule(s) across scans — ${failing} failing, ${baselined} baselined, ` +
        `${belowThreshold} below-threshold. Wrote ${this.outputFile}.`,
    );
  }
}
