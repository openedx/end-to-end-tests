import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { fetchCertificateGenerationEnabled } from './instructor';

/**
 * The LMS Django admin page for the platform-wide certificate switch. A
 * `ConfigurationModel`: adding a row with "Enabled" checked turns it on, and
 * adding another is harmless.
 */
export const CERTIFICATE_GENERATION_ADMIN_PATH =
  '/admin/certificates/certificategenerationconfiguration/add/';

/**
 * Makes sure the platform allows certificate generation
 * (`CertificateGenerationConfiguration.enabled`), which is **off on a default
 * install** and has no REST API — only the Django admin.
 *
 * `adminSession` must hold an **LMS Django session** for the configured admin: a
 * throwaway request context signed in with `loginSession`, under
 * `withAdminSession`. The captured staff API state (`adminApi`) is refused by the
 * admin with 403 — it is session-authenticated, like the cohort views.
 *
 * Reads the switch through the instructor API first so a target that already
 * has it on spends no admin write. Returns whether a change was made.
 */
export async function ensureCertificateGenerationEnabled(
  adminSession: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<boolean> {
  if (await fetchCertificateGenerationEnabled(adminSession, config, courseKey)) {
    return false;
  }

  const url = `${config.baseUrls.lms}${CERTIFICATE_GENERATION_ADMIN_PATH}`;
  const form = await adminSession.get(url);
  const html = await form.text();
  const token = /name="csrfmiddlewaretoken" value="([^"]+)"/.exec(html)?.[1];
  if (!form.ok() || !token) {
    throw new ApiError(
      `The certificate-generation admin form did not render (HTTP ${form.status()}): ` +
        'the session is not an LMS Django session for a superuser.',
      { status: form.status(), url, body: html.slice(0, 500) },
    );
  }

  const saved = await adminSession.post(url, {
    form: { csrfmiddlewaretoken: token, enabled: 'on', _save: 'Save' },
    headers: { Referer: url },
    maxRedirects: 0,
  });
  // Django answers a successful add with a redirect to the change list.
  if (saved.status() < 300 || saved.status() >= 400) {
    throw new ApiError(
      `Enabling platform certificate generation failed (HTTP ${saved.status()}).`,
      { status: saved.status(), url, body: (await saved.text()).slice(0, 500) },
    );
  }

  if (!(await fetchCertificateGenerationEnabled(adminSession, config, courseKey))) {
    throw new ApiError('Platform certificate generation is still reported disabled after saving.', {
      status: saved.status(),
      url,
      body: '',
    });
  }
  return true;
}
