import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const requireFrom = createRequire(__filename);

/**
 * Loads a plugin module from a configured path (relative paths resolve against
 * the working directory). Playwright registers a `require` hook that transpiles
 * TypeScript, so `require` is tried first and works for both `.ts` and `.js`
 * plugins inside the runner; `import()` is the fallback for contexts (plain
 * Node, ESM-only plugins) where it does not.
 *
 * Shared by the two plugin seams — account backends (`src/accounts/`) and
 * mailbox providers (`src/mail/`) — which differ only in what they expect the
 * module to export. The paths themselves are validated in `load.ts`.
 */
export async function importPluginModule(pluginPath: string): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(pluginPath);
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

/**
 * Turns a plugin export into the value it stands for: an object is used as is,
 * a factory is called (and awaited), and a class — which throws when called
 * without `new` — is constructed. The caller validates the result's shape.
 */
export async function instantiatePluginExport(exported: unknown): Promise<unknown> {
  if (typeof exported !== 'function') {
    return exported;
  }
  try {
    return await (exported as () => unknown)();
  } catch (error) {
    if (error instanceof TypeError && /without 'new'|cannot be invoked/i.test(error.message)) {
      return new (exported as new () => unknown)();
    }
    throw error;
  }
}
