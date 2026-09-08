import { test, expect } from '@playwright/test';

import { AccountPluginRegistry, loadAccountBackendPlugin } from '../../src/accounts';
import { loadConfig, type Env } from '../../src/config';

/**
 * Pure unit tests for plugin loading and backend selection: no browser and no
 * network, so they run in the node-only `unit` project. The fixture plugins in
 * `fixtures/` cover each supported export shape.
 */

const FIXTURES = 'tests/accounts/fixtures';

const configWith = (overrides: Env = {}) =>
  loadConfig({
    LMS_BASE_URL: 'http://local.openedx.io',
    APPS_BASE_URL: 'http://apps.local.openedx.io',
    ...overrides,
  });

test.describe('loadAccountBackendPlugin', { tag: '@unit' }, () => {
  test('loads a class default export', async () => {
    const backend = await loadAccountBackendPlugin(`${FIXTURES}/class-backend.plugin.ts`);
    expect(backend.name).toBe('class-fixture');
  });

  test('loads a factory default export', async () => {
    const backend = await loadAccountBackendPlugin(`${FIXTURES}/factory-backend.plugin.ts`);
    expect(backend.name).toBe('factory-fixture');
  });

  test('loads a plain object from the accountBackend export', async () => {
    const backend = await loadAccountBackendPlugin(`${FIXTURES}/object-backend.plugin.ts`);
    expect(backend.name).toBe('object-fixture');
  });

  test('rejects an export that is not an AccountBackend', async () => {
    await expect(loadAccountBackendPlugin(`${FIXTURES}/invalid-backend.plugin.ts`)).rejects.toThrow(
      /does not export a valid AccountBackend/,
    );
  });

  test('reports a module that cannot be loaded', async () => {
    await expect(loadAccountBackendPlugin(`${FIXTURES}/missing.plugin.ts`)).rejects.toThrow(
      /Failed to load account backend plugin/,
    );
  });
});

test.describe('AccountPluginRegistry', { tag: '@unit' }, () => {
  test('registers the built-in backends', async () => {
    const registry = new AccountPluginRegistry();
    await registry.registerAll(configWith());

    expect(registry.list()).toEqual(['automatic', 'manual']);
    expect(registry.get(configWith()).name).toBe('automatic');
  });

  test('registers a configured custom plugin and selects it by name', async () => {
    const env = {
      CUSTOM_ACCOUNT_BACKEND_PLUGINS: `${FIXTURES}/class-backend.plugin.ts`,
      ACCOUNT_BACKEND: 'class-fixture',
    };
    const registry = new AccountPluginRegistry();
    await registry.registerAll(configWith(env));

    expect(registry.list()).toContain('class-fixture');
    expect(registry.get(configWith(env)).name).toBe('class-fixture');
  });

  test('loads several plugins from one comma-separated list', async () => {
    const env = {
      CUSTOM_ACCOUNT_BACKEND_PLUGINS: `${FIXTURES}/class-backend.plugin.ts, ${FIXTURES}/object-backend.plugin.ts`,
    };
    const registry = new AccountPluginRegistry();
    await registry.registerAll(configWith(env));

    expect(registry.list()).toEqual(expect.arrayContaining(['class-fixture', 'object-fixture']));
  });

  test('rejects a plugin whose name shadows a registered backend', () => {
    const registry = new AccountPluginRegistry();
    registry.register({
      name: 'duplicate',
      createIdentity: () => Promise.reject(new Error('unused')),
      activate: () => Promise.resolve(),
    });

    expect(() =>
      registry.register({
        name: 'duplicate',
        createIdentity: () => Promise.reject(new Error('unused')),
        activate: () => Promise.resolve(),
      }),
    ).toThrow(/already registered/);
  });

  test('explains an ACCOUNT_BACKEND that no plugin provides', async () => {
    // A configured plugin list defers name validation to the registry, so this
    // reaches lookup rather than failing in loadConfig.
    const env = {
      CUSTOM_ACCOUNT_BACKEND_PLUGINS: `${FIXTURES}/class-backend.plugin.ts`,
      ACCOUNT_BACKEND: 'not-a-backend',
    };
    const registry = new AccountPluginRegistry();
    await registry.registerAll(configWith(env));

    expect(() => registry.get(configWith(env))).toThrow(
      /ACCOUNT_BACKEND "not-a-backend" is not registered/,
    );
  });
});
