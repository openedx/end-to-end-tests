import { test, expect } from '@playwright/test';

import {
  LtiToolProviderRegistry,
  loadLtiToolProviderPlugin,
  unsupportedFeatureCapabilities,
  type LtiToolFeature,
  type LtiToolProvider,
} from '../../src/lti-tools';

/**
 * Pure unit tests for the LTI tool provider layer's plugin loading and
 * selection: no browser, no network, no tool.
 */

const FIXTURES = 'tests/lti-tools/fixtures';

const fake = (name: string, features: LtiToolFeature[] = []): LtiToolProvider => ({
  name,
  features: new Set(features),
  openSession: () => Promise.reject(new Error('unused')),
});

test.describe('loadLtiToolProviderPlugin', { tag: '@unit' }, () => {
  test('loads a class default export', async () => {
    const provider = await loadLtiToolProviderPlugin(`${FIXTURES}/class-provider.plugin.ts`);
    expect(provider.name).toBe('class-fixture');
    expect([...provider.features]).toEqual(['claims', 'inline']);
  });

  test('prefers the ltiToolProvider export over a default export', async () => {
    const provider = await loadLtiToolProviderPlugin(`${FIXTURES}/named-provider.plugin.ts`);
    expect(provider.name).toBe('named-fixture');
  });

  test('rejects an export that is not an LtiToolProvider', async () => {
    await expect(
      loadLtiToolProviderPlugin(`${FIXTURES}/invalid-provider.plugin.ts`),
    ).rejects.toThrow(/does not export a valid LtiToolProvider/);
  });

  test('reports a module that cannot be loaded', async () => {
    await expect(loadLtiToolProviderPlugin(`${FIXTURES}/missing.plugin.ts`)).rejects.toThrow(
      /Failed to load LTI tool provider plugin/,
    );
  });
});

test.describe('LtiToolProviderRegistry', { tag: '@unit' }, () => {
  test('holds built-ins and plugins, and selects one by name', async () => {
    const registry = new LtiToolProviderRegistry([fake('local')]);
    await registry.registerPlugins([`${FIXTURES}/class-provider.plugin.ts`]);
    expect(registry.list()).toEqual(['local', 'class-fixture']);
    expect(registry.get('class-fixture').name).toBe('class-fixture');
  });

  test('names what is available when the selection is unknown', () => {
    const registry = new LtiToolProviderRegistry([fake('local')]);
    expect(() => registry.get('saltire')).toThrow(
      /LTI_TOOL_PROVIDER "saltire" is not registered\. Available providers: local\./,
    );
  });

  test('refuses two providers of the same name', () => {
    const registry = new LtiToolProviderRegistry([fake('local')]);
    expect(() => registry.register(fake('local'))).toThrow(/already registered/);
  });
});

test.describe('unsupportedFeatureCapabilities', { tag: '@unit' }, () => {
  test('names the declared feature capabilities the tool lacks', () => {
    const tool = fake('limited', ['claims', 'services']);
    const declared = new Set(['lti', 'lti-tool', 'lti-tool-claims', 'lti-tool-deep-linking']);
    expect(unsupportedFeatureCapabilities(declared, tool)).toEqual(['lti-tool-deep-linking']);
  });

  test('is empty when every declared feature is supported', () => {
    const tool = fake('full', ['claims', 'services', 'deep-linking', 'inline']);
    const declared = new Set(['lti-tool', 'lti-tool-inline', 'lti-tool-services']);
    expect(unsupportedFeatureCapabilities(declared, tool)).toEqual([]);
  });
});
