import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';

/**
 * The MFE runtime configuration the LMS serves at `/api/mfe_config/v1` — the same
 * values `getConfig()` exposes inside an MFE, merged from settings and site
 * configuration. Cached ~5 minutes (`MFE_CONFIG_API_CACHE_TIMEOUT`), so it
 * reflects install-time configuration, not something a test can toggle.
 *
 * Read here for the pieces Epic 11 gates on: the upload-agreement map (which is
 * site configuration, not a per-run toggle — plan §2.6) and the feature flags
 * that decide whether the taxonomy and Files surfaces render.
 */
export const MFE_CONFIG_PATH = '/api/mfe_config/v1';

/** The upload-agreement gating map: a gating key → the agreement type(s) it requires. */
export type AgreementGating = Readonly<Record<string, readonly string[]>>;

export interface AuthoringMfeConfig {
  /** `AGREEMENT_GATING`, normalized so every value is an array (a bare string becomes `[string]`). */
  readonly agreementGating: AgreementGating;
  /** `ENABLE_TAGGING_TAXONOMY_PAGES` — the taxonomy pages and tag drawers render. */
  readonly taggingEnabled: boolean;
  /** `ENABLE_ASSETS_PAGE` — the Files page MFE is served. */
  readonly assetsPageEnabled: boolean;
  /**
   * `ADMIN_CONSOLE_URL` — where the Roles and Permissions console is served, or
   * undefined where the installation has none. The authoring MFE reads the same
   * value to decide whether its team links point into the console, so this is
   * both the console's address and the "this install has one" signal.
   */
  readonly adminConsoleUrl: string | undefined;
}

/** Coerces the config API's stringy booleans (`'true'`/`true`) to a boolean. */
function asBool(value: unknown): boolean {
  return value === true || value === 'true';
}

/** Normalizes an AGREEMENT_GATING value (string, list, or absent) to a string array. */
function normalizeGating(raw: unknown): AgreementGating {
  if (raw === null || typeof raw !== 'object') return {};
  const out: Record<string, readonly string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = [value];
    else if (Array.isArray(value))
      out[key] = value.filter((v): v is string => typeof v === 'string');
  }
  return out;
}

/**
 * Reads the authoring MFE's runtime config. Public — no session needed. The
 * `mfe` query selects the app whose site-configuration overrides apply.
 */
