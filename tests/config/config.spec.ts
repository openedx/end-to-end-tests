import { test, expect } from '@playwright/test';

import {
  ENV_KEYS,
  loadConfig,
  getConfigIfValid,
  resetConfigCache,
  ConfigError,
  type Env,
} from '../../src/config';

/**
 * Pure unit tests for the typed configuration layer. These exercise validation
 * logic only (no browser, no network), so they run in the node-only `unit`
 * project.
 */

const validEnv = (overrides: Env = {}): Env => ({
  LMS_BASE_URL: 'http://local.openedx.io',
  APPS_BASE_URL: 'http://apps.local.openedx.io',
  ...overrides,
});

/** Collects the individual issue messages from a thrown ConfigError. */
function issuesFrom(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) {
      return [...error.issues];
    }
    throw error;
  }
  throw new Error('expected loadConfig to throw a ConfigError');
}

test.describe('loadConfig — valid environments', { tag: '@unit' }, () => {
  test('accepts a minimal same-site HTTP environment', () => {
    const config = loadConfig(validEnv());

    expect(config.baseUrls.lms).toBe('http://local.openedx.io');
    expect(config.baseUrls.apps).toBe('http://apps.local.openedx.io');
    expect(config.baseUrls.studio).toBeUndefined();
    expect(config.scheme).toBe('http');
    expect(config.registrableDomain).toBe('openedx.io');
    expect(config.allowCrossSiteOrigins).toBe(false);
    // Default-on capabilities (stock surfaces) need no declaration.
    expect([...config.capabilities]).toEqual(['mfe-authn']);
  });

  test('accepts an HTTPS environment including Studio', () => {
    const config = loadConfig(
      validEnv({
        LMS_BASE_URL: 'https://lms.example.com',
        APPS_BASE_URL: 'https://apps.example.com',
        CMS_BASE_URL: 'https://studio.example.com',
      }),
    );

    expect(config.scheme).toBe('https');
    expect(config.baseUrls.studio).toBe('https://studio.example.com');
    expect(config.registrableDomain).toBe('example.com');
    expect(config.warnings).toEqual([]);
  });

  test('normalizes URLs with paths/ports down to their origin', () => {
    const config = loadConfig(
      validEnv({ APPS_BASE_URL: 'http://apps.local.openedx.io:1996/learning' }),
    );

    expect(config.baseUrls.apps).toBe('http://apps.local.openedx.io:1996');
  });

  test('the returned config is frozen', () => {
    const config = loadConfig(validEnv());
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.baseUrls)).toBe(true);
  });

  test('warns (but does not fail) on HTTP origins about cookie policy', () => {
    const config = loadConfig(validEnv());
    expect(config.warnings.join('\n')).toContain('SameSite=Lax');
  });
});

test.describe('loadConfig — required variables', { tag: '@unit' }, () => {
  test('fails when LMS_BASE_URL is missing', () => {
    expect(() => loadConfig(validEnv({ LMS_BASE_URL: undefined }))).toThrow(ConfigError);
    expect(issuesFrom(() => loadConfig(validEnv({ LMS_BASE_URL: undefined })))).toContain(
      'LMS_BASE_URL is required',
    );
  });

  test('fails when APPS_BASE_URL is missing', () => {
    expect(issuesFrom(() => loadConfig(validEnv({ APPS_BASE_URL: undefined })))).toContain(
      'APPS_BASE_URL is required',
    );
  });

  test('treats a blank value as missing', () => {
    expect(issuesFrom(() => loadConfig(validEnv({ LMS_BASE_URL: '   ' })))).toContain(
      'LMS_BASE_URL is required',
    );
  });
});

