import type { FrameLocator, Locator, Page } from '@playwright/test';

import { LTI_BLOCK_SELECTORS, TIMEOUTS } from '../../../config';
import { AdvancedBlock } from './advanced.block';

/**
 * An LTI consumer block (`lti_consumer`) as a learner sees it: an inline launch
 * iframe, or a button that opens the tool in a new window or a modal, with the
 * consent prompt in front of either when the block shares personal data.
 *
 * A launch is the tool being reached; what the tool received is the spec's to
 * read from the tool itself.
 */
export class LtiBlock extends AdvancedBlock {
  readonly launchFrameElement: Locator;
  /** The inline launch iframe once it points at the tool (the launch has started). */
  readonly startedLaunchFrame: Locator;
  /** The inline launch iframe's document, once its `src` is set. */
  readonly launchFrame: FrameLocator;
  readonly newWindowButton: Locator;
  readonly modalButton: Locator;
  readonly notice: Locator;
  readonly consentPrompt: Locator;
  readonly consentConfirm: Locator;
  readonly consentCancel: Locator;

  constructor(
    private readonly page: Page,
    contentFrame: FrameLocator,
    blockId: string,
  ) {
    super(contentFrame, blockId, 'lti_consumer');
    const s = LTI_BLOCK_SELECTORS;
    this.launchFrameElement = this.wrapper.locator(s.launchFrame);
    this.startedLaunchFrame = this.wrapper.locator(s.launchFrameStarted);
    this.launchFrame = this.wrapper.frameLocator(s.launchFrame);
    this.newWindowButton = this.wrapper.locator(s.newWindowButton);
    this.modalButton = this.wrapper.locator(s.modalButton);
    this.notice = this.wrapper.locator(s.notice);
    this.consentPrompt = this.wrapper.locator(s.consentPrompt);
    this.consentConfirm = this.consentPrompt.locator(s.consentConfirm);
    this.consentCancel = this.consentPrompt.locator(s.consentCancel);
  }

  /**
   * Waits for the inline launch to have been started: the block's script sets
   * the iframe's `src` (the tool's login URL), which it does at once unless the
   * block asks for consent first.
   */
  async waitForInlineLaunch(): Promise<void> {
    await this.startedLaunchFrame.waitFor({
      state: 'attached',
      timeout: TIMEOUTS.navigation,
    });
  }

  /**
   * Clicks the new-window launch button without waiting for a window: with
   * consent asked, it opens the prompt instead (see {@link agree} / {@link decline}).
   */
  async requestNewWindowLaunch(): Promise<void> {
    await this.newWindowButton.click();
  }

  /** Answers the consent prompt with OK. */
  async agree(): Promise<void> {
    await this.consentConfirm.click();
  }

  /**
   * Answers a new-window launch's consent prompt with OK and returns the window
   * the tool then opens in, once its document has loaded.
   */
  async agreeAndOpenWindow(): Promise<Page> {
    const popup = this.page.waitForEvent('popup', { timeout: TIMEOUTS.navigation });
    await this.agree();
    const window = await popup;
    await window.waitForLoadState('load', { timeout: TIMEOUTS.navigation });
    return window;
  }

  /** Answers the consent prompt with Cancel (modal and new-window targets only), and waits for it to close. */
  async decline(): Promise<void> {
    await this.consentCancel.click();
    await this.consentPrompt.waitFor({ state: 'hidden', timeout: TIMEOUTS.expect });
  }

  /**
   * Opens the tool from the new-window button and returns the window, once its
   * document has loaded. With consent asked, the button only opens the prompt:
   * pass `consent: 'confirm'` to agree in the same step.
   */
  async launchInNewWindow(options: { readonly consent?: 'confirm' } = {}): Promise<Page> {
    const popup = this.page.waitForEvent('popup', { timeout: TIMEOUTS.navigation });
    await this.newWindowButton.click();
    if (options.consent === 'confirm') await this.consentConfirm.click();
    const window = await popup;
    await window.waitForLoadState('load', { timeout: TIMEOUTS.navigation });
    return window;
  }
}
