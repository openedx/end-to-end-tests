import type { FrameLocator, Locator, Page, Response } from '@playwright/test';

import {
  COURSEWARE_SELECTORS,
  TIMEOUTS,
  coursewareBlock,
  sidebarSubsectionRowFor,
  sidebarUnitLink,
  type AppConfig,
} from '../../../config';
import { AdvancedBlock } from './advanced.block';
import { AnnotatableBlock } from './annotatable.block';
import { DoneBlock } from './done.block';
import { WordCloudBlock } from './word-cloud.block';

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
  /** The outline tray's collapse/expand control. */
  readonly outlineToggle: Locator;
  /** The right-hand sidebar triggers; a free enrollment shows only the discussions one. */
  readonly rightSidebarTriggers: Locator;
  /** A right-hand trigger whose sidebar is open. */
  readonly activeRightSidebarTrigger: Locator;
  /** The open discussions sidebar, and the discussions MFE framed in it. */
  readonly discussionsSidebar: Locator;
  readonly discussionsFrame: FrameLocator;
  readonly bookmarkButton: Locator;
  readonly calculatorToggle: Locator;
  readonly calculatorResult: Locator;
  readonly notesToggle: Locator;
  readonly sidebarBackButton: Locator;
  readonly sidebarOutlineHeading: Locator;
  readonly sidebarSections: Locator;
  readonly sidebarSubsections: Locator;
  readonly sidebarCollapse: Locator;
  readonly sidebarExpand: Locator;
  readonly sidebarFullScreen: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.iframe = page.locator(COURSEWARE_SELECTORS.unitIframe);
    this.contentFrame = page.frameLocator(COURSEWARE_SELECTORS.unitIframe);
    this.sidebar = page.locator(COURSEWARE_SELECTORS.sidebar);
    this.outlineToggle = page.locator(COURSEWARE_SELECTORS.outlineToggle);
    this.rightSidebarTriggers = page.locator(COURSEWARE_SELECTORS.rightSidebarTrigger);
    this.activeRightSidebarTrigger = page.locator(COURSEWARE_SELECTORS.activeRightSidebarTrigger);
    this.discussionsSidebar = page.locator(COURSEWARE_SELECTORS.discussionsSidebar);
    this.discussionsFrame = page.frameLocator(COURSEWARE_SELECTORS.discussionsSidebar);
    this.bookmarkButton = page.locator(COURSEWARE_SELECTORS.bookmarkButton);
    this.calculatorToggle = page.locator(COURSEWARE_SELECTORS.calculatorToggle);
    this.calculatorResult = page.locator(COURSEWARE_SELECTORS.calculatorResult);
    this.notesToggle = page.locator(COURSEWARE_SELECTORS.notesToggle);
    this.sidebarBackButton = page.locator(COURSEWARE_SELECTORS.sidebarBackButton);
    this.sidebarOutlineHeading = page.locator(COURSEWARE_SELECTORS.sidebarOutlineHeading);
    this.sidebarSections = page.locator(COURSEWARE_SELECTORS.sidebarSectionRow);
    this.sidebarSubsections = page.locator(COURSEWARE_SELECTORS.sidebarSubsectionItem);
    this.sidebarCollapse = page.locator(COURSEWARE_SELECTORS.sidebarCollapse);
    this.sidebarExpand = page.locator(`${COURSEWARE_SELECTORS.sidebarExpand}:visible`).first();
    this.sidebarFullScreen = page.locator(COURSEWARE_SELECTORS.sidebarFullScreen);
  }

  /**
   * Opens the discussions sidebar from its trigger — the only right-hand trigger
   * on a free enrollment — and waits for the framed discussions MFE to attach.
   * The learning MFE keeps one sidebar open at a time, so this closes the
   * outline tray (TC-00053).
   */
  async openDiscussionsSidebar(): Promise<void> {
    await this.rightSidebarTriggers.first().click();
    await this.discussionsSidebar.waitFor();
  }

  /** Collapses or expands the outline tray from its own control. */
  async toggleOutline(): Promise<void> {
    await this.outlineToggle.click();
  }

  url(courseKey: string, sequentialId: string, unitId: string): string {
    return `${this.config.baseUrls.apps}/learning/course/${courseKey}/${sequentialId}/${unitId}`;
  }

  /** Opens a unit by ID and waits for its content to finish loading. */
  async goto(courseKey: string, sequentialId: string, unitId: string): Promise<void> {
    await this.page.goto(this.url(courseKey, sequentialId, unitId));
    await this.waitForContent();
  }

  /**
   * Waits until the unit iframe's **document** has loaded, not merely attached.
   *
   * The iframe element attaches long before the LMS has finished serving the
   * vertical into it. That gap can make the completion steps flaky under load.
   * The frame's `load` event is the pre-condition we need to reliably test. It
   * fires once the document and its subresources are in, which is when block
   * geometry is stable.
   */
  async waitForContent(): Promise<void> {
    await this.iframe.waitFor();
    const handle = await this.iframe.elementHandle();
    const frame = await handle?.contentFrame();
    await handle?.dispose();
    await frame?.waitForLoadState('load', { timeout: TIMEOUTS.navigation });
  }

  /** One block inside the unit, anchored by its usage ID from the Blocks API. */
  block(blockId: string): Locator {
    return this.contentFrame.locator(coursewareBlock(blockId));
  }

  /** An advanced component in the unit, by its usage ID and block type. */
  advancedBlock(blockId: string, category: string): AdvancedBlock {
    return new AdvancedBlock(this.contentFrame, blockId, category);
  }

  /** An `annotatable` block in the unit. */
  annotatableBlock(blockId: string): AnnotatableBlock {
    return new AnnotatableBlock(this.contentFrame, blockId);
  }

  /** A `word_cloud` block in the unit. */
  wordCloudBlock(blockId: string): WordCloudBlock {
    return new WordCloudBlock(this.page, this.contentFrame, blockId);
  }

  /** A `done` ("Completion") block in the unit. */
  doneBlock(blockId: string): DoneBlock {
    return new DoneBlock(this.page, this.contentFrame, blockId);
  }

  /** The sidebar's link to a unit, anchored by the unit's block ID. */
  sidebarUnitLink(unitId: string): Locator {
    return this.page.locator(sidebarUnitLink(unitId));
  }

  /** The tray's subsection row holding a given unit. */
  subsectionRow(unitId: string): Locator {
    return this.page.locator(sidebarSubsectionRowFor(unitId));
  }

  /** The "every unit complete" marker on the subsection row holding a given unit. */
  subsectionCompletedIcon(unitId: string): Locator {
    return this.subsectionIcon(unitId, COURSEWARE_SELECTORS.completedIcon);
  }

  /** The "some units complete" marker on the subsection row holding a given unit. */
  subsectionPartiallyCompleteIcon(unitId: string): Locator {
    return this.subsectionIcon(unitId, COURSEWARE_SELECTORS.partiallyCompleteIcon);
  }

  /** The "nothing complete yet" marker on the subsection row holding a given unit. */
  subsectionIncompleteIcon(unitId: string): Locator {
    return this.subsectionIcon(unitId, COURSEWARE_SELECTORS.incompleteIcon);
  }

  /**
   * The marker showing a subsection has been worked on at all — partly or fully
   * complete. Completing one unit of several shows the partial state; completing
   * the only unit in a subsection shows the complete one, so coverage about a
   * single unit asserts on either.
   */
  subsectionProgressIcon(unitId: string): Locator {
    return this.subsectionPartiallyCompleteIcon(unitId).or(this.subsectionCompletedIcon(unitId));
  }

  private subsectionIcon(unitId: string, iconSelector: string): Locator {
    return this.subsectionRow(unitId)
      .locator(COURSEWARE_SELECTORS.subsectionTrigger)
      .locator(iconSelector);
  }

  /** Opens a unit by clicking its sidebar entry, as a learner navigating the tray. */
  async openUnitFromSidebar(unitId: string): Promise<void> {
    await this.sidebarUnitLink(unitId).click();
    await this.page.waitForURL((url) => url.pathname.includes(unitId));
    await this.waitForContent();
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

  /** Whether the unit is shown as bookmarked (the button's state, not its label). */
  async isBookmarked(): Promise<boolean> {
    const classes = (await this.bookmarkButton.getAttribute('class')) ?? '';
    return classes.split(/\s+/).includes(COURSEWARE_SELECTORS.bookmarkedState);
  }

  /**
   * Presses the bookmark button and waits for the bookmarks API call it makes —
   * a `POST` to bookmark the unit, a `DELETE` to remove it — returning that
   * response for the spec to check.
   */
  async toggleBookmark(): Promise<Response> {
    const call = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${this.config.baseUrls.lms}/api/bookmarks/v1/bookmarks/`) &&
        ['POST', 'DELETE'].includes(r.request().method()),
    );
    await this.bookmarkButton.click();
    return call;
  }

  /** A subsection's expand/collapse trigger in the tray's section view. */
  subsectionToggle(index: number): Locator {
    return this.sidebarSubsections.nth(index).locator('.collapsible-trigger');
  }

  /** The unit links a subsection lists while it is expanded. */
  subsectionUnits(index: number): Locator {
    return this.sidebarSubsections.nth(index).locator('.collapsible-body a[href]');
  }

  /** Whether a subsection is expanded, as its trigger reports it. */
  async isSubsectionExpanded(index: number): Promise<boolean> {
    return (await this.subsectionToggle(index).getAttribute('aria-expanded')) === 'true';
  }

  /** Switches the tray from its section view to the course outline view. */
  async backToOutline(): Promise<void> {
    await this.sidebarBackButton.click();
    await this.sidebarOutlineHeading.waitFor();
  }

  /** Opens a section's view from the course outline view. */
  async openSection(index: number): Promise<void> {
    await this.sidebarSections.nth(index).click();
    await this.sidebarBackButton.waitFor();
  }

  /** Expands or collapses a subsection in the section view. */
  async toggleSubsection(index: number): Promise<void> {
    const before = await this.isSubsectionExpanded(index);
    await this.subsectionToggle(index).click();
    await this.subsectionToggle(index)
      .and(this.page.locator(`[aria-expanded="${String(!before)}"]`))
      .waitFor();
  }

  /**
   * Collapses the open tray.
   *
   * Workaround for `LEARN-003`: on a phone the course tabs make the page wider
   * than the screen, the emulated mobile browser lays the page out wider to
   * fit it, and Playwright's hit test then finds the tray's heading over its
   * collapse button. When a real click cannot land, the button's own click
   * handler is invoked instead, so the rest of the tray's behaviour stays
   * covered; `sidebar-responsive.spec.ts` keeps a `test.fail` on the overflow
   * itself.
   */
  async collapseSidebar(): Promise<void> {
    try {
      await this.sidebarCollapse.click({ timeout: TIMEOUTS.optionalOverlay });
    } catch {
      await this.sidebarCollapse.dispatchEvent('click');
    }
    await this.sidebar.waitFor({ state: 'detached' });
  }

  /** Re-opens a collapsed tray. */
  async expandSidebar(): Promise<void> {
    await this.sidebarExpand.click();
    await this.sidebar.waitFor();
  }

  /** Moves to the next unit with the unit navigation and waits for it to load. */
  async nextUnit(): Promise<void> {
    const from = this.page.url();
    await this.page.locator(`${COURSEWARE_SELECTORS.nextUnit}:visible`).first().click();
    await this.page.waitForURL((url) => url.toString() !== from);
    await this.waitForContent();
  }

  /** The unit iframe's source — what the content area is showing. */
  async contentSource(): Promise<string | null> {
    return this.iframe.getAttribute('src');
  }

  /**
   * Opens the calculator, evaluates `expression`, and returns what the LMS
   * answered (`GET /calculate`) — the `result` the field then shows.
   */
  async calculate(expression: string): Promise<string> {
    if ((await this.page.locator(COURSEWARE_SELECTORS.calculatorInput).count()) === 0) {
      await this.calculatorToggle.click();
    }
    const input = this.page.locator(COURSEWARE_SELECTORS.calculatorInput);
    await input.fill(expression);
    const answered = this.page.waitForResponse((r) =>
      r.url().startsWith(`${this.config.baseUrls.lms}/calculate?`),
    );
    await this.page.locator(COURSEWARE_SELECTORS.calculatorSubmit).click();
    const body = (await (await answered).json()) as { result?: string };
    return body.result ?? '';
  }

  /**
   * Flips the "Show Notes" switch and waits for the visibility it stores
   * (`PUT …/edxnotes/visibility/`), returning that response.
   */
  async toggleNotes(): Promise<Response> {
    const stored = this.page.waitForResponse(
      (r) => r.url().includes('/edxnotes/visibility/') && r.request().method() === 'PUT',
    );
    await this.notesToggle.click();
    return stored;
  }

  /**
   * Takes a note on the first paragraph of an annotatable component in the unit:
   * selects the paragraph's text, presses the annotator's add button, types the
   * note and saves it. Resolves once the notes service has stored it.
   */
  async takeNote(text: string): Promise<Response> {
    const paragraph = this.contentFrame.locator(`${COURSEWARE_SELECTORS.notesWrapper} p`).first();
    await paragraph.evaluate((element) => {
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      const selection = element.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await this.contentFrame.locator(COURSEWARE_SELECTORS.notesAdder).click();
    await this.contentFrame.locator(COURSEWARE_SELECTORS.notesEditorText).fill(text);
    const stored = this.page.waitForResponse(
      (r) => r.url().includes('/annotations') && r.request().method() === 'POST',
    );
    await this.contentFrame.locator(COURSEWARE_SELECTORS.notesEditorSave).click();
    return stored;
  }
}