test.describe('loadConfig — URL and scheme validation', { tag: '@unit' }, () => {
  test('rejects a malformed URL', () => {
    const issues = issuesFrom(() => loadConfig(validEnv({ LMS_BASE_URL: 'not-a-url' })));
    expect(issues.join('\n')).toContain('LMS_BASE_URL must be a valid absolute URL');
  });

  test('rejects a non-http(s) scheme', () => {
    const issues = issuesFrom(() =>
      loadConfig(validEnv({ LMS_BASE_URL: 'ftp://local.openedx.io' })),
    );
    expect(issues.join('\n')).toContain('must use http:// or https://');
  });

  test('rejects mixed schemes across origins', () => {
    const issues = issuesFrom(() =>
      loadConfig(
        validEnv({
          LMS_BASE_URL: 'https://local.openedx.io',
          APPS_BASE_URL: 'http://apps.local.openedx.io',
        }),
      ),
    );
    expect(issues.join('\n')).toContain('must share one scheme');
  });
});

test.describe('loadConfig — shared parent domain', { tag: '@unit' }, () => {
  test('rejects localhost (no registrable domain)', () => {
    const issues = issuesFrom(() =>
      loadConfig(
        validEnv({
          LMS_BASE_URL: 'http://localhost:18000',
          APPS_BASE_URL: 'http://localhost:1996',
        }),
      ),
    );
    expect(issues.join('\n')).toContain('not on a registrable domain');
  });

  test('rejects origins on different registrable domains by default', () => {
    const issues = issuesFrom(() =>
      loadConfig(
        validEnv({
          LMS_BASE_URL: 'https://lms.openedx.io',
          APPS_BASE_URL: 'https://apps.example.com',
        }),
      ),
    );
    expect(issues.join('\n')).toContain('span multiple registrable domains');
  });

  test('allows cross-site origins when explicitly opted in, with a warning', () => {
    const config = loadConfig(
      validEnv({
        LMS_BASE_URL: 'https://lms.openedx.io',
        APPS_BASE_URL: 'https://apps.example.com',
        ALLOW_CROSS_SITE_ORIGINS: 'true',
      }),
    );

    expect(config.allowCrossSiteOrigins).toBe(true);
    expect(config.registrableDomain).toBeNull();
    expect(config.warnings.join('\n')).toContain('multiple registrable domains');
  });

  test('includes Studio in the shared-domain check', () => {
    const issues = issuesFrom(() =>
      loadConfig(validEnv({ CMS_BASE_URL: 'https://studio.example.com' })),
    );
    expect(issues.join('\n')).toContain('span multiple registrable domains');
  });
});

test.describe('loadConfig — capabilities', { tag: '@unit' }, () => {
  test('parses a declared capability list', () => {
    const config = loadConfig(validEnv({ CAPABILITIES: 'discussions, notes' }));
    expect([...config.capabilities].sort()).toEqual(['discussions', 'mfe-authn', 'notes']);
  });

  test('turns off a default-on capability with the "-" prefix', () => {
    const config = loadConfig(validEnv({ CAPABILITIES: 'discussions,-mfe-authn' }));

    expect([...config.capabilities]).toEqual(['discussions']);
  });

  test('rejects opting out of a capability that is off unless declared', () => {
    const issues = issuesFrom(() => loadConfig(validEnv({ CAPABILITIES: '-discussions' })));

    expect(issues.join('\n')).toContain('nothing to turn off');
  });

  test('rejects declaring and opting out of the same capability', () => {
    const issues = issuesFrom(() => loadConfig(validEnv({ CAPABILITIES: 'mfe-authn,-mfe-authn' })));

    expect(issues.join('\n')).toContain('both declares and opts out of "mfe-authn"');
  });

  test('rejects an unknown capability', () => {
    const issues = issuesFrom(() => loadConfig(validEnv({ CAPABILITIES: 'discussions,teleport' })));
    expect(issues.join('\n')).toContain('unknown capability: teleport');
  });

  test('rejects mutually-exclusive capabilities declared together', () => {
    const issues = issuesFrom(() => loadConfig(validEnv({ CAPABILITIES: 'badges,credly-badges' })));
    expect(issues.join('\n')).toContain('mutually-exclusive');
  });
});

