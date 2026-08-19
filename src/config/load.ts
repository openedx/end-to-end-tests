import {
  CAPABILITIES,
  isCapability,
  MUTUALLY_EXCLUSIVE_CAPABILITIES,
  type Capability,
} from './capabilities';
import { registrableDomain, type ConfiguredOrigin } from './domain';
import { ConfigError } from './errors';
import { rawEnvSchema } from './schema';

export type Env = Record<string, string | undefined>;

export type Scheme = 'http' | 'https';

export interface AdminCredentials {
  readonly username: string;
  readonly password: string;
}

export interface BaseUrls {
  /** LMS origin, e.g. `https://lms.example.com`. */
  readonly lms: string;
  /** Micro-frontend (MFE) host origin, e.g. `https://apps.example.com`. */
  readonly apps: string;
  /** Studio/CMS origin; optional (Studio authenticates via the shared LMS session). */
  readonly studio?: string;
}

/**
 * Validated, immutable configuration derived from the environment. Everything
 * outside `src/config/` consumes this object rather than reading `process.env`.
 */
export interface AppConfig {
  readonly baseUrls: BaseUrls;
  readonly credentials: { readonly admin?: AdminCredentials };
  readonly org?: string;
  readonly courseKey?: string;
  readonly capabilities: ReadonlySet<Capability>;
  readonly allowCrossSiteOrigins: boolean;
  /** Shared scheme of all origins. */
  readonly scheme: Scheme;
  /** Shared registrable domain (eTLD+1), or `null` for an allowed cross-site setup. */
  readonly registrableDomain: string | null;
  /** Non-fatal advisories surfaced at load time (e.g. HTTP cookie policy). */
  readonly warnings: readonly string[];
}

function parseUrl(source: string, value: string, issues: string[]): URL | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push(
      `${source} must be a valid absolute URL, e.g. https://lms.example.com (got "${value}")`,
    );
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    issues.push(`${source} must use http:// or https:// (got "${url.protocol}//")`);
    return undefined;
  }
  return url;
}

function parseCapabilities(raw: string | undefined, issues: string[]): Set<Capability> {
  const enabled = new Set<Capability>();
  if (raw === undefined) {
    return enabled;
  }

  const unknown: string[] = [];
  for (const token of raw.split(',').map((t) => t.trim())) {
    if (token === '') {
      continue;
    }
    if (isCapability(token)) {
      enabled.add(token);
    } else {
      unknown.push(token);
    }
  }

  if (unknown.length > 0) {
    issues.push(
      `CAPABILITIES contains unknown ${unknown.length === 1 ? 'capability' : 'capabilities'}: ` +
        `${unknown.join(', ')}. Known capabilities: ${CAPABILITIES.join(', ')}.`,
    );
  }

  for (const group of MUTUALLY_EXCLUSIVE_CAPABILITIES) {
    const conflicting = group.filter((capability) => enabled.has(capability));
    if (conflicting.length > 1) {
      issues.push(
        `CAPABILITIES declares mutually-exclusive capabilities together: ` +
          `${conflicting.join(' and ')}. Enable at most one of them.`,
      );
    }
  }

  return enabled;
}

/**
 * Validates the multi-origin relationship required for single-sign-in auth:
 * every origin shares one scheme and one registrable parent domain, so
 * Open edX's parent-scoped cookies cover them all. See
 * docs/planning/auth-storage-state-deep-dive.md.
 */
