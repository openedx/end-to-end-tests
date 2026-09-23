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
 * What a chrome case is checking, so a known defect marks only the tests it
 * breaks (the Help link's absence, say, and not its presence).
 */
export type ChromeScenario = 'no-help-link' | 'logo-consistency' | 'navigation' | 'page-language';

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
  /** The generation of every page the test read (one, for a single-page case). */
  readonly generations: readonly ChromeGeneration[];
  readonly viewportWidth: number;
  readonly signedIn: boolean;
  readonly scenario: ChromeScenario;
}

/** The widest viewport at which the shell header shows its narrow layout. */
const SHELL_NARROW_MAX_WIDTH = 768;

export const KNOWN_CHROME_DEFECTS: readonly KnownChromeDefect[] = [
  {
    id: 'BASE-005',
    cases: ['TC-00061'],
    applies: ({ generations, viewportWidth, signedIn, scenario }) =>
      scenario === 'navigation' &&
      generations.includes('shell') &&
      !signedIn &&
      viewportWidth <= SHELL_NARROW_MAX_WIDTH,
    reason:
      'BASE-005: the frontend-base shell header menu opens empty for a signed-out visitor at narrow widths, so its primary links (the catalog) are unreachable',
  },
  {
    id: 'LEARN-002',
    cases: ['TC-00020', 'TC-00021'],
    applies: ({ generations, scenario }) =>
      scenario === 'no-help-link' && generations.includes('learning'),
    reason:
      'LEARN-002: the learning header renders its Help link with href="null" when SUPPORT_URL is unset, instead of leaving it out',
  },
  {
    id: 'BASE-004',
    cases: ['TC-00060'],
    applies: ({ generations, scenario }) =>
      scenario === 'logo-consistency' &&
      generations.includes('shell') &&
      generations.some((generation) => generation !== 'shell'),
    reason:
      'BASE-004: the frontend-base shell and the legacy headers size the header and footer logos differently, so a site mixing them is inconsistent',
  },
  {
    id: 'FP-001',
    cases: ['TC-00066'],
    applies: ({ generations, scenario }) =>
      scenario === 'page-language' && generations.some((generation) => generation !== 'shell'),
    reason:
      'FP-001: MFEs built on frontend-platform switch `dir` to the chosen language but leave `<html lang>` as built ("en-us")',
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
 * The account-menu items a signed-in header offers, as the URLs they point at,
 * in the order the header renders them. The shell and the legacy headers
 * differ: the legacy ones lead with the dashboard (the shell reaches it
 * through its logo and "Courses" link instead).
 */
export function expectedUserMenu(
  generation: ChromeGeneration,
  chrome: ChromeConfig,
  username: string,
): readonly string[] {
  const join = (base: string | undefined, path: string) =>
    base === undefined ? undefined : `${base.replace(/\/$/, '')}${path}`;
  const items = [
    generation === 'shell' ? undefined : join(chrome.lmsBaseUrl, '/dashboard'),
    join(chrome.accountProfileUrl, `/u/${username}`),
    chrome.accountSettingsUrl,
    chrome.orderHistoryUrl,
    chrome.logoutUrl,
  ];
  return items
    .filter((item): item is string => item !== undefined)
    .map((item) => new URL(item).toString());
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
