// Renders the suite's local JSON reports (BTR run results + coverage, a11y backlog)
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
const run = readJson('test-results/btr-run.json');
const a11y = readJson('test-results/a11y-violations.json');

const lines = ['## E2E suite reports', ''];

if (run) {
  const t = run.totals ?? {};
  const v = run.verdicts ?? {};
  const seconds = Math.round((run.run?.durationMs ?? 0) / 1000);
  lines.push(
    '### BTR results',
    '',
    `- **${run.run?.status ?? 'unknown'}** in ${seconds}s — ` +
      `${t.passed ?? 0} passed · ${t.failed ?? 0} failed · ${t.skipped ?? 0} skipped · ${t.flaky ?? 0} flaky`,
    `- **${run.cases?.length ?? 0}** BTR case(s): ${v.verified ?? 0} verified · ${v.partial ?? 0} partial · ` +
      `${v.unverified ?? 0} unverified · ${v.failed ?? 0} failed`,
    '',
  );
  const attention = (run.cases ?? []).filter((c) => c.verdict !== 'verified');
  if (attention.length > 0) {
    lines.push('| BTR case | Result | Notes |', '| --- | --- | --- |');
    for (const c of attention) {
      const notes = (c.tests ?? [])
        .filter((test) => test.note)
        .map((test) => ((c.tests?.length ?? 0) > 1 ? `${test.title}: ${test.note}` : test.note))
        .join('<br>')
        .replace(/\|/g, '\\|');
      lines.push(`| \`${c.testId}\` | ${c.verdict} | ${notes} |`);
    }
    lines.push('');
  }
}

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

if (!coverage && !run && !a11y) {
  lines.push('_No suite reports found (no browser specs produced reports this run)._', '');
}

const markdown = `${lines.join('\n')}\n`;
const target = process.env.GITHUB_STEP_SUMMARY;
if (target) {
  appendFileSync(target, markdown);
} else {
  process.stdout.write(markdown);
}
