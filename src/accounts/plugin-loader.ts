import { importPluginModule, instantiatePluginExport } from '../config';
import type { AccountBackend } from './types';

/**
 * What a custom plugin file may export: the backend itself, a class, or a
 * factory. Each form may be the module's default export or a named
 * `accountBackend` export.
 */
type PluginExport =
  AccountBackend | (new () => AccountBackend) | (() => AccountBackend | Promise<AccountBackend>);

/** Steps a backend may override; anything else falls back to the default. */
const OPTIONAL_METHODS = ['register', 'signIn', 'signInThroughUi', 'signOutThroughUi'] as const;

function isAccountBackend(value: unknown): value is AccountBackend {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<AccountBackend>;
  if (
    typeof candidate.name !== 'string' ||
    candidate.name === '' ||
    typeof candidate.createIdentity !== 'function' ||
    typeof candidate.activate !== 'function'
  ) {
    return false;
  }
  // A non-function override would silently never run, so reject it here rather
  // than crash mid-spec.
  return OPTIONAL_METHODS.every(
    (method) => candidate[method] === undefined || typeof candidate[method] === 'function',
  );
}

/**
 * Loads a custom account backend from a plugin file path (relative paths resolve
 * against the current working directory).
 *
 * @throws {Error} when the file cannot be loaded or does not export a value that
 * satisfies {@link AccountBackend}.
 */
export async function loadAccountBackendPlugin(pluginPath: string): Promise<AccountBackend> {
  let module: Record<string, unknown>;
  try {
    module = await importPluginModule(pluginPath);
  } catch (error) {
    throw new Error(
      `Failed to load account backend plugin "${pluginPath}": ${(error as Error).message}`,
      { cause: error },
    );
  }

  const exported = (module.default ?? module.accountBackend) as PluginExport | undefined;
  if (exported === undefined) {
    throw new Error(
      `Account backend plugin "${pluginPath}" must have a default export (or an ` +
        '`accountBackend` export) that is an AccountBackend, a class implementing it, ' +
        'or a factory returning one.',
    );
  }

  const backend = await instantiatePluginExport(exported);
  if (!isAccountBackend(backend)) {
    throw new Error(
      `Account backend plugin "${pluginPath}" does not export a valid AccountBackend: ` +
        'it needs a non-empty `name` plus `createIdentity()` and `activate()` methods.',
    );
  }

  return backend;
}
