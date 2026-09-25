import type { FullProject, Suite, TestCase } from '@playwright/test/reporter';

/**
 * Reads, for a test, the project it ran in and the CI labels
 * `playwright.config.ts` puts in the config `metadata`, which every project
 * inherits. A merged report (`playwright merge-reports`) keeps each blob's
 * projects apart with their own metadata, so these labels say which shard and
 * which CI profile ran a result even after the merge, where `config.shard` is
 * gone. Shared by the reporters.
 */

/** Finds the enclosing project for a test, walking up the suite tree. */
export function projectOf(test: TestCase): FullProject | undefined {
  let suite: Suite | undefined = test.parent;
  while (suite) {
    const project = suite.project?.();
    if (project) {
      return project;
    }
    suite = suite.parent;
  }
  return undefined;
}

function metadataLabel(project: FullProject | undefined, key: string): string {
  const value: unknown = project?.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

/** The CI shard (its `RUN_ID_SUFFIX`, e.g. `d2`); empty outside sharded CI. */
export function shardOf(project: FullProject | undefined): string {
  return metadataLabel(project, 'shard');
}

/** The CI profile (a key of `.ci/profiles.json`, e.g. `default`); empty outside CI. */
export function profileOf(project: FullProject | undefined): string {
  return metadataLabel(project, 'profile');
}
