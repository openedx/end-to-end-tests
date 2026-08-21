import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';

/**
 * Guards the "locators never depend on displayed text" rule (see ARCHITECTURE.md).
 *
 * Target installations can run in any language, so a locator or assertion that
 * matches the platform's localized UI copy breaks under a different site
 * language. This test scans the locator-bearing layers (page objects, steps, and
 * specs) and fails if any of them match a *literal* UI string.
 *
 * Matching a value the test itself supplies (e.g. `getByText(identity.name)`) is
 * allowed — that is our own, language-independent data — so the checks only flag
 * literal string/regex/template arguments, not variables.
 */

/** Repo root, from `tests/conventions/` up two levels. */
const ROOT = path.resolve(__dirname, '..', '..');

/** Directories whose `.ts` files are scanned. */
const SCAN_DIRS = ['src/pages', 'src/steps', 'tests'];

/** This file legitimately contains the forbidden patterns as strings. */
const SELF = path.basename(__filename).replace(/\.js$/, '.ts');

/** Regex character class matching the start of a string / template / regex literal. */
const LITERAL = '[\'"`/]';

interface Rule {
  readonly name: string;
  readonly matches: (line: string) => boolean;
}

const RULES: Rule[] = [
  {
    name: 'getByText with literal text',
    matches: (l) => new RegExp(`getByText\\(\\s*${LITERAL}`).test(l),
  },
  {
    name: 'getByLabel with literal text',
    matches: (l) => new RegExp(`getByLabel\\(\\s*${LITERAL}`).test(l),
  },
  {
    name: 'getByPlaceholder with literal text',
    matches: (l) => new RegExp(`getByPlaceholder\\(\\s*${LITERAL}`).test(l),
  },
  {
    name: 'getByAltText with literal text',
    matches: (l) => new RegExp(`getByAltText\\(\\s*${LITERAL}`).test(l),
  },
  {
    name: 'getByTitle with literal text',
    matches: (l) => new RegExp(`getByTitle\\(\\s*${LITERAL}`).test(l),
  },
  {
    name: 'getByRole with a literal name',
    matches: (l) => l.includes('getByRole(') && new RegExp(`name:\\s*${LITERAL}`).test(l),
  },
  {
    name: 'filter/locator hasText with literal text',
    matches: (l) => new RegExp(`hasText:\\s*${LITERAL}`).test(l),
  },
  { name: 'Playwright :has-text() selector', matches: (l) => l.includes(':has-text(') },
  { name: 'Playwright text= selector', matches: (l) => /['"`]\s*text=/.test(l) },
  {
    name: 'toContainText with literal text',
    matches: (l) => new RegExp(`toContainText\\(\\s*${LITERAL}`).test(l),
  },
  {
    name: 'toHaveText with literal text',
    matches: (l) => new RegExp(`toHaveText\\(\\s*${LITERAL}`).test(l),
  },
];

function scannedFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const base = path.join(ROOT, dir);
    let entries: string[];
    try {
      entries = readdirSync(base, { recursive: true }) as string[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith('.ts') && path.basename(entry) !== SELF) {
        files.push(path.join(base, entry));
      }
    }
  }
  return files;
}

test.describe('locators never depend on displayed text @unit', () => {
  test('no page object, step, or spec matches localized UI text', () => {
    const violations: string[] = [];

    for (const file of scannedFiles()) {
      const relative = path.relative(ROOT, file);
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const rule of RULES) {
          if (rule.matches(line)) {
            violations.push(`${relative}:${index + 1} — ${rule.name}: ${line.trim()}`);
          }
        }
      });
    }

    expect(
      violations,
      "Locators and assertions must not depend on the target's displayed (localized) text. " +
        'Use test IDs, stable attributes/roles, or values the test itself supplied. ' +
        'See ARCHITECTURE.md ("Locators never depend on displayed text").\n' +
        violations.join('\n'),
    ).toEqual([]);
  });
});
