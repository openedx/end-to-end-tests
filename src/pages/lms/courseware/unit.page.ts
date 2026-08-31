import type { FrameLocator, Locator, Page } from '@playwright/test';

import {
  COURSEWARE_SELECTORS,
  TIMEOUTS,
  coursewareBlock,
  sidebarUnitLink,
  type AppConfig,
} from '../../../config';

/**
 * Headroom added when the viewport is grown to fit a tall content block: enough
 * for the block plus the MFE's sticky header and unit heading.
 */
const VIEWPORT_FIT_MARGIN = 240;

/**
 * Ceiling on viewport growth. A block taller than this cannot be brought fully
 * into view, and the caller is told so rather than waiting out a completion that
 * will never arrive.
 */
const MAX_VIEWPORT_HEIGHT = 6000;

/**
 * A single courseware unit in the learning MFE, plus the outline tray beside it.
 *
 * The unit's content lives in one cross-origin iframe (the LMS serves it, the MFE
 * host frames it), so block interaction goes through {@link contentFrame} and the
 * parent document cannot read into it — anything that needs a block's geometry
 * must ask Playwright, not the DOM.
 */
export class UnitPage {
  readonly contentFrame: FrameLocator;
  readonly iframe: Locator;
  readonly sidebar: Locator;
  readonly sidebarToggle: Locator;
  readonly completionIcons: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.iframe = page.locator(COURSEWARE_SELECTORS.unitIframe);
    this.contentFrame = page.frameLocator(COURSEWARE_SELECTORS.unitIframe);
    this.sidebar = page.locator(COURSEWARE_SELECTORS.sidebar);
    this.sidebarToggle = page.locator(COURSEWARE_SELECTORS.sidebarToggle);
    this.completionIcons = page.locator(COURSEWARE_SELECTORS.completionIcon);
  }

  url(courseKey: string, sequentialId: string, unitId: string): string {
    return `${this.config.baseUrls.apps}/learning/course/${courseKey}/${sequentialId}/${unitId}`;
  }

  /** Opens a unit by ID and waits for its content iframe to attach. */
  async goto(courseKey: string, sequentialId: string, unitId: string): Promise<void> {
    await this.page.goto(this.url(courseKey, sequentialId, unitId));
    await this.iframe.waitFor();
  }

  /** One block inside the unit, anchored by its usage ID from the Blocks API. */
  block(blockId: string): Locator {
    return this.contentFrame.locator(coursewareBlock(blockId));
  }

  /** The sidebar's link to a unit, anchored by the unit's block ID. */
  sidebarUnitLink(unitId: string): Locator {
    return this.page.locator(sidebarUnitLink(unitId));
  }

  /** Opens a unit by clicking its sidebar entry, as a learner navigating the tray. */
  async openUnitFromSidebar(unitId: string): Promise<void> {
    await this.sidebarUnitLink(unitId).click();
    await this.page.waitForURL((url) => url.pathname.includes(unitId));
    await this.iframe.waitFor();
  }

  /**
   * Brings a block into view so the platform's "viewed" timer can run, and
   * returns whether it could be shown in full.
   *
   * Two things make this more than a `scrollIntoViewIfNeeded()`:
   *
   * 1. **The platform requires the block to be *entirely* within the viewport.**
   *    A block taller than the window never registers as viewed, so the viewport
   *    is grown to fit it (up to {@link MAX_VIEWPORT_HEIGHT}) rather than leaving
   *    the caller waiting on a completion that cannot happen. Returning `false`
   *    lets the caller report that honestly instead of timing out.
   * 2. **The timer starts from a scroll event.** When the block is already in
   *    view, `scrollIntoViewIfNeeded()` is a no-op and no event fires, so nothing
   *    starts; a one-pixel wheel nudge guarantees an event either way.
   *
   * A block with no box at all (a zero-height, empty block) is left alone: there
   * is nothing to bring into view, and the platform reports it complete anyway.
   */
  async showBlock(blockId: string): Promise<boolean> {
    const block = this.block(blockId);
    // Attached, not visible: a unit's children include zero-height blocks (an
    // empty HTML block renders nothing but still reports completion), and those
    // never satisfy a visibility wait.
    await block.waitFor({ state: 'attached' });

    const box = await block.boundingBox();
    const viewport = this.page.viewportSize();
    let fits = true;

    if (box && viewport && box.height + VIEWPORT_FIT_MARGIN > viewport.height) {
      const wanted = Math.ceil(box.height + VIEWPORT_FIT_MARGIN);
      fits = wanted <= MAX_VIEWPORT_HEIGHT;
      await this.page.setViewportSize({
        width: viewport.width,
        height: Math.min(wanted, MAX_VIEWPORT_HEIGHT),
      });
    }

    await block.scrollIntoViewIfNeeded();
    await this.page.mouse.wheel(0, 1);
    return fits;
  }

  /** Restores the viewport {@link showBlock} may have grown. */
  async resetViewport(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  /**
   * Resolves once `blockId` has reported completion to the platform.
   *
   * Listens for the block's own `publish_completion` call — the state change
   * itself rather than a rendering of it — so there is no sleep and no dependence
   * on the app's dwell delay being any particular length.
   */
  async waitForBlockCompletion(blockId: string): Promise<void> {
    await this.page.waitForResponse(
      (response) =>
        response.url().includes(blockId) &&
        response.url().includes('publish_completion') &&
        response.ok(),
      { timeout: TIMEOUTS.blockCompletion },
    );
  }
}
