import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';

/**
 * Guards the rule that an installation setting is a capability, not a runtime
 * skip (see `src/fixtures/README.md`, "An installation setting is a
 * capability, not a probe").
 *
 * A skip decided at run time by probing the target makes the set of cases a run
 * covers invisible until it has run. A CI profile, such as an extended
 * configuration, can then no longer select the cases its settings enable. So every
 * conditional skip in the suite is labelled with its kind on the line above:
 *
 * - `capability`: an undeclared capability (the gate, and fixtures that
 *   re-check one).
 * - `suite-config`: the suite's own configuration lacks something the case
 *   needs, such as an admin account, an account backend, or `COURSE_KEY`.
 * - `content`: the configured course lacks content of the shape the case
 *   drives, and no profile seeds it.
 *
 * There is no kind for "the target is configured differently". A case like that
 * gets a capability and a tag, and its fixture checks the declaration instead
 * of skipping.
 */

/** Repo root, from `tests/conventions/` up two levels. */
const ROOT = path.resolve(__dirname, '..', '..');

/** Directories whose `.ts` files are scanned. */
const SCAN_DIRS = ['src', 'tests'];

/** This directory's specs mention the pattern themselves. */
const EXCLUDED_DIR = path.join(ROOT, 'tests', 'conventions');

const KINDS = ['capability', 'suite-config', 'content'] as const;

/** A conditional skip: `base.skip(`, `testInfo.skip(`, `test.skip(`, `setup.skip(`. */
const SKIP_CALL = /\b(?:base|testInfo|test|setup)\.skip\(/;

const LABEL = /\/\/ skip-kind: ([a-z-]+)/;

/** How many lines above the call the label may sit (a comment explaining the skip may follow it). */
const LABEL_WINDOW = 3;

function scannedFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (dir === EXCLUDED_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  };
  for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir));
  return files;
}

interface Finding {
  readonly where: string;
  readonly problem: string;
}

function findings(): Finding[] {
  const found: Finding[] = [];
  for (const file of scannedFiles()) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!SKIP_CALL.test(line) || line.trimStart().startsWith('*')) return;
      const where = `${path.relative(ROOT, file)}:${i + 1}`;
      const above = lines.slice(Math.max(0, i - LABEL_WINDOW), i);
      const label = above.map((l) => LABEL.exec(l)?.[1]).find((k) => k !== undefined);
      if (label === undefined) {
        found.push({ where, problem: `no \`// skip-kind:\` label (one of ${KINDS.join(', ')})` });
      } else if (!(KINDS as readonly string[]).includes(label)) {
        found.push({ where, problem: `unknown skip kind "${label}"` });
      }
    });
  }
  return found;
}

test.describe('skip kinds', { tag: '@unit' }, () => {
  test('every conditional skip is labelled with a known kind', () => {
    expect(
      findings(),
      'Label each skip `// skip-kind: capability|suite-config|content`. A skip that depends ' +
        'on how the target is configured is a capability instead: see src/fixtures/README.md.',
    ).toEqual([]);
  });

  test('finds the skips it guards', () => {
    // A scan that matched nothing would pass vacuously.
    const labelled = scannedFiles().filter((file) => LABEL.test(readFileSync(file, 'utf8')));
    expect(labelled.length).toBeGreaterThan(0);
  });
});
