import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson, studioOrigin, studioWriteHeaders, STUDIO_JSON_ACCEPT } from './studio-origin';

/**
 * Course file (asset) management — Studio's legacy contentstore endpoint
 * (`/assets/<courseKey>/`), a session-authed browser API (not an MFE service), so
 * every call runs on the author's `page.request`. Lock, download and delete are
 * driven through the Files UI; this client lists and uploads assets, as the
 * suite-side oracle for what the UI shows (`totalCount`, the `assets[]` for the
 * test's own uploads) and to seed state the UI would otherwise build by hand.
 */
const assetsBase = (config: AppConfig, courseKey: string): string =>
  `${studioOrigin(config)}/assets/${courseKey}/`;

/** One course asset, as the contentstore returns it (the fields the suite reads). */
export interface CourseAsset {
  readonly id: string;
  readonly display_name: string;
  readonly content_type: string;
  readonly file_size: number;
  readonly locked: boolean;
  readonly url: string;
  readonly external_url: string;
  readonly portable_url: string;
  readonly thumbnail: string | null;
  readonly date_added: string;
}

interface RawAssetList {
  readonly assets: readonly CourseAsset[];
  readonly totalCount: number;
  readonly start: number;
  readonly end: number;
  readonly page: number;
  readonly pageSize: number;
}

/** What {@link fetchAssets} accepts: the contentstore's list query parameters. */
export interface AssetQuery {
  readonly page?: number;
  readonly pageSize?: number;
  /** Server-side sort column, e.g. `date_added`, `display_name`, `file_size`. */
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
  /** Restrict to one asset type (`Images`, `Documents`, `Audio`, `Code`, `OTHER`). */
  readonly assetType?: string;
  /** Free-text name search. */
  readonly textSearch?: string;
}

/** Lists a course's assets (one page). The Files table reads the same endpoint. */
export async function fetchAssets(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  query: AssetQuery = {},
): Promise<RawAssetList> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 0));
  params.set('page_size', String(query.pageSize ?? 50));
  if (query.sort !== undefined) params.set('sort', query.sort);
  if (query.direction !== undefined) params.set('direction', query.direction);
  if (query.assetType !== undefined) params.set('asset_type', query.assetType);
  if (query.textSearch !== undefined) params.set('text_search', query.textSearch);
  const url = `${assetsBase(config, courseKey)}?${params.toString()}`;
  return studioJson<RawAssetList>(
    await request.get(url, { headers: STUDIO_JSON_ACCEPT }),
    `Listing assets of ${courseKey}`,
  );
}

/** All of a course's assets across pages (small courses only — for oracles). */
export async function fetchAllAssets(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly CourseAsset[]> {
  const first = await fetchAssets(request, config, courseKey, { page: 0, pageSize: 50 });
  const all = [...first.assets];
  const pages = Math.ceil(first.totalCount / (first.pageSize || 50));
  for (let page = 1; page < pages; page += 1) {
    all.push(...(await fetchAssets(request, config, courseKey, { page, pageSize: 50 })).assets);
  }
  return all;
}

/** Uploads one file to a course, returning the created asset. */
export async function uploadAsset(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  file: { readonly name: string; readonly mimeType: string; readonly buffer: Buffer },
): Promise<CourseAsset> {
  const response = await request.post(assetsBase(config, courseKey), {
    headers: await studioWriteHeaders(request, config),
    multipart: { file },
  });
  const body = await studioJson<{ readonly asset: CourseAsset }>(
    response,
    `Uploading asset "${file.name}" to ${courseKey}`,
  );
  return body.asset;
}

/** The absolute URL an asset's copied Studio/Web link resolves to (for verifying copy actions). */
export function assetStudioUrl(config: AppConfig, asset: CourseAsset): string {
  return asset.external_url.startsWith('http')
    ? asset.external_url
    : `${studioOrigin(config)}${asset.url}`;
}
