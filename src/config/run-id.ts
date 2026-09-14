/**
 * Env var carrying the run identifier from the main process to every worker.
 * Playwright spawns workers as child processes that inherit the environment, so
 * a value set during global setup is the one every worker reads — the same trick
 * `src/config/index.ts` uses to print warnings once.
 */
export const RUN_ID_ENV = 'OPENEDX_E2E_RUN_ID';

/**
 * A short identifier unique to this run of the suite, for data that must be
 * unique per run but shared across workers — a Studio course number, a display
 * name a spec later searches for. Base-36 milliseconds: sortable, seven or eight
 * characters, and safe inside a course key (letters and digits only).
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
  const runId = Date.now().toString(36);
  process.env[RUN_ID_ENV] = runId;
  return runId;
}
