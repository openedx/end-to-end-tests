#!/usr/bin/env python3
"""Compose the issue (or the comment on an existing one) from a `claude-triage`
artifact, for the file-issue job of triage_scheduled_run.yml.

    issue.py OUT_DIR

Reads OUT_DIR/triage.json and issue.md (as validate.py left them) and writes:

- OUT_DIR/issue-title.txt — one line, at most 100 characters
- OUT_DIR/issue-body.md   — header + the diagnosis + upstream changes + footer
- OUT_DIR/comment.md      — the shorter note added when the same breakage
  (fingerprint) already has an open issue
- OUT_DIR/labels.txt      — one label per line

Nothing from the artifact is trusted as-is: triage.json is re-checked against
the schema, the fields this script uses are type-checked, the body is
redacted again, and HTML comments are stripped from it so it cannot plant a
fingerprint marker of its own. The marker, the header and the footer are
written here. Standard library only.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from validate import ISSUE_LIMIT, SCHEMA, check, redact  # noqa: E402

LABEL = 'scheduled-failure'
VERDICTS = {'spurious', 'platform-regression', 'test-defect', 'environment', 'mixed', 'unknown'}
MARKER = '<!-- triage-fingerprint: {} -->'


def fail(msg: str) -> None:
    sys.exit(f'issue.py: {msg}')


def link(run: dict | None) -> str:
    if not run:
        return 'none'
    return f'[{int(run["run_id"])}]({safe_url(run["url"])}) (attempt {int(run.get("attempt") or 1)})'


def safe_url(url: str) -> str:
    if not isinstance(url, str) or not re.fullmatch(r'https://github\.com/[\w.\-/]+(?:\.\.\.[\w.\-]+)?', url):
        return ''
    return url


def safe_sha(value) -> str:
    return value if isinstance(value, str) and re.fullmatch(r'[0-9a-f]{7,64}(,[0-9a-f]{7,64})*', value) else '?'


def clean_body(text: str) -> str:
    text = re.sub(r'<!--.*?(-->|$)', '', text, flags=re.DOTALL)  # no hidden content, no fake markers
    text = text.replace('<!--', '')
    return redact(text).strip()


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'triage/out')
    t = json.loads((out / 'triage.json').read_text())

    model_fields = {k: t[k] for k in json.loads(SCHEMA.read_text())['properties'] if k in t}
    errors = check(model_fields, json.loads(SCHEMA.read_text()))
    if errors:
        fail('triage.json fails the schema: ' + '; '.join(errors[:5]))
    if t['verdict'] not in VERDICTS:
        fail(f'unknown verdict {t["verdict"]!r}')
    fp = t.get('fingerprint')
    if not isinstance(fp, str) or not re.fullmatch(r'[0-9a-f]{16}|run-\d+', fp):
        fail(f'bad fingerprint {fp!r}')
    run = t.get('run') or {}
    if not str(run.get('run_id', '')).isdigit():
        fail('triage.json has no run id')

    title = re.sub(r'\s+', ' ', redact(t['title'])).strip()[:90]
    title = f'Scheduled run failed: {title}'[:100]

    triage_url = os.environ.get('TRIAGE_RUN_URL', '')
    rows = [
        ('Run', link(run)),
        ('Verdict', f'**{t["verdict"]}** ({t["confidence"]} confidence)'),
        ('Baseline (last green run)', link(t.get('baseline'))),
        ('Suite commit', f'`{safe_sha(run.get("sha"))[:12]}`'),
        ('Triage', f'[workflow run]({safe_url(triage_url)})' if safe_url(triage_url) else 'n/a'),
    ]
    if t.get('status') != 'ok':
        rows.append(('Diagnosis', '⚠️ incomplete — see below'))
    if int(run.get('attempt') or 1) > 1:
        rows.append(('Note', 'an earlier attempt of this run failed too and was re-run'))
    header = '\n'.join(
        [
            MARKER.format(fp),
            '> [!NOTE]',
            '> Automated triage of a failed scheduled run, written by Claude. Verify before acting.',
            '',
            '| | |',
            '| --- | --- |',
            *[f'| {k} | {v} |' for k, v in rows],
        ]
    )

    changes = [c for c in t.get('upstream_changes') or [] if isinstance(c, dict)]
    change_lines = []
    for c in changes[:40]:
        name = redact(str(c.get('component', '?')))[:80].replace('|', '\\|')
        frm, to = safe_sha(c.get('from')), safe_sha(c.get('to'))
        url = safe_url(c.get('compare_url') or '')
        change_lines.append(f'| `{name}` | `{frm[:12]}` → `{to[:12]}` | {f"[compare]({url})" if url else ""} |')
    upstream = ''
    if change_lines:
        upstream = '\n'.join(
            [
                '<details><summary>Everything that changed since the baseline</summary>',
                '',
                '| Component | Change | |',
                '| --- | --- | --- |',
                *change_lines,
                '',
                '</details>',
            ]
        )

    problems = [redact(str(p))[:300] for p in t.get('problems') or []]
    problem_text = '\n'.join(['**Triage problems:**', *[f'- {p}' for p in problems]]) if problems else ''

    footer = (
        '---\n'
        'If this is a platform defect, record it in `docs/findings.md` as part of the fix. '
        'Later failures with the same failing tests are added here as comments.'
    )
    body_md = clean_body((out / 'issue.md').read_text(errors='replace'))
    budget = ISSUE_LIMIT - len(header) - len(upstream) - len(problem_text) - len(footer) - 200
    if len(body_md) > budget:
        body_md = body_md[:budget] + '\n\n_(truncated)_'
    body = '\n\n'.join(part for part in (header, body_md, problem_text, upstream, footer) if part) + '\n'

    summary = re.sub(r'\s+', ' ', redact(t['summary'])).strip()[:600]
    comment = '\n'.join(
        [
            f'Failed again in run {link(run)} — **{t["verdict"]}** ({t["confidence"]} confidence).',
            '',
            summary,
            '',
            f'[Triage workflow run]({safe_url(triage_url)})' if safe_url(triage_url) else '',
        ]
    ).strip() + '\n'

    (out / 'issue-title.txt').write_text(title + '\n')
    (out / 'issue-body.md').write_text(body)
    (out / 'comment.md').write_text(comment)
    (out / 'labels.txt').write_text(f'{LABEL}\ntriage:{t["verdict"]}\n')
    print(f'title: {title}\nfingerprint: {fp}\nbody: {len(body)} chars')


if __name__ == '__main__':
    main()
