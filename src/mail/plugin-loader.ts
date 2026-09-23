import { importPluginModule, instantiatePluginExport } from '../config';
import type { MailProvider } from './types';

function isMailProvider(value: unknown): value is MailProvider {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<MailProvider>;
  return (
    typeof candidate.name === 'string' &&
    candidate.name !== '' &&
    typeof candidate.createInbox === 'function'
  );
}

/**
 * Loads a mailbox provider from a plugin file path (relative paths resolve
 * against the working directory).
 *
 * The provider is the module's named `mailProvider` export when it has one —
 * so a module can ship an account backend as its default export beside it, as
 * `plugins/openinbox.plugin.ts` does — and its default export otherwise. Either
 * may be the provider itself, a class, or a factory; a factory or constructor
 * is where a plugin validates its own settings, so a bad one fails the run in
 * global setup rather than mid-spec.
 *
 * @throws {Error} when the file cannot be loaded or does not export a value that
 * satisfies {@link MailProvider}.
 */
export async function loadMailProviderPlugin(pluginPath: string): Promise<MailProvider> {
  let module: Record<string, unknown>;
  try {
    module = await importPluginModule(pluginPath);
  } catch (error) {
    throw new Error(
      `Failed to load mailbox provider plugin "${pluginPath}": ${(error as Error).message}`,
      { cause: error },
    );
  }

  const exported = module.mailProvider ?? module.default;
  if (exported === undefined) {
    throw new Error(
      `Mailbox provider plugin "${pluginPath}" must have a \`mailProvider\` export (or a ` +
        'default export) that is a MailProvider, a class implementing it, or a factory ' +
        'returning one.',
    );
  }

  const provider = await instantiatePluginExport(exported);
  if (!isMailProvider(provider)) {
    throw new Error(
      `Mailbox provider plugin "${pluginPath}" does not export a valid MailProvider: ` +
        'it needs a non-empty `name` and a `createInbox()` method.',
    );
  }
  return provider;
}
