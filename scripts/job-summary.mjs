// Renders the suite's local JSON reports (accessibility backlog + BTR coverage)
// as Markdown into the GitHub Actions job summary, so the failing/baselined counts
// are visible on the run page without downloading artifacts. Falls back to stdout
// when GITHUB_STEP_SUMMARY is not set (local use). Reads only already-produced,
// unit-tested report files, so it stays a thin presentation layer.
import { appendFileSync, readFileSync } from 'node:fs';

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function pct(ratio) {
  return `${Math.round((ratio ?? 0) * 100)}%`;
}

const coverage = readJson('test-results/btr-coverage.json');
const a11y = readJson('test-results/a11y-violations.json');

const lines = ['## E2E suite reports', ''];

if (coverage) {
  lines.push(
    '### BTR coverage',
    '',
    `- **${coverage.annotated ?? 0}/${coverage.total ?? 0}** tests annotated (${pct(coverage.coverageRatio)})`,
    `- **${coverage.byTestId?.length ?? 0}** BTR case(s) exercised`,
    '',
  );
}

if (a11y) {
  const t = a11y.totals ?? {};
  lines.push(
    '### Accessibility (WCAG 2.2 AA)',
    '',
    `- **${t.failing ?? 0}** failing · **${t.baselined ?? 0}** baselined · ` +
      `**${t.belowThreshold ?? 0}** below-threshold · **${t.rules ?? 0}** rule(s)`,
    '',
  );

  if ((a11y.byRule ?? []).length > 0) {
    lines.push('| Rule | Impact | Status | Nodes | Pages |', '| --- | --- | --- | --- | --- |');
    for (const rule of a11y.byRule) {
      const pages = new Set((rule.occurrences ?? []).map((o) => o.url)).size;
      lines.push(
        `| \`${rule.ruleId}\` | ${rule.impact ?? '—'} | ${(rule.statuses ?? []).join(', ')} | ` +
          `${rule.totalNodes ?? 0} | ${pages} |`,
      );
    }
    lines.push('');
  }
}

if (!coverage && !a11y) {
  lines.push('_No suite reports found (no browser specs produced reports this run)._', '');
}

const markdown = `${lines.join('\n')}\n`;
const target = process.env.GITHUB_STEP_SUMMARY;
if (target) {
  appendFileSync(target, markdown);
} else {
  process.stdout.write(markdown);
}
