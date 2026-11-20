import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { openAdminForm, postAdminForm } from './django-admin';
import { ApiError } from './errors';
import { STUDIO_JSON_ACCEPT, studioJson, studioOrigin } from './studio-origin';
import { XBLOCK_PATH, updateXBlock } from './xblock';

/**
 * LTI 1.3 consumer blocks (`lti_consumer`, xblock-lti-consumer): configuring one
 * through the block API and reading the values a tool is registered with.
 *
 * The registration values (client id, deployment id, keyset/token/login URLs)
 * have no JSON API: the block renders them only in its Studio `author_view`.
 * {@link readLtiLaunchInfo} reads that view through Studio's view handler and
 * takes each value **by shape** — a UUID, or a URL on a known path — never by
 * its (localized) label.
 *
 * Reading the `author_view` also matters for state: the block's LTI
 * configuration and its client id are created lazily, on the first render. A
 * block saved through the API and never rendered has none yet, so a duplicate
 * of it gets a client id of its own; one that has been rendered is duplicated
 * with the same one.
 */

/** Where `{LMS}/api/lti_consumer/v1/…` keysets, tokens and launches live. */
export const LTI_CONSUMER_API_PATH = '/api/lti_consumer/v1/';

/** The block's LTI 1.3 settings the suite writes; field names are the XBlock's own. */
export interface Lti13Settings {
  readonly launchUrl: string;
  readonly oidcUrl: string;
  /** The tool's RSA public key (PEM), so the platform never has to fetch a keyset. */
  readonly toolPublicKey: string;
  /** Where the learner launch opens; the block's default is `iframe`. */
  readonly launchTarget?: 'iframe' | 'modal' | 'new_window';
  /** `declarative` (the block's default), `programmatic` or `disabled`. */
  readonly agsMode?: 'declarative' | 'programmatic' | 'disabled';
  readonly hasScore?: boolean;
  readonly weight?: number;
  readonly nrps?: boolean;
  /** The deep-linking launch URL; turns deep linking on. */
  readonly deepLinkingUrl?: string;
  readonly askToSend?: {
    readonly username?: boolean;
    readonly fullName?: boolean;
    readonly email?: boolean;
  };
  /** The "Data Sharing Notice" shown above a modal or new-window launch button. */
  readonly description?: string;
}

/** The values a tool registers the platform with, as Studio shows them for one block. */
export interface LtiLaunchInfo {
  readonly clientId: string;
  readonly deploymentId: string;
  readonly keysetUrl: string;
  readonly tokenUrl: string;
  /** The platform's OIDC authorization endpoint (Studio's "Login URL"). */
  readonly loginUrl: string;
  /** The platform issuer: the LMS root, which is what the block's launches carry. */
  readonly issuer: string;
}

/** The block metadata for {@link Lti13Settings}. */
export function lti13Metadata(settings: Lti13Settings): Record<string, unknown> {
  return {
    lti_version: 'lti_1p3',
    lti_1p3_launch_url: settings.launchUrl,
    lti_1p3_oidc_url: settings.oidcUrl,
    lti_1p3_tool_key_mode: 'public_key',
    lti_1p3_tool_public_key: settings.toolPublicKey,
    ...(settings.launchTarget === undefined ? {} : { launch_target: settings.launchTarget }),
    ...(settings.agsMode === undefined ? {} : { lti_advantage_ags_mode: settings.agsMode }),
    ...(settings.hasScore === undefined ? {} : { has_score: settings.hasScore }),
    ...(settings.weight === undefined ? {} : { weight: settings.weight }),
    ...(settings.nrps === undefined ? {} : { lti_1p3_enable_nrps: settings.nrps }),
    ...(settings.deepLinkingUrl === undefined
      ? {}
      : {
          lti_advantage_deep_linking_enabled: true,
          lti_advantage_deep_linking_launch_url: settings.deepLinkingUrl,
        }),
    ...(settings.askToSend?.username === undefined
      ? {}
      : { ask_to_send_username: settings.askToSend.username }),
    ...(settings.askToSend?.fullName === undefined
      ? {}
      : { ask_to_send_full_name: settings.askToSend.fullName }),
    ...(settings.askToSend?.email === undefined
      ? {}
      : { ask_to_send_email: settings.askToSend.email }),
    ...(settings.description === undefined ? {} : { description: settings.description }),
  };
}

