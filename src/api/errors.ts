/**
 * Raised when an Open edX HTTP API call returns an unexpected status or body.
 *
 * Carries the request that failed and, when available, the parsed error payload
 * so callers (and failing tests) get an actionable message instead of a bare
 * "expected 200".
 */
export class ApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;
  /**
   * Whether the failure looks transient and the same call is worth retrying — a
   * gateway/HTML body under load, say, rather than a real 4xx rejection. Callers
   * that retry (e.g. `ensureCourse`) check it alongside a 5xx status.
   */
  readonly retryable: boolean;

  constructor(
    message: string,
    details: { status: number; url: string; body: string; retryable?: boolean },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = details.status;
    this.url = details.url;
    this.body = details.body;
    this.retryable = details.retryable ?? false;
  }
}

/**
 * Raised when a legacy Studio write (`POST /course/`) is answered with a redirect
 * to sign-in: the request context's Studio Django session has gone (the CI cache
 * evicts it spuriously under memory pressure), and these views authenticate by
 * that session, not the JWT. Distinct from a plain {@link ApiError} so a caller
 * that holds credentials can catch *this* case and re-authenticate before
 * retrying, rather than treating it as a generic failure.
 *
 * Not retryable: retrying the same context just bounces to sign-in again. The
 * caller must restore the session first (a fresh credential sign-in on a clean
 * context — see `authoredCourse`), then re-issue the write.
 */
export class StudioSessionExpiredError extends ApiError {
  constructor(what: string, details: { url: string; status: number }) {
    super(
      `${what} was redirected to sign-in (HTTP ${details.status}): the Studio session is gone. ` +
        'Re-authenticate the request context and retry.',
      { status: details.status, url: details.url, body: '' },
    );
    this.name = 'StudioSessionExpiredError';
  }
}
