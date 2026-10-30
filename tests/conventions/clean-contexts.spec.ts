import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';
import ts from 'typescript';

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

/** Every `<receiver>.newContext(...)` call in a file. */
function newContextCalls(file: string, source: string): ts.CallExpression[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'newContext'
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

/** Why a call's options leave `storageState` to the project, or `undefined` when they name it. */
function problemWith(call: ts.CallExpression): string | undefined {
  const [options] = call.arguments;
  if (options === undefined) return 'no options';
  if (!ts.isObjectLiteralExpression(options)) return 'options the scan cannot read';
  const named = options.properties.some(
    (property) =>
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === 'storageState',
  );
  return named ? undefined : 'options without a `storageState` key';
}

function violationsIn(file: string, source: string): Violation[] {
  return newContextCalls(file, source).flatMap((call) => {
    const problem = problemWith(call);
    if (problem === undefined) return [];
    // The line of `newContext` itself, not of the start of a chained receiver.
    const { name } = call.expression as ts.PropertyAccessExpression;
    const sourceFile = call.getSourceFile();
    const { line } = sourceFile.getLineAndCharacterOfPosition(name.getStart(sourceFile));
    return [{ line: line + 1, problem }];
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
