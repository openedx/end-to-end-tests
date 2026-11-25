import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';
import { parseSync, Visitor } from 'oxc-parser';
import type { CallExpression, StaticMemberExpression } from 'oxc-parser';

/**
 * Guards the rule that every new context names its `storageState` (see
 * ARCHITECTURE.md, "Authentication and multi-origin sessions").
 *
 * Inside a test, Playwright fills every option a `newContext()` call leaves out
 * from the project's `use` block, `storageState` included. So in a project that
 * runs signed in, a `browser.newContext()` or `request.newContext()` without one
 * starts with that role's cookies, and a context meant for another user, or for
 * nobody, is not fresh. Start such a context with `newCleanBrowserContext` /
 * `newCleanRequestContext` (`src/auth/clean-context.ts`), or pass the state file
 * it should resume.
 *
 * The scan parses each file rather than matching lines, so options that span
 * several lines are read whole, and a comment or string that mentions
 * `newContext()` is not a call. Only a key the scan can see counts: options passed
 * as a variable (`newContext(options)`) or through a spread are flagged too, so
 * name `storageState` in the object literal itself.
 */

/** Repo root, from `tests/conventions/` up two levels. */
const ROOT = path.resolve(__dirname, '..', '..');

/** Directories whose `.ts` files are scanned. */
const SCAN_DIRS = ['src', 'tests'];

interface Violation {
  readonly line: number;
  readonly problem: string;
}

function scannedFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const base = path.join(ROOT, dir);
    for (const entry of readdirSync(base, { recursive: true }) as string[]) {
      if (entry.endsWith('.ts')) files.push(path.join(base, entry));
    }
  }
  return files;
}

/** A `<receiver>.newContext(...)` call: the callee is a plain (not computed) member access. */
type NewContextCall = CallExpression & { readonly callee: StaticMemberExpression };

/** Every `<receiver>.newContext(...)` call in a file, in source order. */
function newContextCalls(file: string, source: string): NewContextCall[] {
  const calls: NewContextCall[] = [];
  new Visitor({
    CallExpression(node) {
      const { callee } = node;
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'newContext'
      ) {
        calls.push(node as NewContextCall);
      }
    },
  }).visit(parseSync(file, source).program);
  return calls;
}

/** Why a call's options leave `storageState` to the project, or `undefined` when they name it. */
function problemWith(call: NewContextCall): string | undefined {
  const [options] = call.arguments;
  if (options === undefined) return 'no options';
  if (options.type !== 'ObjectExpression') return 'options the scan cannot read';
  const named = options.properties.some(
    (property) =>
      // A plain or shorthand property: not a spread, method, accessor or computed key.
      property.type === 'Property' &&
      property.kind === 'init' &&
      !property.method &&
      !property.computed &&
      ((property.key.type === 'Identifier' && property.key.name === 'storageState') ||
        (property.key.type === 'Literal' && property.key.value === 'storageState')),
  );
  return named ? undefined : 'options without a `storageState` key';
}

function violationsIn(file: string, source: string): Violation[] {
  return newContextCalls(file, source).flatMap((call) => {
    const problem = problemWith(call);
    if (problem === undefined) return [];
    // The line of `newContext` itself, not of the start of a chained receiver.
    const line = source.slice(0, call.callee.property.start).split('\n').length;
    return [{ line, problem }];
  });
}

test.describe('new contexts name their storage state', { tag: '@unit' }, () => {
  test('no context in src or tests inherits the project storageState', () => {
    const violations: string[] = [];

    for (const file of scannedFiles()) {
      const relative = path.relative(ROOT, file);
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      for (const { line, problem } of violationsIn(file, source)) {
        violations.push(`${relative}:${line} — ${problem}: ${lines[line - 1]!.trim()}`);
      }
    }

    expect(
      violations,
      "A `newContext()` without `storageState` inherits the project's signed-in session. " +
        'Start a fresh one with newCleanBrowserContext / newCleanRequestContext (src/auth), ' +
        'or pass the state file to resume. See ARCHITECTURE.md ' +
        '("Authentication and multi-origin sessions").\n' +
        violations.join('\n'),
    ).toEqual([]);
  });

  test('reads a call whole, wherever its options break lines', () => {
    const source = [
      '// A bare `browser.newContext()` in a comment is not a call.',
      'browser.newContext();',
      'request.newContext({',
      '  baseURL: x,',
      '});',
      'request.newContext({',
      '  baseURL: x,',
      '  storageState: EMPTY_STORAGE_STATE,',
      '});',
      'browser.newContext({ storageState });',
      'browser.newContext(options);',
    ].join('\n');
    expect(violationsIn('example.ts', source)).toEqual([
      { line: 2, problem: 'no options' },
      { line: 3, problem: 'options without a `storageState` key' },
      { line: 11, problem: 'options the scan cannot read' },
    ]);
  });

  test('finds the calls it guards', () => {
    // A scan that matched nothing would pass vacuously.
    const calls = scannedFiles().flatMap((file) =>
      newContextCalls(file, readFileSync(file, 'utf8')),
    );
    expect(calls.length).toBeGreaterThan(0);
  });
});
