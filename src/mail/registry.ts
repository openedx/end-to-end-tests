import { getConfig, type AppConfig } from '../config';
import { loadMailProviderPlugin } from './plugin-loader';
import type { MailProvider } from './types';

/**
 * Holds every configured mailbox provider by name — the plugins listed in
 * `CUSTOM_MAIL_PROVIDER_PLUGINS`; there are no built-ins. `MAIL_PROVIDER`
 * selects one of them.
 *
 * Registration is async (plugins are loaded from disk), so it happens once in
 * global setup; lookups afterwards are synchronous. The shape mirrors the
 * account-backend registry (`src/accounts/registry.ts`).
 */
export class MailProviderRegistry {
  private providers = new Map<string, MailProvider>();

  /** Registers every configured provider plugin. */
  async registerAll(config: AppConfig = getConfig()): Promise<void> {
    for (const pluginPath of config.customMailProviderPlugins) {
      this.register(await loadMailProviderPlugin(pluginPath));
    }
  }

  register(provider: MailProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`Mailbox provider "${provider.name}" is already registered`);
    }
    this.providers.set(provider.name, provider);
  }

  /**
   * Returns the provider named by `MAIL_PROVIDER`.
   *
   * @throws {Error} when none is configured, or none of that name is loaded —
   * usually a typo or a plugin missing from `CUSTOM_MAIL_PROVIDER_PLUGINS`.
   */
  get(config: AppConfig = getConfig()): MailProvider {
    const name = config.mailProvider;
    if (name === undefined) {
      throw new Error(
        'No mailbox provider is configured. Set MAIL_PROVIDER and CUSTOM_MAIL_PROVIDER_PLUGINS ' +
          '(and declare the email-inbox capability) to read e-mail.',
      );
    }
    const provider = this.providers.get(name);
    if (!provider) {
      const available = this.list();
      throw new Error(
        `MAIL_PROVIDER "${name}" is not registered. ` +
          (available.length === 0
            ? 'No mailbox provider plugins are loaded. '
            : `Available providers: ${available.join(', ')}. `) +
          'Providers must be listed in CUSTOM_MAIL_PROVIDER_PLUGINS.',
      );
    }
    return provider;
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}

/** Loaded registries, keyed by config — see `initAccountBackends` for why. */
const registries = new WeakMap<AppConfig, Promise<MailProviderRegistry>>();

/**
 * Loads the configured provider plugins. Idempotent per config: repeated calls
 * reuse the same registry and the same in-flight load.
 */
export function initMailProviders(config: AppConfig = getConfig()): Promise<MailProviderRegistry> {
  let pending = registries.get(config);
  if (!pending) {
    const registry = new MailProviderRegistry();
    pending = registry.registerAll(config).then(() => registry);
    registries.set(config, pending);
  }
  return pending;
}

/**
 * Returns the provider selected by `MAIL_PROVIDER`, loading the registry on
 * first use (each Playwright worker loads its own).
 *
 * @throws {Error} when a plugin cannot be loaded, or the selection is unset or
 * unknown.
 */
export async function resolveMailProvider(config: AppConfig = getConfig()): Promise<MailProvider> {
  return (await initMailProviders(config)).get(config);
}
