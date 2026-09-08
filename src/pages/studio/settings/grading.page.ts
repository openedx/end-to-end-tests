import type { Locator, Page } from '@playwright/test';

import { STUDIO_GRADING_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { COURSE_GRADING_PATH, studioOrigin } from '../../../api';

/** One assignment type as the page's card takes it. */
export interface AssignmentTypeFields {
  readonly name: string;
  readonly shortLabel: string;
  /** Percent of the total grade, 0–100. */
  readonly weight: number;
  readonly minCount: number;
  readonly dropCount: number;
}

/**
 * Grading in the authoring MFE (`/settings/grading/<key>` on Studio, redirected
 * to the MFE): the grade-range editor, the grace period and the assignment
 * types. Locators and single-surface actions; the spec asserts, against
 * `fetchGradingPolicy`.
 */
export class StudioGradingPage {
  readonly scale: Locator;
  readonly addSegmentButton: Locator;
  /** The real grade segments, top grade first, failing bucket last. */
  readonly segments: Locator;
  readonly segmentHandles: Locator;
  readonly gracePeriod: Locator;
  readonly assignmentTypes: Locator;
  readonly addAssignmentTypeButton: Locator;
  readonly saveBar: Locator;
  readonly saveButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    const s = STUDIO_GRADING_SELECTORS;
    this.scale = page.locator(s.scale);
    this.addSegmentButton = page.locator(s.addSegmentButton);
    this.segments = page.locator(s.segment);
    this.segmentHandles = page.locator(s.segmentHandle);
    this.gracePeriod = page.locator(s.gracePeriod);
    this.assignmentTypes = page.locator(s.assignmentType);
    this.addAssignmentTypeButton = page.locator(s.addAssignmentTypeButton);
    this.saveBar = page.locator(s.saveBar);
    this.saveButton = page.locator(`${s.saveBar} .pgn__stateful-btn`);
  }

  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/settings/grading/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.gracePeriod.waitFor();
  }

  /** A segment's name field. */
  segmentName(segment: Locator): Locator {
    return segment.locator(STUDIO_GRADING_SELECTORS.segmentNameInput);
  }

  /**
   * The names of the graded (non-failing) segments as the editor shows them, top
   * grade first — what `grade_cutoffs` should have as its keys once saved.
   */
  async gradedSegmentNames(): Promise<string[]> {
    const names: string[] = [];
    for (const segment of await this.segments.all()) {
      const input = this.segmentName(segment);
      if (await input.isDisabled()) continue;
      names.push(await input.inputValue());
    }
    return names;
  }

  /** Adds one grade segment (the editor renames the segments to letters). */
  async addSegment(): Promise<void> {
    const before = await this.segments.count();
    await this.addSegmentButton.click();
    await this.segments.nth(before).waitFor();
  }

  /** Removes the segment at `index` (top grade is 0); the failing bucket has no remove. */
  async removeSegment(index: number): Promise<void> {
    const before = await this.segments.count();
    const segment = this.segments.nth(index);
    // The "Remove" link is revealed on hover.
    await segment.hover();
    await segment.locator(STUDIO_GRADING_SELECTORS.segmentRemoveButton).click();
    await this.segments.nth(before - 1).waitFor({ state: 'detached' });
  }

  /**
   * Drags the boundary handle currently at `fromPercent` to `toPercent` of the
   * scale's width, the way an author does with the mouse, and returns the
   * handle's `aria-valuenow` afterwards — the value the editor settled on, which
   * the spec compares with the saved cutoff.
   */
  async dragCutoff(fromPercent: number, toPercent: number): Promise<number> {
    const handle = this.page.locator(
      `${STUDIO_GRADING_SELECTORS.segmentHandle}[aria-valuenow="${fromPercent}"]`,
    );
    const scaleBox = await this.scale
      .locator(':scope > .grading-scale-segments-and-ticks')
      .boundingBox();
    const handleBox = await handle.boundingBox();
    if (!scaleBox || !handleBox) {
      throw new Error(`No grade boundary handle at ${fromPercent}% to drag.`);
    }
    // The editor re-renders its handles on every move, so neither the locator
    // (keyed on the old value) nor the node survives the drag. The moved handle
    // is the one whose value is new to the set afterwards.
    const before = await this.handleValues();
    const startX = handleBox.x + handleBox.width / 2;
    const y = handleBox.y + handleBox.height / 2;
    const endX = scaleBox.x + (scaleBox.width * toPercent) / 100;
    // Press, nudge, then travel: the editor arms its drag on the first move
    // after the press, so a lone jump to the destination can be dropped.
    await handle.hover();
    await this.page.mouse.down();
    await this.page.mouse.move(startX + 2, y);
    await this.page.mouse.move(endX, y, { steps: 20 });
    await this.page.mouse.up();
    const after = await this.handleValues();
    const moved = after.find((value) => !before.includes(value));
    return moved ?? fromPercent;
  }

  /** `aria-valuenow` of every draggable boundary handle, as integers. */
  private async handleValues(): Promise<number[]> {
    return this.segmentHandles.evaluateAll((handles) =>
      handles.map((handle) => Number(handle.getAttribute('aria-valuenow'))),
    );
  }

  async setGracePeriod(hhmm: string): Promise<void> {
    await this.gracePeriod.fill(hhmm);
    await this.gracePeriod.press('Tab');
  }

  /** The assignment-type card whose name field holds `name` (test-supplied data). */
  assignmentType(name: string): Locator {
    return this.assignmentTypes.filter({
      has: this.page.locator(`${STUDIO_GRADING_SELECTORS.assignmentTypeName}[value="${name}"]`),
    });
  }

  /** Fills every field of one assignment-type card. */
  async fillAssignmentType(card: Locator, fields: AssignmentTypeFields): Promise<void> {
    const s = STUDIO_GRADING_SELECTORS;
    await card.locator(s.assignmentTypeName).fill(fields.name);
    await card.locator(s.assignmentShortLabel).fill(fields.shortLabel);
    await card.locator(s.assignmentWeight).fill(String(fields.weight));
    await card.locator(s.assignmentMinCount).fill(String(fields.minCount));
    await card.locator(s.assignmentDropCount).fill(String(fields.dropCount));
    await card.locator(s.assignmentDropCount).press('Tab');
  }

  /** Presses "New assignment type" and fills the empty card it appends. */
  async addAssignmentType(fields: AssignmentTypeFields): Promise<void> {
    const before = await this.assignmentTypes.count();
    await this.addAssignmentTypeButton.click();
    const card = this.assignmentTypes.nth(before);
    await card.waitFor();
    await this.fillAssignmentType(card, fields);
  }

  /** Presses "Delete" on the card named `name`. */
  async deleteAssignmentType(name: string): Promise<void> {
    const card = this.assignmentType(name);
    await card.locator(STUDIO_GRADING_SELECTORS.assignmentDeleteButton).click();
    await card.waitFor({ state: 'detached' });
  }

  /**
   * Presses "Save changes" and returns the status of the resulting
   * `POST course_grading`, which is what decides whether the save took.
   */
  async save(courseKey: string): Promise<{ status: number }> {
    await this.saveButton.waitFor({ state: 'visible' });
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().includes(`${COURSE_GRADING_PATH}/${courseKey}`),
        { timeout: TIMEOUTS.studioSettingsSave },
      ),
      this.saveButton.click(),
    ]);
    return { status: response.status() };
  }
}
