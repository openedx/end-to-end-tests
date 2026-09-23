import type { APIRequestContext, Page } from '@playwright/test';

import { registrableDomain, type AppConfig } from '../config';
import { fetchChromeConfig, type ChromeConfig, type ChromeConfigSource } from '../api';
import type { ChromeGeneration, HeaderBlock } from '../pages/lms/chrome/header.block';

/**
 * Site-chrome readings: which frontend rendered a page's header and footer,
 * and the configuration that decided what they offer.
 *
 * The header and footer are asserted against the target's own configuration,
 * never against a list of labels (a Help link exists iff `SUPPORT_URL` is set,
 * the catalog link iff discovery is on), so the specs hold on any provider's
 * install. Where that configuration is read follows from the generation the
 * page rendered — a legacy MFE reads `mfe_config` for its own app, the
 * frontend-base shell reads the site config — so the oracle moves with an app
 * when it joins the shell.
 */
export interface PageChrome {
  readonly generation: ChromeGeneration;
  readonly chrome: ChromeConfig;
}

/** Where a page's chrome read its configuration, given what it rendered. */
export function chromeConfigSourceFor(
  generation: ChromeGeneration,
  pageUrl: string,
  config: AppConfig,
): ChromeConfigSource {
  if (generation === 'shell') return { kind: 'shell' };
  // A legacy MFE is served under its own path on the MFE host (`/learning/…`,
  // `/profile/…`); that path segment is the `mfe` its config is requested for.
  const url = new URL(pageUrl);
  const mfe =
    url.origin === new URL(config.baseUrls.apps).origin
      ? (url.pathname.split('/').find((segment) => segment !== '') ?? '')
      : '';
  return { kind: 'legacy', mfe };
}

/** Detects the page's chrome generation and reads the configuration behind it. */
export async function readPageChrome(
  page: Page,
  header: HeaderBlock,
  request: APIRequestContext,
  config: AppConfig,
): Promise<PageChrome> {
  const generation = await header.generation();
  const chrome = await fetchChromeConfig(
    request,
    config,
    chromeConfigSourceFor(generation, page.url(), config),
  );
  return { generation, chrome };
}

/** What a signed-out visitor's header offers, derived from the configuration. */
export interface AnonymousHeaderExpectation {
  /** The catalog ("Explore courses") link, where discovery is on. */
  readonly mainLinks: number;
  /** Sign in and register. */
  readonly callsToAction: number;
}

export function anonymousHeaderExpectation(chrome: ChromeConfig): AnonymousHeaderExpectation {
  return { mainLinks: chrome.courseDiscovery ? 1 : 0, callsToAction: 2 };
}

/**
 * A chrome defect the suite knows about, tied to the generation (and layout)
 * that has it — not to a release or an app — so it stops applying on its own
 * the day the page moves to a frontend without it.
 */
export interface KnownChromeDefect {
  /** The finding in `docs/findings.md`. */
  readonly id: string;
  /** The BTR cases whose assertion the defect breaks. */
  readonly cases: readonly string[];
  readonly applies: (context: ChromeDefectContext) => boolean;
  readonly reason: string;
}

export interface ChromeDefectContext {
  readonly generation: ChromeGeneration;
  readonly viewportWidth: number;
  readonly signedIn: boolean;
}

/** The widest viewport at which the shell header shows its narrow layout. */
const SHELL_NARROW_MAX_WIDTH = 768;

export const KNOWN_CHROME_DEFECTS: readonly KnownChromeDefect[] = [
  {
    id: 'BASE-005',
    cases: ['TC-00061'],
    applies: ({ generation, viewportWidth, signedIn }) =>
      generation === 'shell' && !signedIn && viewportWidth <= SHELL_NARROW_MAX_WIDTH,
    reason:
      'BASE-005: the frontend-base shell header menu opens empty for a signed-out visitor at narrow widths, so its primary links (the catalog) are unreachable',
  },
];

/** The known defects that apply to a test carrying `caseIds` in this context. */
export function knownChromeDefects(
  context: ChromeDefectContext,
  caseIds: readonly string[],
): readonly KnownChromeDefect[] {
  return KNOWN_CHROME_DEFECTS.filter(
    (defect) => defect.cases.some((id) => caseIds.includes(id)) && defect.applies(context),
  );
}

/**
 * Splits link targets into those served by the installation (same registrable
 * domain as the LMS) and those off-site. Specs fetch the former and only check
 * the latter are well formed, so a run never depends on a third party.
 */
export function partitionSiteLinks(
  urls: readonly string[],
  config: AppConfig,
): { readonly onSite: readonly string[]; readonly offSite: readonly string[] } {
  const lmsHost = new URL(config.baseUrls.lms).hostname;
  const site = registrableDomain(lmsHost) ?? lmsHost;
  const onSite = urls.filter((url) => {
    const { hostname } = new URL(url);
    return hostname === site || hostname.endsWith(`.${site}`);
  });
  return { onSite, offSite: urls.filter((url) => !onSite.includes(url)) };
}

/** How far the page's content overflows the viewport sideways, in CSS pixels. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
}
