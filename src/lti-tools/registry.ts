import { getConfig, type AppConfig } from '../config';
import { localLtiToolProvider } from './local';
import { loadLtiToolProviderPlugin } from './plugin-loader';
import { LTI_TOOL_FEATURES, featureCapability, type LtiToolProvider } from './types';

/**
 * Holds every LTI tool provider by name: the built-in ones, then the plugins
 * listed in `CUSTOM_LTI_TOOL_PROVIDER_PLUGINS`. `LTI_TOOL_PROVIDER` selects one.
 *
 * Plugins load from disk (async), once per process; lookups afterwards are
 * synchronous. The shape mirrors the mailbox registry (`src/mail/registry.ts`).
 */
export class LtiToolProviderRegistry {
  private providers = new Map<string, LtiToolProvider>();

  constructor(builtIns: readonly LtiToolProvider[] = []) {
    for (const provider of builtIns) this.register(provider);
  }

  /** Loads and registers each plugin module. */
  async registerPlugins(pluginPaths: Iterable<string>): Promise<void> {
    for (const pluginPath of pluginPaths) {
      this.register(await loadLtiToolProviderPlugin(pluginPath));
    }
  }

  register(provider: LtiToolProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`LTI tool provider "${provider.name}" is already registered`);
    }
    this.providers.set(provider.name, provider);
  }

  /**
   * Returns the provider called `name`.
   *
   * @throws {Error} when none of that name is registered — usually a typo or a
   * plugin missing from `CUSTOM_LTI_TOOL_PROVIDER_PLUGINS`.
   */
  get(name: string): LtiToolProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(
        `LTI_TOOL_PROVIDER "${name}" is not registered. Available providers: ` +
          `${this.list().join(', ') || '(none)'}. Plugin providers must be listed in ` +
          'CUSTOM_LTI_TOOL_PROVIDER_PLUGINS.',
      );
    }
    return provider;
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}

/** Loaded registries, keyed by config (the mailbox registry's pattern). */
const registries = new WeakMap<AppConfig, Promise<LtiToolProviderRegistry>>();

/**
 * The built-in providers plus the configured plugins. Idempotent per config:
 * repeated calls reuse the same registry and the same in-flight load.
 */
export function initLtiToolProviders(
  config: AppConfig = getConfig(),
): Promise<LtiToolProviderRegistry> {
  let pending = registries.get(config);
  if (!pending) {
    const registry = new LtiToolProviderRegistry([localLtiToolProvider]);
    pending = registry.registerPlugins(config.customLtiToolProviderPlugins).then(() => registry);
    registries.set(config, pending);
  }
  return pending;
}

/**
 * The provider `LTI_TOOL_PROVIDER` selects, loading the registry on first use
 * (each Playwright worker loads its own).
 *
 * @throws {Error} when a plugin cannot be loaded, or the selection is unknown.
 */
export async function resolveLtiToolProvider(
  config: AppConfig = getConfig(),
): Promise<LtiToolProvider> {
  return (await initLtiToolProviders(config)).get(config.ltiToolProvider);
}

/**
 * The feature capabilities `capabilities` declares that `provider` does not
 * support — declared features the selected tool can't deliver, which would make
 * their cases fail rather than skip. Empty when the declaration fits the tool.
 */
export function unsupportedFeatureCapabilities(
  capabilities: ReadonlySet<string>,
  provider: LtiToolProvider,
): string[] {
  return LTI_TOOL_FEATURES.filter(
    (feature) => capabilities.has(featureCapability(feature)) && !provider.features.has(feature),
  ).map(featureCapability);
}
