/**
 * Env var carrying the run identifier from the main process to every worker.
 * Playwright spawns workers as child processes that inherit the environment, so
 * a value set during global setup is the one every worker reads — the same trick
 * `src/config/index.ts` uses to print warnings once.
 */
export const RUN_ID_ENV = 'OPENEDX_E2E_RUN_ID';

/**
 * Env var naming an optional suffix for the run id: one to three lowercase
 * letters or digits. CI sets it per shard (profile code + shard number, e.g.
 * `d2`), so shards that start in the same millisecond still mint different run
 * ids, and leftover data names the shard that created it.
 */
export const RUN_ID_SUFFIX_ENV = 'RUN_ID_SUFFIX';

const RUN_ID_SUFFIX_PATTERN = /^[a-z0-9]{0,3}$/;

/**
 * Validates a run-id suffix. The run id ends up in course numbers, org short
 * names, slugs and display names, so only the alphabet all of them accept is
 * allowed, and it is kept short for the length-capped ones (org names).
 */
export function parseRunIdSuffix(value: string | undefined): string {
  const suffix = (value ?? '').trim();
  if (!RUN_ID_SUFFIX_PATTERN.test(suffix)) {
    throw new Error(
      `${RUN_ID_SUFFIX_ENV} must be at most three lowercase letters or digits; got "${suffix}".`,
    );
  }
  return suffix;
}

/**
 * A short identifier unique to this run of the suite, for data that must be
 * unique per run but shared across workers — a Studio course number, a display
 * name a spec later searches for. Base-36 milliseconds, sortable, seven or eight
 * characters, safe inside a course key (letters and digits only), plus the
 * optional {@link RUN_ID_SUFFIX_ENV}.
 *
 * Generated once per process tree: the first caller (global setup, in the main
 * process) stores it in {@link RUN_ID_ENV} so workers inherit rather than mint
 * their own, which would break the "shared across workers" half.
 */
export function getRunId(): string {
  const existing = process.env[RUN_ID_ENV];
  if (existing !== undefined && existing !== '') {
    return existing;
  }
  const runId = Date.now().toString(36) + parseRunIdSuffix(process.env[RUN_ID_SUFFIX_ENV]);
  process.env[RUN_ID_ENV] = runId;
  return runId;
}

/**
 * Env var naming the CI profile a job runs (a key of `.ci/profiles.json`,
 * e.g. `default`); empty outside CI. Set by the run-suite action.
 */
export const CI_PROFILE_ENV = 'CI_PROFILE';

const CI_PROFILE_PATTERN = /^(?:[a-z][a-z0-9-]*)?$/;

/**
 * The labels `playwright.config.ts` puts in the config `metadata`, which every
 * result carries into a merged report (see `src/reporting/project.ts`): the
 * shard that ran it (its run-id suffix) and the CI profile.
 */
export function ciResultLabels(env: NodeJS.ProcessEnv = process.env): {
  readonly shard: string;
  readonly profile: string;
} {
  const profile = (env[CI_PROFILE_ENV] ?? '').trim();
  if (!CI_PROFILE_PATTERN.test(profile)) {
    throw new Error(
      `${CI_PROFILE_ENV} must be a profile name of .ci/profiles.json; got "${profile}".`,
    );
  }
  return { shard: parseRunIdSuffix(env[RUN_ID_SUFFIX_ENV]), profile };
}
