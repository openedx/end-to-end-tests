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

  constructor(message: string, details: { status: number; url: string; body: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = details.status;
    this.url = details.url;
    this.body = details.body;
  }
}
