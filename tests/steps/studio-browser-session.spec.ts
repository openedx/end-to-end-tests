import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { initAccountBackends, type AccountBackend } from '../../src/accounts';
import { loadConfig, STUDIO_HOME_SELECTORS, type AppConfig } from '../../src/config';
import { establishStudioBrowserSession } from '../../src/steps/studio';

/**
 * How the Studio session check reads where `/home/` ends up: Studio Home is a
 * live session, the install's sign-in page a dead one, and any other URL is
 * still loading. A fake page stands in for the browser: navigation commits on
 * `landing.url` at once, and its content renders a moment later, as a real MFE
 * does. No browser or target.
 */

const RENDER_MS = 10;
/** How long a fake wait that can never be satisfied takes to time out. */
const NEVER_MS = 50;

const LOGIN_FIELD = 'input[name="emailOrUsername"]';

interface Landing {
  readonly url: string;
  readonly renders: 'studio-home' | 'login-field' | 'nothing';
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const timeoutError = (what: string): Error =>
  Object.assign(new Error(`Timeout exceeded waiting for ${what}`), { name: 'TimeoutError' });

function fakePage(landing: Landing): Page {
  let current = 'about:blank';
  let rendered: string | undefined;
  const shown =
    landing.renders === 'studio-home'
      ? STUDIO_HOME_SELECTORS.header
      : landing.renders === 'login-field'
        ? LOGIN_FIELD
        : undefined;

  const locator = (selectors: readonly string[]): unknown => ({
    or: (other: { selectors: readonly string[] }) => locator([...selectors, ...other.selectors]),
    first: () => locator(selectors),
    selectors,
    count: () => Promise.resolve(rendered !== undefined && selectors.includes(rendered) ? 1 : 0),
    waitFor: async () => {
      await delay(RENDER_MS);
      if (shown !== undefined && selectors.includes(shown)) return;
      await delay(NEVER_MS);
      throw timeoutError(`locator(${selectors.join(' | ')})`);
    },
  });

  return {
    goto: (url: string) => {
      current = new URL(landing.url, url).href;
      setTimeout(() => {
        rendered = shown;
      }, RENDER_MS);
      return Promise.resolve(null);
    },
    url: () => current,
    locator: (selector: string) => locator([selector]),
    waitForURL: async (matches: (url: URL) => boolean) => {
      if (matches(new URL(current))) return;
      await delay(NEVER_MS);
      throw timeoutError('waitForURL');
    },
  } as unknown as Page;
}

/** Runs `body`, returning what it logged through `console.warn`. */
async function warningsDuring(body: () => Promise<unknown>): Promise<string[]> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    await body();
  } finally {
    console.warn = original;
  }
  return warnings;
}

const ORIGINS = {
  LMS_BASE_URL: 'https://lms.example.com',
  APPS_BASE_URL: 'https://apps.example.com',
  CMS_BASE_URL: 'https://studio.example.com',
};

/** A stock install whose authoring MFE has an origin of its own. */
const authoringOnItsOwnOrigin = loadConfig({
  ...ORIGINS,
  AUTHORING_MFE_URL: 'https://authoring.example.com/authoring',
});

/**
 * An install whose sign-in is an external identity provider, through a backend
 * that recognizes the provider's sign-in page.
 */
async function ssoInstall(): Promise<AppConfig> {
  const config: AppConfig = { ...loadConfig(ORIGINS), accountBackend: 'sso-test' };
  const backend: AccountBackend = {
    name: 'sso-test',
    createIdentity: () => Promise.reject(new Error('unused')),
    activate: () => Promise.resolve(),
    isSignInUrl: (url) => url.hostname === 'sso.example.com',
  };
  (await initAccountBackends(config)).register(backend);
  return config;
}

test.describe('establishStudioBrowserSession', { tag: '@unit' }, () => {
  test('waits for Studio Home on an authoring MFE outside the LMS, apps and Studio origins', async () => {
    const page = fakePage({
      url: 'https://authoring.example.com/authoring/home',
      renders: 'studio-home',
    });

    await expect(establishStudioBrowserSession(page, authoringOnItsOwnOrigin)).resolves.toBe(true);
  });

  test("reads the backend's sign-in page as a dead session, and says where it landed", async () => {
    const config = await ssoInstall();
    const landing = 'https://sso.example.com/realms/learn/protocol/openid-connect/auth';
    const page = fakePage({ url: landing, renders: 'nothing' });

    let live: boolean | undefined;
    const warnings = await warningsDuring(async () => {
      live = await establishStudioBrowserSession(page, config);
    });

    expect(live).toBe(false);
    expect(warnings).toEqual([expect.stringContaining(landing)]);
  });

  test('reads the authn login landing as a dead session by default', async () => {
    const page = fakePage({
      url: 'https://apps.example.com/authn/login?next=%2Fhome%2F',
      renders: 'login-field',
    });

    const warnings = await warningsDuring(async () => {
      await expect(establishStudioBrowserSession(page, authoringOnItsOwnOrigin)).resolves.toBe(
        false,
      );
    });

    expect(warnings).toEqual([expect.stringContaining('/authn/login')]);
  });

  test('keeps waiting, rather than signing in again, on an origin it does not recognize', async () => {
    const page = fakePage({ url: 'https://elsewhere.example.com/', renders: 'nothing' });

    await expect(establishStudioBrowserSession(page, authoringOnItsOwnOrigin)).rejects.toThrow(
      /Timeout exceeded waiting for locator/,
    );
  });
});
