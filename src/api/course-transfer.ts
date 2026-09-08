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
): Promise<ExportState> {
  const deadline = Date.now() + timeoutMs;
  const pollMs = 1_000;
  for (;;) {
    const state = await fetchExportState(request, config, courseKey);
    if (state.status === 3 && state.outputPath !== undefined) return state;
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
 * The platform's import states: 0 none, 1 uploading, 2 unpacking, 3 verifying,
 * 4 updating, 5 done; negative on failure (`Message` set).
 *
 * Starting an import is a chunked multipart upload the authoring MFE performs;
 * it is driven through the Import page in this suite (the upload contract is
 * not yet verified against the API), so only the status read lives here.
 */
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
