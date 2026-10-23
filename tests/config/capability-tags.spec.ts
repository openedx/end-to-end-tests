import { readFileSync } from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';

import { CAPABILITIES } from '../../src/config';

/**
 * Keeps capability tags from colliding with the tags that select Playwright
 * projects. Project selection is an unanchored regex match (`grep: /@unit/`,
 * CI's `--grep-invert @unit`), so a capability whose name *starts with* a
 * project tag is selected or excluded along with it: `@unit-unhide-draft` once
 * ran a browser spec in the `unit` project and was dropped from every Tutor run,
 * and `@authoring-sidebar` (now `studio-sidebar`) matched `/@author/`.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

/** The tags in `playwright.config.ts`'s project `grep` / `grepInvert` patterns. */
function projectTags(): Set<string> {
  const tags = new Set<string>();
  for (const [, source] of read('playwright.config.ts').matchAll(
    /grep(?:Invert)?:\s*\/(.+?)\/,/g,
  )) {
    for (const [, tag] of (source ?? '').matchAll(/@([a-z0-9-]+)/g)) tags.add(tag ?? '');
  }
  return tags;
}

/** The tags the CI workflows always pass to `exclude_features` (`--grep-invert`). */
function ciExcludedTags(): Set<string> {
  const tags = new Set<string>();
  for (const workflow of ['run_tests_tutor.yml', 'run_tests_external.yml']) {
    for (const [, value] of read(`.github/workflows/${workflow}`).matchAll(
      /^\s*exclude_features:\s*(.+)$/gm,
    )) {
      for (const [, tag] of (value ?? '').matchAll(/(?:^|\s)@([a-z0-9-]+)/g)) tags.add(tag ?? '');
    }
  }
  return tags;
}

test.describe('capability tags', { tag: '@unit' }, () => {
  const reserved = new Set([...projectTags(), ...ciExcludedTags()]);

  test('reads the project and CI exclusion tags', () => {
    // Guards the parsers: an empty set would make the collision check vacuous.
    expect([...reserved]).toEqual(
      expect.arrayContaining(['unit', 'smoke', 'regression', 'authenticated', 'author']),
    );
  });

  test('no capability name starts with a project or CI-excluded tag', () => {
    const collisions = CAPABILITIES.flatMap((capability) =>
      [...reserved]
        .filter((tag) => capability.startsWith(tag))
        .map((tag) => `@${capability} is matched by @${tag}`),
    );
    expect(collisions).toEqual([]);
  });
});
