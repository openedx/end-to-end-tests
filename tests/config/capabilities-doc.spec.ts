import { readFileSync } from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';

import { resolveCapabilities } from '../../scripts/ci-profiles/profiles.mts';
import {
  CAPABILITIES,
  isDefaultOnCapability,
  parseCapabilities,
  type Capability,
} from '../../src/config';

/**
 * Keeps `docs/capabilities.md` in step with the code: every capability is
 * described, and the "Where CI turns each capability on" table says what
 * `.ci/openedx-releases.json` and the `extended` profile in `.ci/profiles.json`
 * actually declare. Adding or re-declaring a capability without updating the
 * doc fails here.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const DOC = readFileSync(path.join(ROOT, 'docs/capabilities.md'), 'utf8');

const releases = JSON.parse(
  readFileSync(path.join(ROOT, '.ci/openedx-releases.json'), 'utf8'),
) as Record<string, { capabilities: string }>;
const extended = (
  JSON.parse(readFileSync(path.join(ROOT, '.ci/profiles.json'), 'utf8')) as Record<
    string,
    {
      capabilities: { add: string[]; remove: string[] };
      tutorExtensions?: { capability: string; releases: string[] }[];
    }
  >
).extended;

/** The rows of the CI table, keyed by capability: the cell under each column header. */
function ciTable(): Map<string, Record<string, string>> {
  const block = /<!-- ci-table:start -->([\s\S]*?)<!-- ci-table:end -->/.exec(DOC)?.[1] ?? '';
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  const cells = (line: string) =>
    line
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
  const header = cells(lines[0] ?? '');
  const rows = new Map<string, Record<string, string>>();
  for (const line of lines.slice(2)) {
    const row = cells(line);
    const name = (row[0] ?? '').replace(/`/g, '');
    rows.set(name, Object.fromEntries(header.slice(1).map((h, i) => [h, row[i + 1] ?? ''])));
  }
  return rows;
}

/** What a release column should say for a capability, from the releases file. */
function releaseCell(capability: Capability, list: string): string {
  const declared = list.split(',').map((c) => c.trim());
  if (declared.includes(capability)) return 'declared';
  if (declared.includes(`-${capability}`)) return 'opted out';
  if (enabledBy(list).has(capability)) return 'default';
  return isDefaultOnCapability(capability) ? 'replaced' : '—';
}

/** The capabilities a comma-separated list enables, through the real parser. */
function enabledBy(list: string): Set<Capability> {
  const issues: string[] = [];
  const enabled = parseCapabilities(list, issues);
  expect(issues).toEqual([]);
  return enabled;
}

/**
 * What the extended column should say: what the profile turns on or off
 * relative to `default`, measured on `main`'s list (a pair's default-on half is
 * switched off by declaring the other half, not only by `remove`), and the
 * capabilities its Tutor extensions bring on the releases that have them.
 */
function extendedCell(capability: Capability): string {
  const extension = (extended?.tutorExtensions ?? []).find((e) => e.capability === capability);
  if (extension) return `+ ${extension.releases.join(', ')}`;
  const main = releases.main?.capabilities ?? '';
  const before = enabledBy(main);
  const after = enabledBy(
    resolveCapabilities(main, extended?.capabilities ?? { add: [], remove: [] }),
  );
  if (after.has(capability) && !before.has(capability)) return '+';
  if (before.has(capability) && !after.has(capability)) return '−';
  return '';
}

test.describe('docs/capabilities.md', { tag: '@unit' }, () => {
  test('describes every capability in its reference tables', () => {
    const reference = DOC.slice(DOC.indexOf('## Capability reference'));
    const described = new Set(
      reference
        .split('\n')
        .filter((l) => l.startsWith('| `'))
        .flatMap((l) => [...(l.split('|')[1] ?? '').matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1])),
    );
    expect(CAPABILITIES.filter((c) => !described.has(c))).toEqual([]);
    expect([...described].filter((c) => !(CAPABILITIES as readonly string[]).includes(c!))).toEqual(
      [],
    );
  });

  test("lists every capability in the CI table, in the vocabulary's order", () => {
    expect([...ciTable().keys()]).toEqual([...CAPABILITIES]);
  });

  test('says what CI declares for each release and for the extended profile', () => {
    const table = ciTable();
    for (const capability of CAPABILITIES) {
      const row = table.get(capability) ?? {};
      for (const [release, entry] of Object.entries(releases)) {
        expect(row[release], `${capability} on ${release}`).toBe(
          releaseCell(capability, entry.capabilities),
        );
      }
      expect(row.extended, `${capability} under extended`).toBe(extendedCell(capability));
    }
  });
});
