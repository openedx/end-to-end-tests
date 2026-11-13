import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';
import ts from 'typescript';

import { externalTestDirsUnder } from '../../src/config';

/**
 * Guards the rule that `knownGap(...)` sits only on a test that is held back
 * (CONVENTIONS.md, "When the sheet and the platform disagree").
 *
 * The run report reads a `known_gap` annotation only for a test that is skipped,
 * a `fixme`, or an expected failure (`test.fail`). On a test that runs and passes
 * it is silently dropped, so the reason it was meant to carry never reaches the
 * results sheet. A passing test that knowingly asserts the platform against the
 * sheet says so with `disputed(...)`, which the report does show.
 *
 * A test counts as held back when it is declared `test.fixme(...)` /
 * `test.skip(...)` / `test.fail(...)`, or its body calls `test.fixme`,
 * `test.skip` or `test.fail`. The scan parses each spec, so options and bodies
 * spanning many lines are read whole.
 */

/** Repo root, from `tests/conventions/` up two levels. */
const ROOT = path.resolve(__dirname, '..', '..');

/** This directory's specs mention the pattern themselves. */
const EXCLUDED_DIR = path.join(ROOT, 'tests', 'conventions');

const HELD_BACK_CALL = /\btest\.(?:fixme|skip|fail)\(/;
const KNOWN_GAP_CALL = /\bknownGap\(/;
const HELD_BACK_DECLARATIONS = new Set(['test.fixme', 'test.skip', 'test.fail']);

function specFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (dir === EXCLUDED_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.spec.ts')) files.push(full);
    }
  };
  for (const dir of ['tests', ...externalTestDirsUnder(ROOT)]) walk(path.join(ROOT, dir));
  return files;
}

/** Every `test(title, options, body)` (or `test.fixme/skip/fail(...)`) whose options carry `knownGap`. */
function testsWithKnownGap(
  file: string,
  source: string,
): { line: number; title: string; heldBack: boolean }[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: { line: number; title: string; heldBack: boolean }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.arguments.length >= 3) {
      const callee = node.expression.getText(sourceFile);
      if (callee === 'test' || HELD_BACK_DECLARATIONS.has(callee)) {
        const options = node.arguments[1]!.getText(sourceFile);
        if (KNOWN_GAP_CALL.test(options)) {
          const body = node.arguments[2]!.getText(sourceFile);
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const [title] = node.arguments;
          found.push({
            line: line + 1,
            title: title && ts.isStringLiteralLike(title) ? title.text : title!.getText(sourceFile),
            heldBack: HELD_BACK_DECLARATIONS.has(callee) || HELD_BACK_CALL.test(body),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** `<spec>:<line>: <title>` for every passing test carrying a `knownGap`. */
function passingTestsWithKnownGap(): string[] {
  return specFiles().flatMap((file) => {
    const relative = path.relative(ROOT, file);
    return testsWithKnownGap(file, readFileSync(file, 'utf8'))
      .filter(({ heldBack }) => !heldBack)
      .map(({ line, title }) => `${relative}:${line}: ${title}`);
  });
}

test.describe('knownGap sits only on held-back tests', { tag: '@unit' }, () => {
  test('no passing test carries a knownGap the report would drop', () => {
    const violations = passingTestsWithKnownGap();
    expect(
      violations,
      'knownGap() is reported only for a fixme, skip or test.fail. On a passing test use ' +
        'disputed() (the platform is right) or move the reason to a held-back sibling (the ' +
        'sheet is right). See CONVENTIONS.md ("When the sheet and the platform disagree").\n' +
        violations.join('\n'),
    ).toEqual([]);
  });

  test('tells a held-back test from a passing one', () => {
    const source = [
      "test('passes', { annotation: knownGap('why') }, async () => {});",
      "test.fixme('held', { annotation: knownGap('why') }, async () => {});",
      "test('fails', { annotation: [testId('TC-1'), knownGap('why')] }, async () => {",
      "  test.fail(true, 'defect');",
      '});',
      "test('plain', { annotation: testId('TC-2') }, async () => {});",
    ].join('\n');
    expect(testsWithKnownGap('example.spec.ts', source)).toEqual([
      { line: 1, title: 'passes', heldBack: false },
      { line: 2, title: 'held', heldBack: true },
      { line: 3, title: 'fails', heldBack: true },
    ]);
  });

  test('finds the tests it guards', () => {
    // A scan that matched nothing would pass vacuously.
    const found = specFiles().flatMap((file) =>
      testsWithKnownGap(file, readFileSync(file, 'utf8')),
    );
    expect(found.length).toBeGreaterThan(0);
  });
});
