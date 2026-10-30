import type { APIRequest, APIRequestContext, Browser, BrowserContext } from '@playwright/test';

import type { StorageState } from './types';

/** Storage state with nothing in it: no cookies, no origins. */
export const EMPTY_STORAGE_STATE: StorageState = { cookies: [], origins: [] };

/**
 * A request context that starts **signed out**, whatever project it runs in.
 *
 * Inside a test, Playwright fills every option a `newContext()` call leaves out
 * from the project's `use` block — `storageState` included. So in a project that
 * loads a role's state (the `studio-author` project loads the author's), a bare
 * `playwright.request.newContext()` is not fresh: it carries that role's LMS
 * session, and its SSO cookies if the account backend federates. Registering a
 * new account on it then signs in as the role instead of as the new account.
 * Passing an empty `storageState` explicitly is what opts out.
 */
export function newCleanRequestContext(api: APIRequest): Promise<APIRequestContext> {
  return api.newContext({ storageState: EMPTY_STORAGE_STATE });
}

/** {@link newCleanRequestContext} for a browser context. */
export function newCleanBrowserContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: EMPTY_STORAGE_STATE });
}
