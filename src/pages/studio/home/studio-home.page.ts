import type { Locator, Page } from '@playwright/test';

import { STUDIO_HOME_SELECTORS, type AppConfig } from '../../../config';
import { studioOrigin } from '../../../api';

/**
 * Studio Home (`frontend-app-course-authoring`): the course list, its controls,
 * the "New course" form and the course-creator request panel. Locators and
 * single-surface actions only — specs own the assertions.
 *
 * Reached at the Studio `/home/` route, which redirects to the MFE. The MFE's
 * mount path differs by release (`/authoring` on main, `/course-authoring` on
 * redwood), so nothing here builds an MFE URL: the page follows the platform's
 * redirect and waits for the header to render.
 */
export class StudioHomePage {
  readonly header: Locator;
  readonly newCourseButton: Locator;
  readonly createCourseForm: Locator;
  readonly courseNameInput: Locator;
  readonly orgDropdownToggle: Locator;
  readonly orgInput: Locator;
  readonly courseNumberInput: Locator;
  readonly courseRunInput: Locator;
  readonly createButton: Locator;
  readonly cancelButton: Locator;
  readonly searchInput: Locator;
  readonly paginationInfo: Locator;
  readonly courseCards: Locator;
  readonly creatorStatusPanel: Locator;
  readonly requestCreatorAccessButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    const s = STUDIO_HOME_SELECTORS;
    this.header = page.locator(s.header);
    this.newCourseButton = page.locator(s.newCourseButton);
    this.createCourseForm = page.locator(s.createCourseForm);
    this.courseNameInput = page.locator(s.courseNameInput);
    this.orgDropdownToggle = page.locator(s.orgDropdownToggle);
    this.orgInput = page.locator(s.orgInput);
    this.courseNumberInput = page.locator(s.courseNumberInput);
    this.courseRunInput = page.locator(s.courseRunInput);
    this.createButton = page.locator(s.createButton);
    this.cancelButton = page.locator(s.cancelButton);
    this.searchInput = page.locator(s.searchInput);
    this.paginationInfo = page.locator(s.paginationInfo);
    this.courseCards = page.locator(s.courseCard).filter({ has: page.locator(s.courseCardLink) });
    this.creatorStatusPanel = page.locator(s.creatorStatusPanel);
    this.requestCreatorAccessButton = page.locator(s.requestCreatorAccessButton);
  }

  /** The Studio URL a user types; the platform redirects it to the MFE. */
  get url(): string {
    return `${studioOrigin(this.config)}/home/`;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.header.waitFor();
  }

  /** The list card for one course, anchored by the key in its name link. */
  courseCard(courseKey: string): Locator {
    return this.courseCards.filter({
      has: this.page.locator(`a[href*="/course/${courseKey}"]`),
    });
  }

  /** The course-name link on a course's card. */
  courseCardLink(courseKey: string): Locator {
    return this.courseCard(courseKey).locator(STUDIO_HOME_SELECTORS.courseCardLink);
  }

  /** Reveals the "Create a new course" form. */
  async openNewCourseForm(): Promise<void> {
    await this.newCourseButton.click();
    await this.createCourseForm.waitFor();
  }

  /**
   * Fills the org field, whichever control the MFE rendered for this session:
   * the allowed-orgs dropdown (new organizations disallowed) or the free-text
   * field with suggestions (allowed). A brand-new org only works with the latter;
   * with the dropdown the org must be one of its entries.
   */
  async chooseOrganization(org: string): Promise<void> {
    if (await this.orgInput.count()) {
      await this.orgInput.fill(org);
      // Typing into the field opens its suggestion list; pick the exact match if
      // the org exists, otherwise the typed value stands as a new org.
      const exact = this.page.locator(`${STUDIO_HOME_SELECTORS.orgSuggestion}[value="${org}"]`);
      if (await exact.count()) {
        await exact.click();
      }
      return;
    }
    await this.orgDropdownToggle.click();
    await this.page
      .locator(STUDIO_HOME_SELECTORS.orgDropdownItem)
      .filter({ hasText: new RegExp(`^${org}$`) })
      .click();
  }

  /** Fills every field of the open form; does not submit. */
  async fillNewCourseForm(course: {
    displayName: string;
    org: string;
    number: string;
    run: string;
  }): Promise<void> {
    await this.courseNameInput.fill(course.displayName);
    await this.chooseOrganization(course.org);
    await this.courseNumberInput.fill(course.number);
    await this.courseRunInput.fill(course.run);
  }

  /**
   * Submits the form and returns Studio's answer to the `POST /course/` it
   * causes, so the caller can judge the outcome before the MFE navigates away.
   */
  async submitNewCourseForm(): Promise<{ status: number; body: string }> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/course/',
      ),
      this.createButton.click(),
    ]);
    return { status: response.status(), body: await response.text() };
  }

  /** Opens the course-creator panel if it is collapsed (it starts collapsed). */
  async expandCreatorStatusPanel(): Promise<void> {
    const toggle = this.page.locator(STUDIO_HOME_SELECTORS.creatorStatusPanelToggle);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await this.requestCreatorAccessButton.waitFor();
  }

  /**
   * Clicks "Request the ability to create courses" and waits for Studio to
   * acknowledge the request it posts.
   */
  async requestCreatorAccess(): Promise<{ status: number }> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/request_course_creator'),
      ),
      this.requestCreatorAccessButton.click(),
    ]);
    return { status: response.status() };
  }

  /** Searches the course list and waits for the list request it triggers. */
  async search(term: string): Promise<void> {
    await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('/home/courses') && r.url().includes(encodeURIComponent(term)),
      ),
      this.searchInput.fill(term),
    ]);
  }
}
