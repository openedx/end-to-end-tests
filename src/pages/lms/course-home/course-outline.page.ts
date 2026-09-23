import type { Locator, Page } from '@playwright/test';

import type { FrameLocator } from '@playwright/test';

import {
  COURSE_HOME_SELECTORS,
  TIMEOUTS,
  courseHomeFragmentHolding,
  courseToolLink,
  subsectionEffort,
  type AppConfig,
} from '../../../config';

/**
 * Course home: the outline tab a learner lands on. Locators and single-surface
 * actions only — specs own the assertions.
 */
export class CourseOutlinePage {
  readonly sectionTriggers: Locator;
  readonly expandedSectionTriggers: Locator;
  readonly expandAllToggle: Locator;
  readonly startResumeCard: Locator;
  readonly tourDialog: Locator;
  readonly modalBackdrop: Locator;
  readonly resumeLink: Locator;
  readonly tourCheckpoint: Locator;
  readonly tourLaunch: Locator;
  readonly courseTabs: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.sectionTriggers = page.locator(COURSE_HOME_SELECTORS.sectionTrigger);
    this.expandedSectionTriggers = page.locator(COURSE_HOME_SELECTORS.expandedSectionTrigger);
    this.expandAllToggle = page.locator(COURSE_HOME_SELECTORS.expandAllToggle);
    this.startResumeCard = page.locator(COURSE_HOME_SELECTORS.startResumeCard);
    this.tourDialog = page.locator(COURSE_HOME_SELECTORS.tourDialog);
    this.modalBackdrop = page.locator(COURSE_HOME_SELECTORS.modalBackdrop);
    this.resumeLink = page.locator(COURSE_HOME_SELECTORS.resumeLink);
    this.tourCheckpoint = page.locator(COURSE_HOME_SELECTORS.tourCheckpoint);
    this.tourLaunch = page.locator(COURSE_HOME_SELECTORS.tourLaunch);
    this.courseTabs = page.locator(COURSE_HOME_SELECTORS.courseTab);
  }

  url(courseKey: string): string {
    return `${this.config.baseUrls.apps}/learning/course/${courseKey}/home`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.sectionTriggers.first().waitFor();
  }

  /**
   * Opens the course home and waits for its tabs, for a course whose outline
   * may hold no section the learner can see yet (a fresh worker course): the
   * tabs render either way, the section list does not.
   */
  async gotoHome(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.courseTabs.first().waitFor({ timeout: TIMEOUTS.navigation });
  }

  /**
   * Dismisses the first-visit tour modal if it is showing.
   *
   * Escape rather than a button: the modal's two footer buttons are told apart
   * only by Paragon variant classes and their labels, whereas Escape is the
   * platform's own dismissal for a Paragon modal and is the same in every
   * language. Waiting for the backdrop to go is what makes the rest of the page
   * clickable — this is the modal the source suite worked around with
   * `force: true`.
   */
  async dismissTourDialog(): Promise<void> {
    // The modal mounts *after* the outline first renders, so testing for it the
    // moment the page arrives finds nothing and leaves it to appear later and
    // swallow the next click. It is also absent altogether for a returning user,
    // so the only decidable check is a bounded wait for it: present within the
    // budget means dismiss it, otherwise there is nothing to dismiss.
    try {
      await this.tourDialog.waitFor({ state: 'visible', timeout: TIMEOUTS.optionalOverlay });
    } catch {
      return;
    }
    await this.page.keyboard.press('Escape');
    await this.tourDialog.waitFor({ state: 'detached' });
    await this.modalBackdrop.waitFor({ state: 'detached' });
  }

  /**
   * Toggles every outline section open or closed with the one control.
   *
   * Waits the modal backdrop out first: it covers the whole page while the
   * first-visit modal is up, and a click aimed at the outline lands on it instead.
   */
  async toggleAllSections(): Promise<void> {
    await this.modalBackdrop.waitFor({ state: 'detached' });
    await this.expandAllToggle.click();
  }

  /** A course tool's link, by the URL the outline API gives the tool. */
  toolLink(url: string): Locator {
    return this.page.locator(courseToolLink(url));
  }

  /** Waits for the first-visit tour dialog and begins the tour from it. */
  async beginTour(): Promise<void> {
    await this.page.locator(COURSE_HOME_SELECTORS.tourBegin).click();
    await this.tourCheckpoint.waitFor();
  }

  /**
   * Advances through every step of the running tour and returns how many steps
   * there were. Ending the tour stores its state (`PATCH user_tours`), which is
   * waited for; the step count is read, never assumed.
   */
  async finishTour(): Promise<number> {
    const stored = this.page.waitForResponse(
      (r) => r.url().includes('/api/user_tours/v1/') && r.request().method() === 'PATCH' && r.ok(),
    );
    let steps = 0;
    while ((await this.tourCheckpoint.count()) > 0) {
      const step = await this.tourCheckpoint.innerHTML();
      await this.page.locator(COURSE_HOME_SELECTORS.tourAdvance).click();
      steps += 1;
      // The next checkpoint replaces this one in place; wait for the change.
      await this.page.waitForFunction(
        ([selector, previous]) => {
          const current = document.querySelector(selector as string);
          return current === null || current.innerHTML !== previous;
        },
        [COURSE_HOME_SELECTORS.tourCheckpoint, step],
      );
    }
    await stored;
    return steps;
  }

  /** Relaunches the tour from the sidebar's "Launch tour". */
  async launchTour(): Promise<void> {
    await this.tourLaunch.click();
    await this.tourCheckpoint.waitFor();
  }

  /** Follows the Begin/Resume link and waits for the courseware it leads to. */
  async resume(): Promise<void> {
    await this.resumeLink.click();
    await this.page.waitForURL((url) => url.pathname.includes('/block-v1:'));
  }

  /** The absolute URLs the course's tabs link to, in order. */
  async tabUrls(): Promise<readonly string[]> {
    await this.courseTabs.first().waitFor();
    const base = this.page.url();
    return (
      await this.courseTabs.evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('href') ?? ''))
    ).map((href) => new URL(href, base).toString());
  }

  /** The course-home fragment (handouts, welcome message) whose HTML holds `text`. */
  fragmentHolding(text: string): { readonly frame: Locator; readonly content: FrameLocator } {
    const selector = courseHomeFragmentHolding(text);
    return { frame: this.page.locator(selector), content: this.page.frameLocator(selector) };
  }

  /**
   * The minutes of the effort estimate shown beside a subsection, read as the
   * number it displays ("5 min"), or `undefined` when none is shown. Expands
   * every section first, so the subsection is listed.
   */
  async effortMinutes(sequenceId: string): Promise<number | undefined> {
    const effort = this.page.locator(subsectionEffort(sequenceId));
    if ((await this.expandedSectionTriggers.count()) < (await this.sectionTriggers.count())) {
      await this.toggleAllSections();
    }
    await this.page.locator(`a[href$="/${sequenceId}"]`).waitFor();
    if ((await effort.count()) === 0) return undefined;
    const digits = /\d+/.exec(await effort.first().innerText());
    return digits === null ? undefined : Number(digits[0]);
  }
}
