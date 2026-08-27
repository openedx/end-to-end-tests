import { getConfig, type AppConfig } from '../config';
import { AutomaticLoginBackend } from './automatic-backend';
import { ManualActivationBackend } from './manual-backend';
import { loadAccountBackendPlugin } from './plugin-loader';
import type { AccountBackend } from './types';

/**
 * Holds every available account backend by name: the built-ins plus any custom
 * plugins listed in `CUSTOM_ACCOUNT_BACKEND_PLUGINS`. `ACCOUNT_BACKEND` selects
 * one of them at provisioning time.
 *
 * Registration is async (plugins are loaded from disk), so it happens once in
 * global setup; lookups afterwards are synchronous.
 */
export class AccountPluginRegistry {
  private plugins = new Map<string, AccountBackend>();

  /** Registers the built-in backends and every configured custom plugin. */
  async registerAll(config: AppConfig = getConfig()): Promise<void> {
    this.register(new AutomaticLoginBackend());
    this.register(new ManualActivationBackend());

    for (const pluginPath of config.customAccountBackendPlugins) {
      this.register(await loadAccountBackendPlugin(pluginPath));
    }
  }

  register(plugin: AccountBackend): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Account backend "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Returns the backend named by `ACCOUNT_BACKEND`.
   *
   * @throws {Error} when no backend of that name is registered — usually a typo
   * or a plugin missing from `CUSTOM_ACCOUNT_BACKEND_PLUGINS`.
   */
  get(config: AppConfig = getConfig()): AccountBackend {
    const name = config.accountBackend;
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(
        `ACCOUNT_BACKEND "${name}" is not registered. Available backends: ` +
          `${this.list().join(', ')}. Custom backends must be listed in ` +
          'CUSTOM_ACCOUNT_BACKEND_PLUGINS.',
      );
    }
    return plugin;
  }

  list(): string[] {
    return Array.from(this.plugins.keys());
  }
}

let registry: AccountPluginRegistry | undefined;

/**
 * Loads the built-in and configured custom backends into the process-wide
 * registry. Idempotent: repeated calls reuse the already-populated registry, so
 * both global setup and a worker's first lookup can call it safely.
 */
export async function initAccountBackends(
  config: AppConfig = getConfig(),
): Promise<AccountPluginRegistry> {
  if (!registry) {
    const pending = new AccountPluginRegistry();
    await pending.registerAll(config);
    registry = pending;
  }
  return registry;
}

/** Clears the process-wide registry. Intended for tests. */
export function resetAccountBackends(): void {
  registry = undefined;
}

/**
 * Returns the account backend selected by configuration (`ACCOUNT_BACKEND`),
 * loading the registry on first use.
 *
 * Prefer this over {@link getAccountBackend}: Playwright runs global setup in the
 * main process but specs in separate worker processes, so each worker has to load
 * its own registry.
 *
 * @throws {Error} when a configured plugin cannot be loaded, or when the
 * configured name is not registered.
 */
export async function resolveAccountBackend(
  config: AppConfig = getConfig(),
): Promise<AccountBackend> {
  return (await initAccountBackends(config)).get(config);
}

/**
 * Synchronous variant of {@link resolveAccountBackend}, for callers that run
 * after the registry is loaded in the same process.
 *
 * @throws {Error} when {@link initAccountBackends} has not run in this process,
 * or when the configured name is not registered.
 */
export function getAccountBackend(config: AppConfig = getConfig()): AccountBackend {
  if (!registry) {
    throw new Error(
      'Account backends have not been loaded in this process. Call ' +
        'initAccountBackends() or resolveAccountBackend() first.',
    );
  }
  return registry.get(config);
}
