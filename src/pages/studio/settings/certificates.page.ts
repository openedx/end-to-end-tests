import type { Locator, Page } from '@playwright/test';

import { STUDIO_CERTIFICATES_SELECTORS, type AppConfig } from '../../../config';
import { CERTIFICATES_WRITE_PATH, CERTIFICATE_ACTIVATION_PATH, studioOrigin } from '../../../api';

/** One signatory's authored details. */
export interface SignatoryInput {
  readonly name: string;
  readonly title: string;
  readonly organization: string;
}

/**
 * Certificates in the authoring MFE (`/certificates/<key>` on Studio, redirected
 * to the MFE). The page renders its authoring form only when the course has a
 * certificate-bearing mode (see the `certificateCourseMode` fixture / STUDIO-006).
 * Locators and single-surface actions; the spec asserts, against
 * `fetchCertificateConfiguration`.
 */
export class StudioCertificatesPage {
  readonly page: Page;
  readonly newCertificateButton: Locator;
  readonly createForm: Locator;
  readonly addSignatoryButton: Locator;
  readonly activateButton: Locator;
  readonly previewLink: Locator;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    const s = STUDIO_CERTIFICATES_SELECTORS;
    this.newCertificateButton = page.locator(s.newCertificateButton).first();
    this.createForm = page.locator(s.createForm);
    this.addSignatoryButton = page.locator(s.addSignatoryButton);
    this.activateButton = page.locator(s.activateButton);
    this.previewLink = page.locator(s.previewLink);
  }

  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/certificates/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.page.locator(STUDIO_CERTIFICATES_SELECTORS.page).waitFor();
  }

  /**
   * Opens the create form and fills it with `signatories`, adding a signatory
   * block for each beyond the first, then submits. Returns the status of the
   * `POST /certificates` write the MFE makes.
   */
  async createCertificate(
    courseKey: string,
    signatories: readonly SignatoryInput[],
  ): Promise<{ status: number }> {
    const s = STUDIO_CERTIFICATES_SELECTORS;
    await this.newCertificateButton.click();
    await this.createForm.waitFor();

    for (let index = 0; index < signatories.length; index += 1) {
      if (index > 0) {
        await this.addSignatoryButton.click();
        await this.page.locator(s.signatoryName(index)).waitFor();
      }
      const signatory = signatories[index]!;
      await this.page.locator(s.signatoryName(index)).fill(signatory.name);
      await this.page.locator(s.signatoryTitle(index)).fill(signatory.title);
      await this.page.locator(s.signatoryOrganization(index)).fill(signatory.organization);
    }

    const create = this.page.locator(s.createSubmitButton).last();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().includes(`${CERTIFICATES_WRITE_PATH}/${courseKey}`),
      ),
      create.click(),
    ]);
    return { status: response.status() };
  }

  /**
   * Presses "Activate", returning the status of the `POST /certificates/activation`
   * it causes — course-wide activation, so it applies to the course's certificate.
   */
  async activate(courseKey: string): Promise<{ status: number }> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().includes(`${CERTIFICATE_ACTIVATION_PATH}/${courseKey}`),
      ),
      this.activateButton.click(),
    ]);
    return { status: response.status() };
  }
}
