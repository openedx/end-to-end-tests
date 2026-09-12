#!/usr/bin/env python3
"""Pull GitHub Actions artifacts for a CI run of this repo and summarize them.

Zero dependencies beyond Python 3.9+ and an authenticated `gh` CLI.

    ci_artifacts.py fetch   <run-url|run-id|pr-url|pr-number> [--dest DIR]
    ci_artifacts.py summary <DIR>
    ci_artifacts.py test    <DIR> <title-or-file-substring>
    ci_artifacts.py logs    <DIR> [--service lms|cms|...] [--grep REGEX] [-C N]

`fetch` writes `<DIR>/run.json` plus one directory per artifact
(`playwright-report-<release>/`, `suite-reports-<release>/`,
`tutor-logs-<release>/`) and the full runner log of every failed job
(`job-<id>.log`, ANSI stripped). Re-run attempts re-upload artifacts under the same name;
by default only the newest copy of each name is kept.

The Playwright HTML report has no sibling JSON: the machine-readable report is
a zip embedded as base64 inside `playwright-report/index.html`. `summary` and
`test` extract it to `<artifact>/report/` (report.json + one JSON per spec
file) on first use.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import subprocess
import sys
import zipfile
from collections import Counter
from pathlib import Path

DEFAULT_REPO = 'openedx/end-to-end-tests'
ANSI = re.compile(r'\x1b\[[0-9;]*m')


def sh(*args: str, check: bool = True) -> str:
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if check and proc.returncode != 0:
        sys.exit(f'$ {" ".join(args)}\n{proc.stderr.strip()}')
    return proc.stdout


def gh_json(path: str, repo: str):
    return json.loads(sh('gh', 'api', f'repos/{repo}/{path}', '--paginate'))


# --------------------------------------------------------------------------- fetch


def resolve_run(ref: str, repo: str) -> tuple[str, str]:
    """Turn a run URL, PR URL, run id or PR number into (repo, run_id)."""
    m = re.match(r'https://github\.com/([^/]+/[^/]+)/actions/runs/(\d+)', ref)
    if m:
        return m.group(1), m.group(2)
    m = re.match(r'https://github\.com/([^/]+/[^/]+)/pull/(\d+)', ref)
    if m:
        repo, ref = m.group(1), m.group(2)
    if ref.isdigit() and len(ref) < 8:  # PR number (run ids are 11 digits)
        pr = json.loads(sh('gh', 'pr', 'view', ref, '-R', repo, '--json', 'headRefName,headRefOid'))
        runs = json.loads(
            sh(
                'gh', 'run', 'list', '-R', repo, '--workflow', 'ci-tests', '--branch',
                pr['headRefName'], '--json', 'databaseId,headSha,status,conclusion,createdAt', '--limit', '20',
            )
        )
        same_sha = [r for r in runs if r['headSha'] == pr['headRefOid']] or runs
        if not same_sha:
            sys.exit(f'No ci-tests runs found for PR #{ref} ({pr["headRefName"]})')
        run = same_sha[0]
        print(f'PR #{ref} → run {run["databaseId"]} ({run["status"]}/{run["conclusion"]}, {run["createdAt"]})')
        return repo, str(run['databaseId'])
    if ref.isdigit():
        return repo, ref
    sys.exit(f'Cannot interpret {ref!r} as a run URL, run id, PR URL or PR number')


def fetch(args: argparse.Namespace) -> None:
    repo, run_id = resolve_run(args.ref, args.repo)
    dest = Path(args.dest or Path(os.environ.get('TMPDIR', '/tmp')) / f'ci-run-{run_id}').resolve()
    dest.mkdir(parents=True, exist_ok=True)

    run = gh_json(f'actions/runs/{run_id}', repo)
    jobs = gh_json(f'actions/runs/{run_id}/jobs?per_page=100', repo)['jobs']
    artifacts = gh_json(f'actions/runs/{run_id}/artifacts?per_page=100', repo)['artifacts']

    meta = {
        'repo': repo,
        'run_id': run_id,
        'url': run['html_url'],
        'title': run['display_title'],
        'branch': run['head_branch'],
        'sha': run['head_sha'],
        'attempt': run['run_attempt'],
        'conclusion': run['conclusion'],
        'pull_requests': [p['number'] for p in run.get('pull_requests', [])],
        'jobs': [{'id': j['id'], 'name': j['name'], 'conclusion': j['conclusion'], 'url': j['html_url']} for j in jobs],
        'artifacts': [],
    }
    print(f'{meta["title"]}\n{meta["url"]}  attempt {meta["attempt"]}  conclusion={meta["conclusion"]}')
    for j in meta['jobs']:
        print(f'  job {j["id"]}  {j["conclusion"]:<8} {j["name"]}')

    # Newest copy per artifact name unless --all-attempts.
    chosen: list[dict] = []
    if args.all_attempts:
        chosen = artifacts
    else:
        by_name: dict[str, dict] = {}
        for a in artifacts:
            if a['name'] not in by_name or a['created_at'] > by_name[a['name']]['created_at']:
                by_name[a['name']] = a
        chosen = list(by_name.values())
    kinds = set(args.only.split(',')) if args.only else None
    kind_of = lambda name: name.split('-')[0] if name.split('-')[0] in ('tutor', 'suite', 'playwright') else name

    for a in sorted(chosen, key=lambda a: a['name']):
        if kinds and kind_of(a['name']) not in kinds:
            continue
        if a['expired']:
            print(f'  skip {a["name"]}: expired')
            continue
        folder = a['name'] if not args.all_attempts else f'{a["name"]}-{a["id"]}'
        target = dest / folder
        print(f'  ↓ {a["name"]} ({a["size_in_bytes"] // 1024} KiB) → {target.relative_to(dest)}/')
        target.mkdir(exist_ok=True)
        zip_bytes = subprocess.run(
            ['gh', 'api', f'repos/{repo}/actions/artifacts/{a["id"]}/zip'], capture_output=True, check=True
        ).stdout
        zipfile.ZipFile(io.BytesIO(zip_bytes)).extractall(target)
        meta['artifacts'].append({'id': a['id'], 'name': a['name'], 'dir': folder, 'created_at': a['created_at']})

    for j in jobs:
        if j['conclusion'] in ('failure', 'cancelled', 'timed_out'):
            log = sh('gh', 'api', f'repos/{repo}/actions/jobs/{j["id"]}/logs', check=False)
            if log.strip():
                (dest / f'job-{j["id"]}.log').write_text(ANSI.sub('', log))
                print(f'  ↓ full log for failed job {j["id"]} → job-{j["id"]}.log')

    (dest / 'run.json').write_text(json.dumps(meta, indent=2))
    print(f'\nWrote {dest}/run.json — next: ci_artifacts.py summary {dest}')


# ------------------------------------------------------------------- report parsing


def extract_report(artifact_dir: Path) -> Path | None:
    """Extract the base64 zip embedded in the HTML report; return the report dir."""
    out = artifact_dir / 'report'
    if (out / 'report.json').exists():
        return out
    index = artifact_dir / 'playwright-report' / 'index.html'
    if not index.exists():
        return None
    m = re.search(r'id="playwrightReportBase64"[^>]*>data:application/zip;base64,([^<"]+)', index.read_text())
    if not m:
        return None
    zipfile.ZipFile(io.BytesIO(base64.b64decode(m.group(1)))).extractall(out)
    return out


def load_tests(report_dir: Path):
    """Yield (file_name, full test record) for every test in the report."""
    report = json.loads((report_dir / 'report.json').read_text())
    for f in report['files']:
        detail = json.loads((report_dir / f'{f["fileId"]}.json').read_text())
        for t in detail['tests']:
            yield f['fileName'], t


def playwright_artifacts(root: Path) -> list[Path]:
    return sorted(p for p in root.iterdir() if p.is_dir() and p.name.startswith('playwright-report'))


def first_error(test: dict) -> str:
    for r in reversed(test['results']):
        for e in r.get('errors', []):
            return ANSI.sub('', e.get('message', '')).strip().splitlines()[0]
    return ''


def summary(args: argparse.Namespace) -> None:
    root = Path(args.dir)
    meta_path = root / 'run.json'
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
        print(f'{meta["title"]}\n{meta["url"]}  (attempt {meta["attempt"]}, {meta["conclusion"]})')
        for j in meta['jobs']:
            print(f'  {j["conclusion"]:<8} {j["name"]}')

    for art in playwright_artifacts(root):
        report_dir = extract_report(art)
        print(f'\n== {art.name}')
        if not report_dir:
            print('  no playwright-report/index.html found')
            continue
        report = json.loads((report_dir / 'report.json').read_text())
        s = report['stats']
        print(f'  total {s["total"]}  passed {s["expected"]}  failed {s["unexpected"]}  flaky {s["flaky"]}  skipped {s["skipped"]}')
        if report.get('errors'):
            print('  global errors (config / globalSetup):')
            for e in report['errors']:
                print('    ' + ANSI.sub('', e.get('message', str(e))).splitlines()[0])
        rows = []
        for file_name, t in load_tests(report_dir):
            if t['outcome'] in ('unexpected', 'flaky'):
                rows.append((t['outcome'], file_name, t['title'], t['projectName'], len(t['results']), first_error(t)))
        for outcome, file_name, title, project, attempts, err in sorted(rows):
            print(f'  [{outcome}] {file_name} › {title}  ({project}, {attempts} attempt(s))')
            if err:
                print(f'      {err[:220]}')
        if rows:
            errs = Counter(re.sub(r'[0-9a-f]{6,}|course-v1:\S+|\d+', '#', r[5])[:90] for r in rows)
            common = errs.most_common(3)
            if common and common[0][1] > 1:
                print('  most common error shapes:')
                for shape, n in common:
                    print(f'    {n}× {shape}')

    for art in sorted(root.glob('suite-reports*')):
        print(f'\n== {art.name}')
        a11y = art / 'a11y-violations.json'
        btr = art / 'btr-coverage.json'
        if a11y.exists():
            d = json.loads(a11y.read_text())
            print(f'  a11y: {d["totals"]}')
            for r in d.get('byRule', []):
                if r.get('failing') or r.get('status') == 'failing':
                    print(f'    failing rule {r["ruleId"]} ({r.get("impact")}): {r.get("help")}')
        if btr.exists():
            d = json.loads(btr.read_text())
            bad = [r for r in d['byTestId'] if r['status'] not in ('passed', 'skipped')]
            print(f'  btr: {d["total"]} tests, {d["annotated"]} annotated; non-passing test_ids: '
                  + (', '.join(f'{r["testId"]}={r["status"]}' for r in bad) or 'none'))

    for art in sorted(root.glob('tutor-logs*')):
        print(f'\n== {art.name}')
        for log in sorted(art.glob('*.log')):
            text = log.read_text(errors='replace')
            tb = text.count('Traceback (most recent call last)')
            if log.name == 'caddy.log':
                statuses = Counter(re.findall(r'"status":(\d+)', text))
                bad = {k: v for k, v in statuses.items() if k >= '400'}
                print(f'  {log.name:<16} {len(text.splitlines()):>7} lines  status≥400: {dict(sorted(bad.items()))}')
            else:
                errors = len(re.findall(r'\b(ERROR|CRITICAL)\b', text))
                print(f'  {log.name:<16} {len(text.splitlines()):>7} lines  tracebacks={tb}  ERROR/CRITICAL={errors}')

    for log in sorted(root.glob('job-*.log')):
        text = ANSI.sub('', log.read_text())
        hits = [re.sub(r'^\S+\s+', '', l) for l in text.splitlines() if re.search(r'✘|##\[error\]', l)]
        if hits:
            print(f'\n== {log.name}: {len(hits)} ✘/error lines (attempts listed once each)')
            for l in hits[:15]:
                print('  ' + l[:200])


def test_detail(args: argparse.Namespace) -> None:
    root = Path(args.dir)
    needle = args.needle.lower()
    found = 0
    for art in playwright_artifacts(root):
        report_dir = extract_report(art)
        if not report_dir:
            continue
        for file_name, t in load_tests(report_dir):
            if needle not in t['title'].lower() and needle not in file_name.lower():
                continue
            found += 1
            print(f'\n#### {art.name} :: {file_name} › {" › ".join(t["path"] + [t["title"]])}')
            print(f'project={t["projectName"]} outcome={t["outcome"]} tags={t["tags"]} '
                  f'test_id={[a["description"] for a in t["annotations"] if a["type"] == "test_id"]}')
            print(f'location=tests/{t["location"]["file"]}:{t["location"]["line"]}')
            for r in t['results']:
                print(f'\n-- attempt {r["retry"]}: {r["status"]} in {r["duration"]} ms (worker {r.get("workerIndex")})')
                for e in r.get('errors', []):
                    print(ANSI.sub('', e.get('message', '')))
                failed_steps = [s for s in flatten_steps(r['steps']) if s.get('error')]
                if failed_steps:
                    print('failed steps:')
                    for s in failed_steps:
                        loc = s.get('location', {})
                        print(f'  • {s["title"]}  ({loc.get("file")}:{loc.get("line")})')
                for a in r.get('attachments', []):
                    p = art / 'playwright-report' / a['path'] if a.get('path') else None
                    print(f'attachment {a["name"]:<14} {p}')
                    if a['name'] == 'error-context' and p and p.exists() and args.context:
                        print(indent(strip_source(p.read_text())))
    if not found:
        print(f'no test matching {args.needle!r}')


def flatten_steps(steps):
    for s in steps:
        yield s
        yield from flatten_steps(s.get('steps', []))


def strip_source(md: str) -> str:
    """Keep only `# Test info`…`# Error details` from error-context.md (the source is in the repo)."""
    md = re.split(r'^# Test source', md, flags=re.MULTILINE)[0]
    return re.sub(r'^# Instructions.*?(?=^# )', '', md, flags=re.MULTILINE | re.DOTALL).strip()


def indent(s: str) -> str:
    return '\n'.join('    ' + l for l in s.splitlines())


# ------------------------------------------------------------------------- logs


def logs(args: argparse.Namespace) -> None:
    root = Path(args.dir)
    pattern = re.compile(args.grep) if args.grep else None
    for art in sorted(root.glob('tutor-logs*')):
        for log in sorted(art.glob('*.log')):
            service = log.stem
            if args.service and service not in args.service.split(','):
                continue
            lines = log.read_text(errors='replace').splitlines()
            if pattern:
                for i, l in enumerate(lines):
                    if pattern.search(l):
                        lo, hi = max(0, i - args.context), min(len(lines), i + args.context + 1)
                        print(f'\n-- {art.name}/{log.name}:{i + 1}')
                        print('\n'.join(lines[lo:hi]))
                continue
            # Default: tracebacks grouped by final exception line, plus 5xx responses.
            groups: dict[str, dict] = {}
            i = 0
            while i < len(lines):
                if 'Traceback (most recent call last)' in lines[i]:
                    j = i + 1
                    while j < len(lines) and re.match(r'^\S+\s+\|\s{2,}', lines[j]):
                        j += 1
                    tail = lines[j].split('|', 1)[-1].strip() if j < len(lines) else ''
                    frames = [l.split('|', 1)[-1].strip() for l in lines[i:j] if 'File "' in l]
                    app = [f for f in frames if 'site-packages' not in f]
                    where = (app or frames or [''])[-1]
                    key = re.sub(r'course-v1:\S+|\d+', '#', tail)[:160]
                    g = groups.setdefault(key, {'n': 0, 'first': i + 1, 'tail': tail, 'where': where})
                    g['n'] += 1
                    i = j
                elif service == 'caddy' and re.search(r'"status":5\d\d', lines[i]):
                    m = re.search(r'"method":"(\w+)".*?"uri":"([^"]+)".*?"status":(\d+)', lines[i])
                    if m:
                        print(f'{art.name}/{log.name}:{i + 1}  {m.group(3)} {m.group(1)} {m.group(2)}')
                    i += 1
                else:
                    i += 1
            for g in sorted(groups.values(), key=lambda g: -g['n']):
                print(f'{g["n"]:>4}× {art.name}/{log.name}:{g["first"]}  {g["tail"][:200]}')
                if g['where']:
                    print(f'      last app frame: {g["where"]}')


# ------------------------------------------------------------------------- main


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)

    f = sub.add_parser('fetch', help='download artifacts + failed job logs for a run')
    f.add_argument('ref', help='run URL, run id, PR URL or PR number')
    f.add_argument('--dest', help='directory to write into (default $TMPDIR/ci-run-<id>)')
    f.add_argument('--repo', default=DEFAULT_REPO)
    f.add_argument('--only', help='comma list of kinds: playwright,suite,tutor')
    f.add_argument('--all-attempts', action='store_true', help='keep every attempt\'s copy of each artifact')
    f.set_defaults(fn=fetch)

    s = sub.add_parser('summary', help='one-screen overview of failures across every downloaded artifact')
    s.add_argument('dir')
    s.set_defaults(fn=summary)

    t = sub.add_parser('test', help='full detail for tests whose title or file matches')
    t.add_argument('dir')
    t.add_argument('needle')
    t.add_argument('--no-context', dest='context', action='store_false', help='omit error-context.md')
    t.set_defaults(fn=test_detail)

    lg = sub.add_parser('logs', help='tracebacks and 5xx from Tutor logs, or grep with context')
    lg.add_argument('dir')
    lg.add_argument('--service', help='comma list: lms,cms,lms-worker,cms-worker,mfe,caddy')
    lg.add_argument('--grep', help='regex; prints matches with context instead of the traceback digest')
    lg.add_argument('-C', '--context', type=int, default=3)
    lg.set_defaults(fn=logs)

    args = p.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
