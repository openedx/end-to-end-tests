#!/usr/bin/env python3
"""Check and complete the diagnosis a triage run wrote, for the jobs after it.

    validate.py [TRIAGE_DIR]        (default: triage)

Reads TRIAGE_DIR/out/triage.json and issue.md (written by the diagnosis step,
which may have failed or been skipped) plus what the gather job wrote
(context.json, provenance.json, summary.txt). Writes:

- out/triage.json — the diagnosis if it validates against
  .github/triage/triage.schema.json, else a fallback with verdict `unknown`
  built from summary.txt, so a later job still files an issue. Completed with
  the fields the workflow owns rather than the model: `run`, `baseline`,
  `upstream_changes`, `fingerprint`, `rerun`, `status`, `problems`.
  The model's own file is kept as out/triage.raw.json.
- out/issue.md — the issue body, secret-shaped strings redacted and capped.
- $GITHUB_OUTPUT — verdict, rerun, fingerprint, status.

The verdict and the re-run decision are recomputed from the per-test
categories here, so neither rests on the model's say-so alone. Standard
library only; never exits non-zero for a bad diagnosis, only for a broken
gather (no context.json).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path

SCHEMA = Path(__file__).with_name('triage.schema.json')
ISSUE_LIMIT = 60_000

# Secret-shaped strings that must never reach an issue: API keys and tokens,
# JWTs, session/CSRF cookies, basic-auth URLs, e-mail addresses.
SECRETS = [
    re.compile(r'sk-ant-[A-Za-z0-9_\-]{10,}'),
    re.compile(r'\bgh[pousr]_[A-Za-z0-9]{20,}'),
    re.compile(r'\bgithub_pat_[A-Za-z0-9_]{20,}'),
    re.compile(r'\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]*'),
    re.compile(r'(?i)\b(sessionid|csrftoken|edx-jwt-cookie[\w-]*|[\w-]*sessionid)=[^\s;"\']+'),
    re.compile(r'(?i)(password|passwd|secret|token|api[_-]?key)(["\']?\s*[:=]\s*["\']?)[^\s"\',;]{4,}'),
    re.compile(r'https?://[^/\s:@]+:[^/\s@]+@'),
    re.compile(r'\b[\w.+-]+@[\w-]+\.[\w.-]+\b'),
]


def redact(text: str) -> str:
    for pattern in SECRETS:
        if pattern.groups >= 2:
            text = pattern.sub(lambda m: f'{m.group(1)}{m.group(2)}[redacted]', text)
        else:
            text = pattern.sub('[redacted]', text)
    # @mentions would notify people; break them without changing how they read.
    return re.sub(r'(?<![\w`])@(?=[A-Za-z0-9])', '@​', text)


def redact_all(value):
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, list):
        return [redact_all(v) for v in value]
    if isinstance(value, dict):
        return {k: redact_all(v) for k, v in value.items()}
    return value


# --------------------------------------------------------------- schema subset

TYPES = {
    'object': dict, 'array': list, 'string': str, 'boolean': bool, 'null': type(None),
    'integer': int, 'number': (int, float),
}


def check(value, schema: dict, where: str = '$') -> list[str]:
    """Errors for `value` against the subset of JSON Schema the triage schema uses."""
    types = schema.get('type')
    if types:
        allowed = types if isinstance(types, list) else [types]
        ok = any(
            isinstance(value, TYPES[t]) and not (t in ('integer', 'number') and isinstance(value, bool))
            for t in allowed
        )
        if not ok:
            return [f'{where}: expected {"/".join(allowed)}, got {type(value).__name__}']
    errors = []
    if 'enum' in schema and value not in schema['enum']:
        errors.append(f'{where}: {value!r} not in {schema["enum"]}')
    if isinstance(value, str):
        if len(value) < schema.get('minLength', 0):
            errors.append(f'{where}: shorter than {schema["minLength"]}')
        if len(value) > schema.get('maxLength', 10**9):
            errors.append(f'{where}: longer than {schema["maxLength"]}')
    if isinstance(value, list):
        if len(value) < schema.get('minItems', 0):
            errors.append(f'{where}: fewer than {schema["minItems"]} items')
        if len(value) > schema.get('maxItems', 10**9):
            errors.append(f'{where}: more than {schema["maxItems"]} items')
        for i, item in enumerate(value):
            errors += check(item, schema.get('items', {}), f'{where}[{i}]')
    if isinstance(value, dict):
        props = schema.get('properties', {})
        for key in schema.get('required', []):
            if key not in value:
                errors.append(f'{where}: missing {key}')
        for key, item in value.items():
            if key in props:
                errors += check(item, props[key], f'{where}.{key}')
            elif schema.get('additionalProperties') is False:
                errors.append(f'{where}: unexpected key {key}')
    return errors


# ---------------------------------------------------------------- derivations


def derive_verdict(failures: list[dict], fallback: str) -> str:
    if not failures:
        return fallback
    real = {f['category'] for f in failures if f['category'] != 'spurious'}
    if not real:
        return 'spurious'
    return real.pop() if len(real) == 1 else 'mixed'


def fingerprint(failures: list[dict]) -> str:
    """Stable id for 'the same breakage': the failing tests and their categories."""
    lines = sorted({f"{f['test']}|{f['category']}" for f in failures})
    return hashlib.sha256('\n'.join(lines).encode()).hexdigest()[:16]


SUMMARY_FAILURE = re.compile(r'^\s+\[unexpected\] (.+?) › (.+?)  \(.*?, \d+ attempt')


def failures_from_summary(summary: str) -> list[dict]:
    seen, out = set(), []
    for line in summary.splitlines():
        m = SUMMARY_FAILURE.match(line)
        if m and (key := f'{m.group(1)} › {m.group(2)}') not in seen:
            seen.add(key)
            out.append({
                'test': key, 'category': 'unknown', 'confidence': 'low', 'error_shape': '',
                'fix_layer': 'unknown', 'evidence': [],
            })
    return out


def fallback_issue(context: dict, summary: str, problems: list[str]) -> str:
    run = context['failed']
    reasons = '\n'.join(f'- {p}' for p in problems) or '- (none recorded)'
    return (
        '## Summary\n\n'
        f'Scheduled run [{run["run_id"]}]({run["url"]}) failed, and the automated diagnosis did not '
        'produce a usable result, so this issue carries only the failure overview.\n\n'
        f'Why the diagnosis is missing:\n\n{reasons}\n\n'
        '## Failure overview\n\n'
        f'```\n{summary[:40_000]}\n```\n'
    )


# ----------------------------------------------------------------------- main


def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'triage')
    out = root / 'out'
    out.mkdir(parents=True, exist_ok=True)
    context = json.loads((root / 'context.json').read_text())
    summary = (root / 'summary.txt').read_text(errors='replace') if (root / 'summary.txt').exists() else ''
    prov_path = root / 'provenance.json'
    prov = json.loads(prov_path.read_text()) if prov_path.exists() else {}
    schema = json.loads(SCHEMA.read_text())

    problems: list[str] = []
    if (out / 'error.txt').exists():
        problems.append((out / 'error.txt').read_text().strip()[:500])

    diagnosis = None
    # The model's file, kept aside on the first run so re-running is harmless.
    raw_path = out / 'triage.raw.json'
    if not raw_path.exists() and (out / 'triage.json').exists():
        (out / 'triage.json').replace(raw_path)
    if raw_path.exists():
        raw = raw_path.read_text(errors='replace')
        try:
            candidate = json.loads(raw)
            errors = check(candidate, schema)
            if errors:
                problems.append('triage.json does not match the schema: ' + '; '.join(errors[:10]))
            else:
                diagnosis = candidate
        except json.JSONDecodeError as e:
            problems.append(f'triage.json is not JSON: {e}')
    else:
        problems.append('the diagnosis wrote no triage.json')

    issue_path = out / 'issue.md'
    issue = issue_path.read_text(errors='replace') if issue_path.exists() else ''
    if diagnosis and len(issue.strip()) < 50:
        problems.append('the diagnosis wrote no usable issue.md')
        diagnosis = None

    status = 'ok' if diagnosis else 'fallback'
    if not diagnosis:
        failures = failures_from_summary(summary)
        diagnosis = {
            'schema': 1,
            'verdict': 'unknown',
            'confidence': 'low',
            'title': f'automated triage incomplete (run {context["failed"]["run_id"]})',
            'summary': 'The automated diagnosis did not produce a usable result; see the failure overview.',
            'rerun_recommended': False,
            'failures': failures,
        }
        issue = fallback_issue(context, summary, problems)

    diagnosis = redact_all(diagnosis)
    failures = diagnosis['failures']
    derived = derive_verdict(failures, diagnosis['verdict'])
    if derived != diagnosis['verdict']:
        problems.append(f'verdict {diagnosis["verdict"]!r} does not follow from the per-test categories; using {derived!r}')
        diagnosis['verdict'] = derived

    attempt = int(context['failed'].get('attempt') or 1)
    rerun = (
        status == 'ok'
        and attempt == 1
        and diagnosis['rerun_recommended'] is True
        and diagnosis['verdict'] == 'spurious'
        and diagnosis['confidence'] == 'high'
        and bool(failures)
        and all(f['category'] == 'spurious' and f['confidence'] == 'high' for f in failures)
    )

    diagnosis.update({
        'status': status,
        'problems': [redact(p) for p in problems],
        'run': context['failed'],
        'baseline': context.get('baseline'),
        'upstream_changes': prov.get('changed', []) if isinstance(prov, dict) else [],
        'fingerprint': fingerprint(failures) if failures else f'run-{context["failed"]["run_id"]}',
        'rerun': rerun,
    })
    session = out / 'session.json'
    if session.exists():
        try:
            s = json.loads(session.read_text())
            diagnosis['cost_usd'] = s.get('total_cost_usd')
            diagnosis['turns'] = s.get('num_turns')
        except json.JSONDecodeError:
            pass

    issue = redact(issue)
    if len(issue) > ISSUE_LIMIT:
        issue = issue[:ISSUE_LIMIT] + '\n\n_(truncated)_\n'
    (out / 'issue.md').write_text(issue)
    (out / 'triage.json').write_text(json.dumps(diagnosis, indent=2) + '\n')

    outputs = {
        'verdict': diagnosis['verdict'],
        'rerun': str(rerun).lower(),
        'fingerprint': diagnosis['fingerprint'],
        'status': status,
    }
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as fh:
            fh.writelines(f'{k}={v}\n' for k, v in outputs.items())
    print(json.dumps({**outputs, 'problems': diagnosis['problems']}, indent=2))


if __name__ == '__main__':
    main()