test.describe('loadConfig — account backend', { tag: '@unit' }, () => {
  test('defaults to the automatic backend', () => {
    expect(loadConfig(validEnv()).accountBackend).toBe('automatic');
  });

  test('accepts a known backend', () => {
    expect(loadConfig(validEnv({ ACCOUNT_BACKEND: 'manual' })).accountBackend).toBe('manual');
  });

  test('rejects an unknown backend', () => {
    const issues = issuesFrom(() => loadConfig(validEnv({ ACCOUNT_BACKEND: 'telepathy' })));
    expect(issues.join('\n')).toContain('ACCOUNT_BACKEND "telepathy" is not recognized');
  });
});

test.describe('loadConfig — credentials', { tag: '@unit' }, () => {
  test('accepts a paired admin username and password', () => {
    const config = loadConfig(validEnv({ ADMIN_USERNAME: 'edx', ADMIN_PASSWORD: 'secret' }));
    expect(config.credentials.admin).toEqual({ username: 'edx', password: 'secret' });
  });

  test('rejects a username without a password', () => {
    const issues = issuesFrom(() => loadConfig(validEnv({ ADMIN_USERNAME: 'edx' })));
    expect(issues.join('\n')).toContain('must be set together');
  });
});

test.describe('loadConfig — boolean coercion', { tag: '@unit' }, () => {
  for (const value of ['true', '1', 'yes', 'YES']) {
    test(`treats ALLOW_CROSS_SITE_ORIGINS="${value}" as true`, () => {
      const config = loadConfig(
        validEnv({
          LMS_BASE_URL: 'https://lms.openedx.io',
          APPS_BASE_URL: 'https://apps.example.com',
          ALLOW_CROSS_SITE_ORIGINS: value,
        }),
      );
      expect(config.allowCrossSiteOrigins).toBe(true);
    });
  }

  test('rejects an unrecognized boolean value', () => {
    expect(() => loadConfig(validEnv({ ALLOW_CROSS_SITE_ORIGINS: 'maybe' }))).toThrow(ConfigError);
  });
});

/**
 * `getConfigIfValid` is what keeps a fresh clone with no `.env` able to run this
 * very project: `playwright.config.ts` and global setup call it instead of
 * `getConfig()`, so an invalid environment is reported rather than thrown.
 *
 * These tests drive `process.env` directly and reset the memoized config around
 * each one. A real value always wins over `.env`, but an *absent* one does not:
 * `getConfig` loads `.env` into whatever is unset, so on a configured machine a
 * stray `CMS_BASE_URL` or `ACCOUNT_BACKEND` would join the values pinned here and
 * change the outcome (a second registrable domain, an unknown backend, …). Every
 * variable the schema reads is therefore set — to a blank, which the schema
 * treats as absent — before the ones a test cares about are given real values.
 */
test.describe('getConfigIfValid', { tag: '@unit' }, () => {
  let saved: Record<string, string | undefined> = {};
  let warnings: string[] = [];
  const realWarn = console.warn;

  test.beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) {
      process.env[key] = '';
    }
    warnings = [];
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
    resetConfigCache();
  });

  test.afterEach(() => {
    console.warn = realWarn;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetConfigCache();
  });

  test('returns the configuration when the environment is valid', () => {
    process.env.LMS_BASE_URL = 'http://local.openedx.io';
    process.env.APPS_BASE_URL = 'http://apps.local.openedx.io';
    process.env.CAPABILITIES = 'discussions';

    expect(getConfigIfValid('spec')?.baseUrls.lms).toBe('http://local.openedx.io');
  });

  test('reports an invalid environment once instead of throwing', () => {
    process.env.LMS_BASE_URL = 'not-a-url';
    process.env.APPS_BASE_URL = 'http://apps.local.openedx.io';
    process.env.CAPABILITIES = 'discussions';

    expect(getConfigIfValid('spec')).toBeUndefined();
    expect(getConfigIfValid('spec')).toBeUndefined();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('[spec]');
    expect(warnings[0]).toContain('LMS_BASE_URL');
    // Names the escape hatch the message exists for.
    expect(warnings[0]).toContain('unit');
  });
});
