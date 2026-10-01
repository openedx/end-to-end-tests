import { test, expect } from '@playwright/test';

import { loadConfig, type Env } from '../../src/config';
import { MailProviderRegistry, loadMailProviderPlugin, messageLinks } from '../../src/mail';

/**
 * Pure unit tests for the mailbox layer's plugin loading, provider selection and
 * link extraction: no browser, no network, no mailbox.
 */

const FIXTURES = 'tests/mail/fixtures';

const configWith = (overrides: Env = {}) =>
  loadConfig({
    LMS_BASE_URL: 'http://local.openedx.io',
    APPS_BASE_URL: 'http://apps.local.openedx.io',
    ...overrides,
  });

test.describe('loadMailProviderPlugin', { tag: '@unit' }, () => {
  test('loads a class default export', async () => {
    const provider = await loadMailProviderPlugin(`${FIXTURES}/class-provider.plugin.ts`);
    expect(provider.name).toBe('class-fixture');
  });

  test('prefers the mailProvider export over an account backend default export', async () => {
    const provider = await loadMailProviderPlugin(`${FIXTURES}/beside-backend.plugin.ts`);
    expect(provider.name).toBe('beside-fixture');
  });

  test('loads both shipped providers', async () => {
    process.env.MAILPIT_BASE_URL = 'http://localhost:8025';
    try {
      expect((await loadMailProviderPlugin('./plugins/mailpit.plugin.ts')).name).toBe('mailpit');
      expect((await loadMailProviderPlugin('./plugins/openinbox.plugin.ts')).name).toBe(
        'openinbox',
      );
    } finally {
      delete process.env.MAILPIT_BASE_URL;
    }
  });

  test("fails at load when a provider's own settings are missing", async () => {
    delete process.env.MAILPIT_BASE_URL;
    await expect(loadMailProviderPlugin('./plugins/mailpit.plugin.ts')).rejects.toThrow(
      /MAILPIT_BASE_URL is required/,
    );
  });

  test('rejects an export that is not a MailProvider', async () => {
    await expect(loadMailProviderPlugin(`${FIXTURES}/invalid-provider.plugin.ts`)).rejects.toThrow(
      /does not export a valid MailProvider/,
    );
  });

  test('reports a module that cannot be loaded', async () => {
    await expect(loadMailProviderPlugin(`${FIXTURES}/missing.plugin.ts`)).rejects.toThrow(
      /Failed to load mailbox provider plugin/,
    );
  });
});

test.describe('MailProviderRegistry', { tag: '@unit' }, () => {
  test('registers a configured plugin and selects it by name', async () => {
    const env = {
      CUSTOM_MAIL_PROVIDER_PLUGINS: `${FIXTURES}/class-provider.plugin.ts`,
      MAIL_PROVIDER: 'class-fixture',
    };
    const registry = new MailProviderRegistry();
    await registry.registerAll(configWith(env));

    expect(registry.list()).toEqual(['class-fixture']);
    expect(registry.get(configWith(env)).name).toBe('class-fixture');
  });

  test('explains a MAIL_PROVIDER that no plugin provides', async () => {
    const env = {
      CUSTOM_MAIL_PROVIDER_PLUGINS: `${FIXTURES}/class-provider.plugin.ts`,
      MAIL_PROVIDER: 'not-a-provider',
    };
    const registry = new MailProviderRegistry();
    await registry.registerAll(configWith(env));

    expect(() => registry.get(configWith(env))).toThrow(
      /MAIL_PROVIDER "not-a-provider" is not registered\. Available providers: class-fixture/,
    );
  });

  test('explains that no provider is configured', () => {
    expect(() => new MailProviderRegistry().get(configWith())).toThrow(
      /No mailbox provider is configured/,
    );
  });

  test('rejects a provider whose name shadows a registered one', () => {
    const registry = new MailProviderRegistry();
    const provider = { name: 'duplicate', createInbox: () => Promise.reject(new Error('unused')) };
    registry.register(provider);

    expect(() => registry.register({ ...provider })).toThrow(/already registered/);
  });
});

test.describe('messageLinks', { tag: '@unit' }, () => {
  const message = (text: string, html: string) => ({ id: 'm1', subject: 's', text, html });

  test('takes the HTML hrefs first, un-escaped, then new URLs from the text', () => {
    const links = messageLinks(
      message(
        'See http://apps.local.openedx.io/discussions/c/posts/4 or http://x.test/extra.',
        '<a href="http://apps.local.openedx.io/discussions/c/posts/4">post</a>' +
          '<a href="http://local.openedx.io/api/notifications/preferences/update/abc/?a=1&amp;b=2">x</a>',
      ),
    );

    expect(links).toEqual([
      'http://apps.local.openedx.io/discussions/c/posts/4',
      'http://local.openedx.io/api/notifications/preferences/update/abc/?a=1&b=2',
      'http://x.test/extra.',
    ]);
  });

  test('ignores hrefs that are not absolute http(s) links', () => {
    expect(
      messageLinks(message('', '<a href="mailto:a@b.test">m</a><a href="#top">t</a>')),
    ).toEqual([]);
  });
});
