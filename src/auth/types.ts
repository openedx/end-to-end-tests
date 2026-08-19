import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test';

import type { AppConfig } from '../config';
import type { Role } from './roles';

/**
 * Playwright's serialized storage state (cookies + per-origin localStorage), as
 * returned by `BrowserContext.storageState()`. Derived from Playwright's own
 * types so it stays correct across upgrades.
 */
export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/**
 * Resources an {@link AuthProvider} may use to sign in. A provider chooses its
 * path: API-driven (via `request`, hitting the LMS login-session endpoint the
 * authn MFE uses) or UI-driven (via `browser`, driving the authn MFE and
 * capturing state). Both yield a single storage state valid across all
 * configured origins.
 */
export interface AuthContext {
  readonly config: AppConfig;
  readonly request: APIRequestContext;
  readonly browser: Browser;
}

/**
 * The provider-swappable authentication contract (ADR-0002). Given a role,
 * return a storage state valid across the declared LMS, Studio, and MFE origins,
 * relying on Open edX's shared parent-domain cookies — never by disabling
 * browser security. A provider with custom SSO supplies their own implementation
 * without touching the tests.
 */
export interface AuthProvider {
  authenticate(role: Role, context: AuthContext): Promise<StorageState>;
}
