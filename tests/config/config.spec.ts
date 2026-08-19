import { test, expect } from '@playwright/test';

import { loadConfig, ConfigError, type Env } from '../../src/config';

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

test.describe('loadConfig — valid environments @unit', () => {
  test('accepts a minimal same-site HTTP environment', () => {
    const config = loadConfig(validEnv());

    expect(config.baseUrls.lms).toBe('http://local.openedx.io');
    expect(config.baseUrls.apps).toBe('http://apps.local.openedx.io');
    expect(config.baseUrls.studio).toBeUndefined();
    expect(config.scheme).toBe('http');
    expect(config.registrableDomain).toBe('openedx.io');
    expect(config.allowCrossSiteOrigins).toBe(false);
    expect([...config.capabilities]).toEqual([]);
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

test.describe('loadConfig — required variables @unit', () => {
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

test.describe('loadConfig — URL and scheme validation @unit', () => {
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

test.describe('loadConfig — shared parent domain @unit', () => {
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

test.describe('loadConfig — capabilities @unit', () => {
  test('parses a declared capability list', () => {
    const config = loadConfig(validEnv({ CAPABILITIES: 'discussions, certificates' }));
    expect([...config.capabilities].sort()).toEqual(['certificates', 'discussions']);
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

test.describe('loadConfig — credentials @unit', () => {
  test('accepts a paired admin username and password', () => {
    const config = loadConfig(validEnv({ ADMIN_USERNAME: 'edx', ADMIN_PASSWORD: 'secret' }));
    expect(config.credentials.admin).toEqual({ username: 'edx', password: 'secret' });
  });

  test('rejects a username without a password', () => {
    const issues = issuesFrom(() => loadConfig(validEnv({ ADMIN_USERNAME: 'edx' })));
    expect(issues.join('\n')).toContain('must be set together');
  });
});

test.describe('loadConfig — boolean coercion @unit', () => {
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
