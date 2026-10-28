import { devices, type PlaywrightTestProject } from '@playwright/test';
import path from 'node:path';

import { authStateFile } from './src/auth';

/**
 * Single source of truth for the suite's tier projects, shared by
 * `playwright.config.ts` (the run) and `merge.config.ts` (merging shard blob
 * reports). Defining the tiers once keeps the stock and the mirrored external
 * projects (from `CUSTOM_TEST_DIRS`) in lock-step: a change to a tier's grep,
 * auth role or browser applies to both, and spec-path resolution on a merge
 * matches the run.
 */

const CHROME = { ...devices['Desktop Chrome'] };

interface TierSpec {
  /** Base project name, also the prefix of its mirrored external projects. */
  readonly name: string;
  readonly grep: RegExp;
  readonly grepInvert?: RegExp;
  /** Captured auth role; its presence makes the tier depend on `setup`. */
  readonly role?: 'learner' | 'author';
  /** Whether the tier drives a browser (the node-only `unit` tier does not). */
  readonly browser: boolean;
}

/**
 * The tiers, in run order. `unit` is pure logic (no browser/target); `smoke` and
 * `regression` are anonymous browser tiers; `lms-learner` and `studio-author`
 * reuse the `setup` project's captured state. The `setup` project itself is not
 * a tier (it has no external mirror) and is inserted in {@link buildProjects}.
 */
const TIERS: readonly TierSpec[] = [
  { name: 'unit', grep: /@unit/, browser: false },
  { name: 'smoke', grep: /@smoke/, grepInvert: /@authenticated|@author/, browser: true },
  { name: 'regression', grep: /@regression/, grepInvert: /@authenticated|@author/, browser: true },
  { name: 'lms-learner', grep: /@authenticated/, role: 'learner', browser: true },
  { name: 'studio-author', grep: /@author/, role: 'author', browser: true },
];

/** Signs in once per role and writes `.auth/<role>.json`; a dependency of the
 * authenticated tiers. Not a tier: it has no external mirror. */
const SETUP_PROJECT: PlaywrightTestProject = {
  name: 'setup',
  testMatch: /.*\.setup\.ts/,
};

/**
 * A unique, readable kebab-case label for an external directory: the directory
 * relative to the working directory (not just its basename, so two providers'
 * `tests/` folders stay distinct), slugified to match the repo's project-name
 * style (`lms-learner`).
 */
function externalLabel(dir: string): string {
  const relative = path.relative(process.cwd(), dir) || path.basename(dir);
  return (
    relative
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'external'
  );
}

/** Builds one tier project, mirrored onto `dir` (an external directory) when given. */
function tierProject(tier: TierSpec, dir?: string): PlaywrightTestProject {
  const name = dir ? `${tier.name}/${externalLabel(dir)}` : tier.name;
  const project: PlaywrightTestProject = { name, grep: tier.grep };
  if (tier.grepInvert) {
    project.grepInvert = tier.grepInvert;
  }
  if (dir) {
    project.testDir = dir;
  }
  if (tier.browser) {
    project.use = tier.role ? { ...CHROME, storageState: authStateFile(tier.role) } : { ...CHROME };
  }
  if (tier.role) {
    project.dependencies = ['setup'];
  }
  return project;
}

/**
 * The full project list: the stock tiers plus `setup`, then the tiers mirrored
 * onto each external directory so provider specs run in the same invocation.
 */
export function buildProjects(externalDirs: readonly string[]): PlaywrightTestProject[] {
  const projects: PlaywrightTestProject[] = [];
  for (const tier of TIERS) {
    projects.push(tierProject(tier));
    // `setup` runs right after the node-only `unit` tier and before the browser
    // tiers that depend on it.
    if (tier.name === 'unit') {
      projects.push(SETUP_PROJECT);
    }
  }
  for (const dir of externalDirs) {
    for (const tier of TIERS) {
      projects.push(tierProject(tier, dir));
    }
  }
  return projects;
}