/** Writes LTI 1.3 settings to an existing `lti_consumer` block. */
export async function configureLti13Block(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
  settings: Lti13Settings,
): Promise<void> {
  await updateXBlock(request, config, usageKey, { metadata: lti13Metadata(settings) });
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * The registration values in an LTI 1.3 block's `author_view` HTML, by shape:
 * the keyset and token URLs on their `lti_consumer` paths (ending in a UUID, or
 * `<app>/<slug>` for a reusable configuration), the login URL on the
 * launch path, the client id the one UUID that stands outside any URL. The
 * deployment id follows the "Deployment ID" value, which is the only bare token
 * of its own in the view; the platform issues `1` for every block-configured
 * tool. Returns `undefined` when the view holds no LTI 1.3 configuration.
 */
export function parseLtiLaunchInfo(html: string): Omit<LtiLaunchInfo, 'issuer'> | undefined {
  const api = LTI_CONSUMER_API_PATH.replace(/\//g, '\\/');
  const url = (suffix: string): string | undefined =>
    new RegExp(`https?:\\/\\/[^\\s"<]+${api}${suffix}`).exec(html)?.[0];
  // A block's own configuration is keyed by its passport's UUID; a reusable
  // one by `<app>/<slug>` (`lti_store/<slug>`).
  const id = `(?:${UUID}|[\\w-]+\\/[\\w-]+)`;
  const keysetUrl = url(`public_keysets\\/${id}`);
  const tokenUrl = url(`token\\/${id}`);
  const loginUrl = url('launch\\/?');
  // UUIDs inside the URLs (the passport id) are not the client id.
  const bare = html.replace(new RegExp(`https?:\\/\\/[^\\s"<]+`, 'g'), '');
  const clientId = new RegExp(UUID).exec(bare)?.[0];
  if (keysetUrl === undefined || tokenUrl === undefined || loginUrl === undefined) {
    return undefined;
  }
  if (clientId === undefined) return undefined;
  // The paragraph after the client id's holds the deployment id: the only
  // text in the view that is a bare word with no spaces, URL or UUID.
  const afterClient = bare.slice(bare.indexOf(clientId) + clientId.length);
  const deploymentId = />\s*([^\s<>]+)\s*<\/p>/.exec(afterClient)?.[1];
  if (deploymentId === undefined) return undefined;
  return { clientId, deploymentId, keysetUrl, tokenUrl, loginUrl };
}

/**
 * An LTI block's Studio `author_view` HTML: the registration values and, once a
 * tool has answered a deep-linking request, the content it stored. Rendering it
 * creates the block's LTI configuration if this is its first render.
 */
export async function fetchLtiAuthorView(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<string> {
  const response = await request.get(
    `${studioOrigin(config)}${XBLOCK_PATH}${usageKey}/author_view`,
    { headers: STUDIO_JSON_ACCEPT },
  );
  const body = await studioJson<{ html?: string }>(response, `Rendering ${usageKey}'s author view`);
  return body.html ?? '';
}

/**
 * Reads the registration values for an LTI 1.3 block from its Studio
 * `author_view`, creating the block's LTI configuration if this is its first
 * render. Throws when the view shows none (not an LTI 1.3 block, or not
 * configured).
 */
export async function readLtiLaunchInfo(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<LtiLaunchInfo> {
  const html = await fetchLtiAuthorView(request, config, usageKey);
  const info = parseLtiLaunchInfo(html);
  if (info === undefined) {
    throw new ApiError(
      `${usageKey}'s author view shows no LTI 1.3 registration values (client id, keyset, ` +
        'token and login URLs). Is it an lti_consumer block set to LTI 1.3?',
      {
        status: 200,
        url: `${studioOrigin(config)}${XBLOCK_PATH}${usageKey}/author_view`,
        body: html.slice(0, 500),
      },
    );
  }
  return { ...info, issuer: config.baseUrls.lms };
}

/** The Django admin form that turns LTI personal-data sharing on for one course. */
export const LTI_PII_SHARING_ADMIN_PATH = '/admin/lti_consumer/courseallowpiisharinginltiflag/add/';

/**
 * Lets a course's LTI blocks offer to share personal data (username, full name,
 * email) — the site operator's `CourseAllowPIISharingInLTIFlag`, a keyed
 * configuration row, saved as a new current row. `adminSession` is an LMS
 * Django session for a superuser.
 */
export async function allowLtiPiiSharing(
  adminSession: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<void> {
  const url = `${config.baseUrls.lms}${LTI_PII_SHARING_ADMIN_PATH}`;
  const what = `Allowing LTI personal-data sharing in ${courseKey}`;
  const { token } = await openAdminForm(adminSession, url, what);
  await postAdminForm(adminSession, url, token, { course_id: courseKey, enabled: 'on' }, what);
}

/**
 * The course waffle flag that lets an LTI block use a configuration kept outside
 * the block (LTI Store's reusable configurations, `config_type: external`).
 */
export const LTI_EXTERNAL_CONFIG_FLAG = 'lti_consumer.enable_external_config_filter';

/** LTI Store's admin form for a reusable configuration. */
export const LTI_STORE_ADMIN_PATH = '/admin/lti_store/externallticonfiguration/add/';

/** An LTI 1.3 configuration to keep in LTI Store. */
export interface LtiStoreConfiguration {
  /** Unique name; the slug is derived the same way the admin would. */
  readonly name: string;
  readonly slug: string;
  readonly launchUrl: string;
  readonly oidcUrl: string;
  readonly toolPublicKey: string;
  /** The platform's RSA private key (PEM) this configuration signs launches with. */
  readonly platformPrivateKey: string;
  /**
   * "LTI 1.3 Redirect URIs". Left out, the field keeps the admin form's default,
   * an empty list, which is meant to fall back to the launch URL (`LTI-003`).
   */
  readonly redirectUris?: readonly string[];
}

/**
 * Keeps an LTI 1.3 tool configuration in LTI Store (`openedx-ltistore`'s
 * `ExternalLtiConfiguration`, through Django admin) and returns the filter key
 * a block refers to it by: `lti_store:<slug>`. LTI Store generates the client id
 * on save; the deployment id is `1`, as for a block's own configuration.
 * `adminSession` is an LMS Django session for a superuser.
 */
export async function createLtiStoreConfiguration(
  adminSession: APIRequestContext,
  config: AppConfig,
  configuration: LtiStoreConfiguration,
): Promise<string> {
  const url = `${config.baseUrls.lms}${LTI_STORE_ADMIN_PATH}`;
  const what = `Keeping the LTI configuration ${configuration.slug} in LTI Store`;
  const { token } = await openAdminForm(adminSession, url, what);
  await postAdminForm(
    adminSession,
    url,
    token,
    {
      name: configuration.name,
      slug: configuration.slug,
      description: '',
      version: 'lti_1p3',
      lti_1p1_launch_url: '',
      lti_1p1_client_key: '',
      lti_1p1_client_secret: '',
      lti_1p3_client_id: '',
      lti_1p3_deployment_id: '1',
      lti_1p3_oidc_url: configuration.oidcUrl,
      lti_1p3_launch_url: configuration.launchUrl,
      lti_1p3_private_key: configuration.platformPrivateKey,
      lti_1p3_private_key_id: '',
      lti_1p3_tool_public_key: configuration.toolPublicKey,
      lti_1p3_tool_keyset_url: '',
      lti_1p3_redirect_uris: JSON.stringify(configuration.redirectUris ?? []),
      lti_advantage_deep_linking_launch_url: '',
      lti_advantage_ags_mode: 'declarative',
    },
    what,
  );
  return `lti_store:${configuration.slug}`;
}

/**
 * Whether Studio's editor for an LTI block offers a configuration type (a
 * block-level configuration or a reusable one) — what it does once the course's
 * {@link LTI_EXTERNAL_CONFIG_FLAG} is on. Read from the editor Studio renders
 * (`studio_view`), by the field's id.
 */
export async function ltiEditorOffersConfigType(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<boolean> {
  const response = await request.get(
    `${studioOrigin(config)}${XBLOCK_PATH}${usageKey}/studio_view`,
    { headers: STUDIO_JSON_ACCEPT },
  );
  const body = await studioJson<{ html?: string }>(response, `Rendering ${usageKey}'s editor`);
  return (body.html ?? '').includes('id="xb-field-edit-config_type"');
}

/** A deep-linked item as the platform stored it for a block (its `attributes`). */
export interface LtiDeepLinkedItem {
  readonly url?: string;
  readonly title?: string;
  readonly custom?: Readonly<Record<string, string>>;
  readonly [attribute: string]: unknown;
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&quot;': '"',
  '&#34;': '"',
  '&#x27;': "'",
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
};

/**
 * The deep-linking items stored for a block, from its Studio `author_view`: the
 * view renders them as JSON in a `<pre>` (`lti_1p3_studio.html`). Empty when a
 * tool has stored none.
 */
export async function readLtiDeepLinkedItems(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<readonly LtiDeepLinkedItem[]> {
  return parseLtiDeepLinkedItems(await fetchLtiAuthorView(request, config, usageKey));
}

/** The deep-linking items in an LTI block's `author_view` HTML (its `<pre>` of JSON). */
export function parseLtiDeepLinkedItems(html: string): readonly LtiDeepLinkedItem[] {
  const pre = /<pre>([\s\S]*?)<\/pre>/.exec(html)?.[1];
  if (pre === undefined) return [];
  const json = pre.replace(/&(?:quot|#34|#x27|#39|lt|gt|amp);/g, (e) => HTML_ENTITIES[e] ?? e);
  const items = JSON.parse(json) as unknown;
  return Array.isArray(items) ? (items as LtiDeepLinkedItem[]) : [];
}
