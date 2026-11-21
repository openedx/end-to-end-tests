import { importPluginModule, instantiatePluginExport } from '../config';
import { LTI_TOOL_FEATURES, type LtiToolProvider } from './types';

function isLtiToolProvider(value: unknown): value is LtiToolProvider {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<LtiToolProvider>;
  return (
    typeof candidate.name === 'string' &&
    candidate.name !== '' &&
    candidate.features instanceof Set &&
    [...candidate.features].every((f) => (LTI_TOOL_FEATURES as readonly unknown[]).includes(f)) &&
    typeof candidate.openSession === 'function'
  );
}

/**
 * Loads an LTI tool provider from a plugin file path (relative paths resolve
 * against the working directory).
 *
 * The provider is the module's named `ltiToolProvider` export when it has one,
 * and its default export otherwise. Either may be the provider itself, a class,
 * or a factory; a factory or constructor is where a plugin validates its own
 * settings, so a bad one fails the run in global setup rather than mid-spec.
 *
 * @throws {Error} when the file cannot be loaded or does not export a value that
 * satisfies {@link LtiToolProvider}.
 */
export async function loadLtiToolProviderPlugin(pluginPath: string): Promise<LtiToolProvider> {
  let module: Record<string, unknown>;
  try {
    module = await importPluginModule(pluginPath);
  } catch (error) {
    throw new Error(
      `Failed to load LTI tool provider plugin "${pluginPath}": ${(error as Error).message}`,
      { cause: error },
    );
  }

  const exported = module.ltiToolProvider ?? module.default;
  if (exported === undefined) {
    throw new Error(
      `LTI tool provider plugin "${pluginPath}" must have an \`ltiToolProvider\` export (or a ` +
        'default export) that is an LtiToolProvider, a class implementing it, or a factory ' +
        'returning one.',
    );
  }

  const provider = await instantiatePluginExport(exported);
  if (!isLtiToolProvider(provider)) {
    throw new Error(
      `LTI tool provider plugin "${pluginPath}" does not export a valid LtiToolProvider: it ` +
        `needs a non-empty \`name\`, a \`features\` Set of (${LTI_TOOL_FEATURES.join(', ')}) and ` +
        'an `openSession()` method.',
    );
  }
  return provider;
}
