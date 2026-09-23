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
