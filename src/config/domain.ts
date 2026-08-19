import { getDomain } from 'tldts';

/**
 * A configured origin, tagged with the environment variable it came from so
 * validation messages can point at the exact source of a problem.
 */
export interface ConfiguredOrigin {
  /** The environment variable name, e.g. `LMS_BASE_URL`. */
  readonly source: string;
  readonly url: URL;
}

/**
 * The registrable domain (eTLD+1) for a hostname, or `null` when there is none.
 *
 * Uses the public suffix list, so multi-part suffixes (`example.co.uk`) resolve
 * correctly and non-registrable hosts — bare `localhost`, IP literals — return
 * `null`. Two hosts sharing a registrable domain are same-site, which is what
 * lets a single Open edX sign-in cover every sub-domain origin (see
 * docs/planning/auth-storage-state-deep-dive.md).
 */
export function registrableDomain(hostname: string): string | null {
  return getDomain(hostname);
}
