import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AccountBackend } from './types';

const requireFrom = createRequire(__filename);

/**
 * What a custom plugin file may export: the backend itself, a class, or a
 * factory. Each form may be the module's default export or a named
 * `accountBackend` export.
 */
type PluginExport =
  AccountBackend | (new () => AccountBackend) | (() => AccountBackend | Promise<AccountBackend>);

/** Auth flows a backend may override; anything else falls back to the default. */
const OPTIONAL_METHODS = ['signIn', 'signInThroughUi', 'signOutThroughUi'] as const;

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
 * Loads a plugin module. Playwright registers a `require` hook that transpiles
 * TypeScript, so `require` is tried first and works for both `.ts` and `.js`
 * plugins inside the runner; `import()` is the fallback for contexts (plain
 * Node, ESM-only plugins) where it does not.
 */
async function importPluginModule(absolutePath: string): Promise<Record<string, unknown>> {
  try {
    return requireFrom(absolutePath) as Record<string, unknown>;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'ERR_REQUIRE_ESM' && code !== 'ERR_REQUIRE_ASYNC_MODULE') {
      throw error;
    }
    return (await import(pathToFileURL(absolutePath).href)) as Record<string, unknown>;
  }
}

async function instantiate(exported: PluginExport): Promise<unknown> {
  if (typeof exported !== 'function') {
    return exported;
  }
  try {
    return await (exported as () => unknown)();
  } catch (error) {
    if (error instanceof TypeError && /without 'new'|cannot be invoked/i.test(error.message)) {
      return new (exported as new () => AccountBackend)();
    }
    throw error;
  }
}

/**
 * Loads a custom account backend from a plugin file path (relative paths resolve
 * against the current working directory).
 *
 * @throws {Error} when the file cannot be loaded or does not export a value that
 * satisfies {@link AccountBackend}.
 */
export async function loadAccountBackendPlugin(pluginPath: string): Promise<AccountBackend> {
  const absolutePath = path.resolve(pluginPath);

  let module: Record<string, unknown>;
  try {
    module = await importPluginModule(absolutePath);
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

  const backend = await instantiate(exported);
  if (!isAccountBackend(backend)) {
    throw new Error(
      `Account backend plugin "${pluginPath}" does not export a valid AccountBackend: ` +
        'it needs a non-empty `name` plus `createIdentity()` and `activate()` methods.',
    );
  }

  return backend;
}
