/**
 * The bounded poll every "wait for the platform" step is built on. It never
 * throws on timeout: the outcome carries `satisfied` and the `last` reading so
 * the spec's failure message names what the platform actually said.
 */

const POLL_INTERVAL_MS = 1_000;

/** What a poll observed when it stopped — satisfied or out of budget. */
export interface PollOutcome<T> {
  readonly satisfied: boolean;
  readonly last: T;
  readonly elapsedMs: number;
}

/** Re-reads with `read` every second until `satisfied(reading)` or `timeoutMs` elapses. */
export async function pollUntil<T>(
  read: () => Promise<T>,
  satisfied: (reading: T) => boolean,
  timeoutMs: number,
): Promise<PollOutcome<T>> {
  const started = Date.now();
  let last = await read();
  while (!satisfied(last) && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    last = await read();
  }
  return { satisfied: satisfied(last), last, elapsedMs: Date.now() - started };
}
