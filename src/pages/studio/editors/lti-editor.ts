import type { Frame } from '@playwright/test';

import { LTI_EDITOR_SELECTORS, TIMEOUTS } from '../../../config';

/** What the Setup and Advantage Settings steps ask for an LTI 1.3 tool. */
export interface Lti13EditorValues {
  readonly launchUrl: string;
  readonly oidcUrl: string;
  /** The tool's RSA public key (PEM), entered in "Tool Public Key" mode. */
  readonly toolPublicKey: string;
}

/**
 * The LTI consumer's own editor (xblock-lti-consumer's `studio_view`), inside
 * the legacy editor dialog's frame (`StudioUnitPage.openLegacyEditor`). It is a
 * three-step form — Setup, Advantage Settings, Review Options — walked with
 * Next; Save appears on the last step and is the unit page's to click
 * (`saveLegacyEditor`, handler `submit_studio_edits`). Its labels are
 * localized, so every control is anchored by the XBlock's field id.
 */
export class StudioLtiEditor {
  private readonly s = LTI_EDITOR_SELECTORS;

  constructor(readonly frame: Frame) {}

  /**
   * Fills Setup (LTI 1.3, launch and login URLs) and Advantage Settings (the
   * tool's public key, the services left at their defaults), and moves on to
   * Review Options, where Save is.
   */
  async configureLti13(values: Lti13EditorValues): Promise<void> {
    await this.frame.locator(this.s.versionOption('lti_1p3')).check();
    await this.frame.locator(this.s.field('lti_1p3_launch_url')).fill(values.launchUrl);
    await this.frame.locator(this.s.field('lti_1p3_oidc_url')).fill(values.oidcUrl);
    await this.frame.locator(this.s.next).click();

    await this.frame.locator(this.s.keyModeOption('public_key')).check();
    await this.frame.locator(this.s.field('lti_1p3_tool_public_key')).fill(values.toolPublicKey);
    await this.frame.locator(this.s.next).click();

    await this.frame.locator(this.s.save).waitFor();
  }

  /**
   * Points the block at a reusable configuration on Setup — "Configuration
   * Type" set to the external store (offered while the course has the external
   * configuration flag on) and its filter key (`lti_store:<slug>`) entered —
   * waits for the editor to resolve the configuration's LTI version, and moves
   * on to Review Options, where Save is. The tool's URLs and keys come from the
   * configuration, so the block asks for none of them.
   */
  async useReusableConfiguration(filterKey: string): Promise<void> {
    await this.frame.locator(this.s.field('config_type')).selectOption('external');
    const resolved = this.frame
      .page()
      .waitForResponse((r) => r.url().includes('/handler/resolve_external_config_version'), {
        timeout: TIMEOUTS.studioSettingsSave,
      });
    const input = this.frame.locator(this.s.field('external_config'));
    await input.fill(filterKey);
    // The editor resolves the configuration when the field commits (its change event).
    await input.blur();
    await resolved;
    await this.frame.locator(this.s.next).click();
    await this.frame.locator(this.s.save).waitFor();
  }
}