export async function fetchAuthoringMfeConfig(
  request: APIRequestContext,
  config: AppConfig,
): Promise<AuthoringMfeConfig> {
  const url = `${config.baseUrls.lms}${MFE_CONFIG_PATH}?mfe=authoring`;
  const response = await request.get(url);
  if (!response.ok()) {
    throw new ApiError(`Reading the MFE config failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
  const raw = (await response.json()) as Record<string, unknown>;
  return {
    agreementGating: normalizeGating(raw.AGREEMENT_GATING),
    taggingEnabled: asBool(raw.ENABLE_TAGGING_TAXONOMY_PAGES),
    assetsPageEnabled: asBool(raw.ENABLE_ASSETS_PAGE),
    adminConsoleUrl:
      typeof raw.ADMIN_CONSOLE_URL === 'string' && raw.ADMIN_CONSOLE_URL !== ''
        ? raw.ADMIN_CONSOLE_URL.replace(/\/$/, '')
        : undefined,
  };
}

/** The distinct agreement types named anywhere in a gating map (deduplicated). */
export function agreementTypesIn(gating: AgreementGating): readonly string[] {
  return [...new Set(Object.values(gating).flat())];
}

/** Where the frontend-base shell reads its runtime configuration. */
export const FRONTEND_SITE_CONFIG_PATH = '/api/frontend_site_config/v1/';

/**
 * The configuration that decides what a page's header and footer offer, in one
 * shape whichever frontend generation renders them.
 *
 * A legacy MFE (`frontend-component-header`) reads the flat `mfe_config` keys;
 * the frontend-base shell reads `frontend_site_config`, where the same keys sit
 * under `commonAppConfig` (with per-app overrides in `apps[]`) and the account
 * and profile links are `externalRoutes` roles. Which apps are on the shell is
 * changing release by release, so callers pick the source from the header the
 * page actually rendered, never from a list of apps.
 *
 * The header link rules the chrome specs assert follow from these values: Help
 * exists iff `supportUrl`, Order History iff `orderHistoryUrl`, Programs iff
 * `enablePrograms`, and the catalog link iff discovery is on and courses are
 * browsable.
 */
export interface ChromeConfig {
  readonly siteName: string | undefined;
  readonly lmsBaseUrl: string | undefined;
  readonly logoutUrl: string | undefined;
  readonly accountSettingsUrl: string | undefined;
  readonly accountProfileUrl: string | undefined;
  readonly supportUrl: string | undefined;
  readonly orderHistoryUrl: string | undefined;
  readonly enablePrograms: boolean;
  /** `ENABLE_COURSE_DISCOVERY` and not `NON_BROWSABLE_COURSES`. */
  readonly courseDiscovery: boolean;
  readonly passwordResetSupportLink: string | undefined;
}

type RawConfig = Readonly<Record<string, unknown>>;

function asUrl(value: unknown): string | undefined {
  // An unset value reaches the MFEs as '', null or the string "null".
  return typeof value === 'string' && value !== '' && value !== 'null' ? value : undefined;
}

function asRecord(value: unknown): RawConfig {
  return value !== null && typeof value === 'object' ? (value as RawConfig) : {};
}

function chromeConfigFromKeys(
  keys: RawConfig,
  overrides: Partial<ChromeConfig> = {},
): ChromeConfig {
  return {
    siteName: asUrl(keys.SITE_NAME),
    lmsBaseUrl: asUrl(keys.LMS_BASE_URL),
    logoutUrl: asUrl(keys.LOGOUT_URL),
    accountSettingsUrl: asUrl(keys.ACCOUNT_SETTINGS_URL),
    accountProfileUrl: asUrl(keys.ACCOUNT_PROFILE_URL),
    supportUrl: asUrl(keys.SUPPORT_URL),
    orderHistoryUrl: asUrl(keys.ORDER_HISTORY_URL),
    enablePrograms: asBool(keys.ENABLE_PROGRAMS),
    courseDiscovery: asBool(keys.ENABLE_COURSE_DISCOVERY) && !asBool(keys.NON_BROWSABLE_COURSES),
    passwordResetSupportLink: asUrl(keys.PASSWORD_RESET_SUPPORT_LINK),
    ...overrides,
  };
}

/** Narrows a legacy MFE's `mfe_config` answer. */
export function chromeConfigFromMfeConfig(raw: RawConfig): ChromeConfig {
  return chromeConfigFromKeys(raw);
}

/**
 * Narrows the shell's `frontend_site_config` answer for one app (`appId`, e.g.
 * `org.openedx.frontend.app.learnerDashboard`): the common keys, overridden by
 * that app's own config, with the shell's top-level and route values on top.
 */
export function chromeConfigFromSiteConfig(raw: RawConfig, appId?: string): ChromeConfig {
  const apps = Array.isArray(raw.apps) ? (raw.apps as readonly RawConfig[]) : [];
  const appConfig = asRecord(apps.find((app) => app.appId === appId)?.config);
  const keys = { ...asRecord(raw.commonAppConfig), ...appConfig };
  const routes = Array.isArray(raw.externalRoutes)
    ? (raw.externalRoutes as readonly RawConfig[])
    : [];
  const route = (role: string) =>
    asUrl(routes.find((entry) => entry.role === `org.openedx.frontend.role.${role}`)?.url);
  const base = chromeConfigFromKeys(keys);
  return {
    ...base,
    siteName: asUrl(raw.siteName) ?? base.siteName,
    lmsBaseUrl: asUrl(raw.lmsBaseUrl) ?? base.lmsBaseUrl,
    logoutUrl: route('logout') ?? asUrl(raw.logoutUrl) ?? base.logoutUrl,
    accountSettingsUrl: route('account') ?? base.accountSettingsUrl,
    accountProfileUrl: route('profile') ?? base.accountProfileUrl,
  };
}

/** Where one page's chrome reads its config: a legacy app by name, or the shell. */
export type ChromeConfigSource =
  | { readonly kind: 'legacy'; readonly mfe: string }
  | { readonly kind: 'shell'; readonly appId?: string };

/** Reads the chrome configuration a page's header and footer were built from. Public. */
export async function fetchChromeConfig(
  request: APIRequestContext,
  config: AppConfig,
  source: ChromeConfigSource,
): Promise<ChromeConfig> {
  const url =
    source.kind === 'legacy'
      ? `${config.baseUrls.lms}${MFE_CONFIG_PATH}?${new URLSearchParams({ mfe: source.mfe })}`
      : `${config.baseUrls.lms}${FRONTEND_SITE_CONFIG_PATH}`;
  const response = await request.get(url);
  if (!response.ok()) {
    throw new ApiError(`Reading the frontend config failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
  const raw = (await response.json()) as RawConfig;
  return source.kind === 'legacy'
    ? chromeConfigFromMfeConfig(raw)
    : chromeConfigFromSiteConfig(raw, source.appId);
}
