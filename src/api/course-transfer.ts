import type { APIRequestContext } from '@playwright/test';

import { TIMEOUTS, type AppConfig } from '../config';
import { ApiError } from './errors';
import { studioJson, studioOrigin, studioWriteHeaders } from './studio-origin';

/** Starts a course export (Celery task): `POST …/<course>`. */
export const EXPORT_PATH = '/export';

/** Export task state: `{ ExportStatus, ExportOutput?, ExportError? }`. */
export const EXPORT_STATUS_PATH = '/export_status';

/** Import task state for one uploaded filename: `{ ImportStatus, Message }`. */
export const IMPORT_STATUS_PATH = '/import_status';

/**
 * The platform's export states: 0 none, 1 exporting, 2 compressing, 3 done
 * (`ExportOutput` set), negative on failure (`ExportError` set).
 */
export type ExportStatus = -1 | 0 | 1 | 2 | 3;

export interface ExportState {
  readonly status: ExportStatus;
  /** Path of the finished tarball on the Studio origin, when `status` is 3. */
  readonly outputPath?: string;
  readonly error?: string;
}

interface RawExportState {
  readonly ExportStatus?: number;
  readonly ExportOutput?: string;
  readonly ExportError?: string;
}

function toExportState(raw: RawExportState): ExportState {
  return {
    status: (raw.ExportStatus ?? 0) as ExportStatus,
    outputPath: raw.ExportOutput,
    error: raw.ExportError,
  };
}

/** Starts exporting the course. Returns the initial task state. */
export async function startCourseExport(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<ExportState> {
  const headers = await studioWriteHeaders(request, config);
  const response = await request.post(`${studioOrigin(config)}${EXPORT_PATH}/${courseKey}`, {
    headers,
  });
  return toExportState(await studioJson<RawExportState>(response, `Exporting ${courseKey}`));
}

export async function fetchExportState(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<ExportState> {
  const response = await request.get(`${studioOrigin(config)}${EXPORT_STATUS_PATH}/${courseKey}`);
  return toExportState(
    await studioJson<RawExportState>(response, `Reading the export state of ${courseKey}`),
  );
}

/**
 * Polls until the export finishes, under `TIMEOUTS.courseTransfer`.
 *
 * @returns the finished state, with `outputPath` set.
 * @throws {ApiError} when the platform reports a failure or the budget runs out.
 */
export async function waitForCourseExport(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  timeoutMs: number = TIMEOUTS.courseTransfer,
): Promise<ExportState & { outputPath: string }> {
  const deadline = Date.now() + timeoutMs;
  const pollMs = 1_000;
  for (;;) {
    const state = await fetchExportState(request, config, courseKey);
    if (state.status === 3 && state.outputPath !== undefined) {
      return { ...state, outputPath: state.outputPath };
    }
    if (state.status < 0 || state.error !== undefined) {
      throw new ApiError(`Exporting ${courseKey} failed: ${state.error ?? 'unknown error'}`, {
        status: 200,
        url: `${studioOrigin(config)}${EXPORT_STATUS_PATH}/${courseKey}`,
        body: JSON.stringify(state),
      });
    }
    if (Date.now() + pollMs > deadline) {
      throw new ApiError(`Exporting ${courseKey} did not finish within ${timeoutMs} ms.`, {
        status: 200,
        url: '',
        body: JSON.stringify(state),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/**
 * The platform's import states: 0 no status yet (upload in progress, or the task
 * has not registered), 1 unpacking, 2 verifying, 3 updating, 4 done; a negative
 * value is a failure at stage `-(status) - 1` with `Message` set. (The MFE labels
 * 0 "uploading" while its own client-side upload runs — the server reports 1 once
 * the unpack task starts.)
 */
export const IMPORT_SUCCESS = 4;

export interface ImportState {
  readonly status: number;
  readonly message: string;
}

export async function fetchImportState(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  filename: string,
): Promise<ImportState> {
  const response = await request.get(
    `${studioOrigin(config)}${IMPORT_STATUS_PATH}/${courseKey}/${encodeURIComponent(filename)}`,
  );
  const raw = await studioJson<{ ImportStatus?: number; Message?: string }>(
    response,
    `Reading the import state of ${courseKey}`,
  );
  return { status: raw.ImportStatus ?? 0, message: raw.Message ?? '' };
}

/**
 * Downloads a finished export tarball from the path {@link waitForCourseExport}
 * returned. The path is relative to the Studio origin on a filesystem-storage
 * install (`/export_output/<key>`) and absolute on object storage; `new URL`
 * resolves either against the origin.
 */
export async function downloadCourseExport(
  request: APIRequestContext,
  config: AppConfig,
  outputPath: string,
): Promise<Buffer> {
  const url = new URL(outputPath, studioOrigin(config)).href;
  const response = await request.get(url);
  if (!response.ok()) {
    throw new ApiError(`Downloading the export from ${url} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: (await response.text()).slice(0, 500),
    });
  }
  return Buffer.from(await response.body());
}

/**
 * Polls until the import finishes, under `TIMEOUTS.courseTransfer`.
 *
 * @throws {ApiError} when the platform reports a failure or the budget runs out.
 */
export async function waitForCourseImport(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  filename: string,
  timeoutMs: number = TIMEOUTS.courseTransfer,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const pollMs = 1_000;
  for (;;) {
    const state = await fetchImportState(request, config, courseKey, filename);
    if (state.status === IMPORT_SUCCESS) return;
    if (state.status < 0) {
      throw new ApiError(`Importing ${courseKey} failed: ${state.message || 'unknown error'}`, {
        status: 200,
        url: `${studioOrigin(config)}${IMPORT_STATUS_PATH}/${courseKey}/${filename}`,
        body: JSON.stringify(state),
      });
    }
    if (Date.now() + pollMs > deadline) {
      throw new ApiError(`Importing ${courseKey} did not finish within ${timeoutMs} ms.`, {
        status: 200,
        url: '',
        body: JSON.stringify(state),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