function validateOriginRelationship(
  origins: readonly ConfiguredOrigin[],
  allowCrossSiteOrigins: boolean,
  issues: string[],
  warnings: string[],
): string | null {
  const schemes = new Set(origins.map((origin) => origin.url.protocol));
  if (schemes.size > 1) {
    issues.push(
      'All origins must share one scheme (all http or all https). Found: ' +
        `${origins.map((o) => `${o.source}=${o.url.protocol}//`).join(', ')}.`,
    );
  }

  const domains = origins.map((origin) => ({
    source: origin.source,
    host: origin.url.hostname,
    domain: registrableDomain(origin.url.hostname),
  }));

  const nonRegistrable = domains.filter((entry) => entry.domain === null);
  if (nonRegistrable.length > 0) {
    issues.push(
      'These origins are not on a registrable domain, so sub-domains cannot share ' +
        `auth cookies: ${nonRegistrable.map((d) => `${d.source}=${d.host}`).join(', ')}. ` +
        'Use a real hostname with sub-domains (e.g. lms.local.openedx.io), not ' +
        'localhost or an IP address.',
    );
    return null;
  }

  const uniqueDomains = [...new Set(domains.map((entry) => entry.domain))];
  if (uniqueDomains.length > 1) {
    if (allowCrossSiteOrigins) {
      warnings.push(
        'Origins span multiple registrable domains and ALLOW_CROSS_SITE_ORIGINS is ' +
          'set. Cross-site auth depends on SameSite=None + Secure cookies and CORS, ' +
          'and is at risk from third-party-cookie phase-out.',
      );
      return null;
    }
    issues.push(
      'Origins span multiple registrable domains, so a single sign-in cannot cover ' +
        `them all: ${domains.map((d) => `${d.source}=${d.domain ?? '(none)'}`).join(', ')}. ` +
        'Co-locate them under one parent domain, or set ALLOW_CROSS_SITE_ORIGINS=true ' +
        'if your provider handles cross-site auth.',
    );
    return null;
  }

  return uniqueDomains[0] ?? null;
}

/**
 * Parses and validates configuration from the given environment (defaults to
 * `process.env`). Pure and side-effect-free: it does not read files or log.
 *
 * @throws {ConfigError} when the environment is missing or malformed, with every
 * problem reported at once where possible.
 */
export function loadConfig(env: Env = process.env): AppConfig {
  const parsed = rawEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const key = issue.path.map(String).join('.') || '(env)';
      return issue.message.includes('received undefined')
        ? `${key} is required`
        : `${key}: ${issue.message}`;
    });
    throw new ConfigError(issues);
  }
  const raw = parsed.data;

  const issues: string[] = [];
  const warnings: string[] = [];

  const lmsUrl = parseUrl('LMS_BASE_URL', raw.LMS_BASE_URL, issues);
  const appsUrl = parseUrl('APPS_BASE_URL', raw.APPS_BASE_URL, issues);
  const studioUrl =
    raw.CMS_BASE_URL === undefined ? undefined : parseUrl('CMS_BASE_URL', raw.CMS_BASE_URL, issues);

  const capabilities = parseCapabilities(raw.CAPABILITIES, issues);

  let admin: AdminCredentials | undefined;
  const username = raw.ADMIN_USERNAME;
  const password = raw.ADMIN_PASSWORD;
  if ((username === undefined) !== (password === undefined)) {
    issues.push('ADMIN_USERNAME and ADMIN_PASSWORD must be set together (or both omitted).');
  } else if (username !== undefined && password !== undefined) {
    admin = { username, password };
  }

  const allowCrossSiteOrigins = raw.ALLOW_CROSS_SITE_ORIGINS ?? false;

  let registrable: string | null = null;
  if (lmsUrl && appsUrl) {
    const origins: ConfiguredOrigin[] = [
      { source: 'LMS_BASE_URL', url: lmsUrl },
      { source: 'APPS_BASE_URL', url: appsUrl },
    ];
    if (studioUrl) {
      origins.push({ source: 'CMS_BASE_URL', url: studioUrl });
    }
    registrable = validateOriginRelationship(origins, allowCrossSiteOrigins, issues, warnings);

    if (lmsUrl.protocol === 'http:') {
      warnings.push(
        'Origins use http://. The target must serve SameSite=Lax, non-Secure cookies ' +
          'or the session cookie will be dropped and every request will be anonymous.',
      );
    }
  }

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  if (!lmsUrl || !appsUrl) {
    // Unreachable: invalid/missing required URLs are recorded as issues above.
    throw new ConfigError(['LMS_BASE_URL and APPS_BASE_URL are required.']);
  }

  const scheme: Scheme = lmsUrl.protocol === 'https:' ? 'https' : 'http';

  return Object.freeze({
    baseUrls: Object.freeze({
      lms: lmsUrl.origin,
      apps: appsUrl.origin,
      studio: studioUrl?.origin,
    }),
    credentials: Object.freeze({ admin }),
    org: raw.ORG,
    courseKey: raw.COURSE_KEY,
    capabilities,
    allowCrossSiteOrigins,
    scheme,
    registrableDomain: registrable,
    warnings: Object.freeze([...warnings]),
  });
}
