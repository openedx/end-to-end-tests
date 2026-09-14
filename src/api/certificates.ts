import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { studioJson, studioOrigin, studioWriteHeaders } from './studio-origin';

/** Certificate configuration, as the authoring MFE reads it. */
export const CERTIFICATES_PATH = '/api/contentstore/v1/certificates';

/** Certificate writes (legacy Studio handler): `POST …/<course>`. */
export const CERTIFICATES_WRITE_PATH = '/certificates';

/** Activation toggle: `POST …/<course>/` with `{ is_active }`. */
export const CERTIFICATE_ACTIVATION_PATH = '/certificates/activation';

export interface Signatory {
  readonly name: string;
  readonly title: string;
  readonly organization: string;
  readonly signature_image_path?: string;
  readonly id?: number;
}

export interface Certificate {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly is_active: boolean;
  readonly signatories: readonly Signatory[];
  readonly version: number;
}

export interface CertificateConfiguration {
  readonly certificates: readonly Certificate[];
  /** Whether the course's certificate is activated (course-wide, not per certificate). */
  readonly isActive: boolean;
  /** Course modes that can carry a certificate; empty on a fresh course. */
  readonly courseModes: readonly string[];
  readonly hasCertificateModes: boolean;
  /** LMS preview URL, when the platform offers one. */
  readonly certificateWebViewUrl: string | null;
}

interface RawCertificateConfiguration {
  readonly certificates?: readonly Certificate[];
  readonly is_active?: boolean;
  readonly course_modes?: readonly string[];
  readonly has_certificate_modes?: boolean;
  readonly certificate_web_view_url?: string | null;
}

export async function fetchCertificateConfiguration(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CertificateConfiguration> {
  const response = await request.get(`${studioOrigin(config)}${CERTIFICATES_PATH}/${courseKey}`);
  const raw = await studioJson<RawCertificateConfiguration>(
    response,
    `Reading the certificate configuration of ${courseKey}`,
  );
  return {
    certificates: raw.certificates ?? [],
    isActive: raw.is_active ?? false,
    courseModes: raw.course_modes ?? [],
    hasCertificateModes: raw.has_certificate_modes ?? false,
    certificateWebViewUrl: raw.certificate_web_view_url ?? null,
  };
}

/** Creates a certificate with the given signatories. Returns it with its ids. */
export async function createCertificate(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  certificate: {
    readonly name: string;
    readonly description?: string;
    readonly signatories: readonly Signatory[];
  },
): Promise<Certificate> {
  const headers = await studioWriteHeaders(request, config);
  const response = await request.post(
    `${studioOrigin(config)}${CERTIFICATES_WRITE_PATH}/${courseKey}`,
    {
      data: {
        name: certificate.name,
        description: certificate.description ?? '',
        course_title: '',
        signatories: certificate.signatories.map((s) => ({ signature_image_path: '', ...s })),
        version: 1,
        is_active: false,
        editing: false,
      },
      headers,
    },
  );
  return studioJson<Certificate>(response, `Creating a certificate in ${courseKey}`);
}

/** Activates or deactivates the course's certificate. */
export async function setCertificateActive(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  isActive: boolean,
): Promise<void> {
  const url = `${studioOrigin(config)}${CERTIFICATE_ACTIVATION_PATH}/${courseKey}/`;
  const headers = await studioWriteHeaders(request, config);
  const response = await request.post(url, { data: { is_active: isActive }, headers });
  if (!response.ok()) {
    throw new ApiError(
      `Setting certificate activation of ${courseKey} to ${isActive} failed (HTTP ${response.status()}).`,
      { status: response.status(), url, body: await response.text() },
    );
  }
}

/**
 * Deletes the certificate with `certificateId`. The platform refuses to delete an
 * **active** certificate, so deactivate first (see {@link resetCertificates}).
 */
export async function deleteCertificate(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  certificateId: number,
): Promise<void> {
  const url = `${studioOrigin(config)}${CERTIFICATES_WRITE_PATH}/${courseKey}/${certificateId}`;
  const headers = await studioWriteHeaders(request, config);
  const response = await request.delete(url, { headers });
  if (!response.ok() && response.status() !== 204) {
    throw new ApiError(
      `Deleting certificate ${certificateId} of ${courseKey} failed (HTTP ${response.status()}).`,
      { status: response.status(), url, body: await response.text() },
    );
  }
}

/**
 * Removes every certificate from a course, deactivating first so the deletes are
 * allowed. Leaves the course with no certificate configuration — the clean slate
 * each certificate spec starts from, since there is no per-run course teardown.
 */
export async function resetCertificates(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<void> {
  const current = await fetchCertificateConfiguration(request, config, courseKey);
  if (current.isActive) {
    await setCertificateActive(request, config, courseKey, false);
  }
  for (const certificate of current.certificates) {
    await deleteCertificate(request, config, courseKey, certificate.id);
  }
}
