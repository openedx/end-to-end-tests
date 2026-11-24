import type { Locator, Page, Response } from '@playwright/test';

import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS, type AppConfig } from '../../config';
import { AUTHZ_BASE } from '../../api';
import { AdminConsolePage } from './console.page';

/**
 * The console's **Assign Role wizard**: who and which role in step one, which
 * course or library in step two.
 *
 * One wizard, two hosts. `verawood` serves it at its own route
 * (`/authz/assign-role`) and returns to the Team Members table when it is
 * done. From frontend-app-admin-console#283 (`rbac-console-next`) it is a
 * full-screen modal over the page that opened it — the console or an account's
 * audit view — and that route no longer exists. {@link open} takes whichever
 * the target declares; everything inside the wizard is anchored the same way
 * on both.
 *
 * What the probe established, and what this object is shaped around:
 *
 * - The users field is a **textarea** taking usernames or e-mails separated by
 *   commas, and the role radios carry the **role key** as their `value` — the
 *   one part of this surface that needs no structural guessing.
 * - Validation happens on **advancing**, not while typing: the wizard posts
 *   `users/validate/` when the step is left, and an unrecognised entry keeps it
 *   on step one with an error on the stepper and the typed text intact.
 * - Step two's scope picker is the only control the app gives a test id
 *   (`toggle-scope-<key>`).
 * - Saving sends `PUT roles/users/` and, on success, leaves the wizard (back
 *   to the Team Members table, or the modal closing over it); on a server
 *   failure it stays put and reports the failure with a retry — a toast on
 *   `verawood`, an alert inside the modal after it ({@link saveFailure}).
 */
export class AssignRoleWizard {
  private readonly s = ADMIN_CONSOLE_SELECTORS;

  readonly usersInput: Locator;
  readonly roleRadios: Locator;
  readonly steps: Locator;
  readonly stepError: Locator;
  readonly usersHighlight: Locator;
  readonly scopeToggles: Locator;
  readonly advanceButton: Locator;
  readonly cancelButton: Locator;
  /** The success message a completed save raises. */
  readonly toast: Locator;
  /** The report of a save the server refused, wherever this console puts it. */
  readonly saveFailure: Locator;
  readonly saveFailureRetry: Locator;
  private readonly console: AdminConsolePage;

  constructor(
    readonly page: Page,
    private readonly config: AppConfig,
    /** The console's origin, e.g. `http://apps.example.org/admin-console`. */
    readonly origin: string,
  ) {
    this.usersInput = page.locator(this.s.wizardUsersInput);
    this.roleRadios = page.locator(this.s.wizardRoleRadios);
    this.steps = page.locator(this.s.wizardStep);
    this.stepError = page.locator(this.s.wizardStepError);
    this.usersHighlight = page.locator(this.s.wizardUsersHighlight);
    this.scopeToggles = page.locator(this.s.wizardScopeToggles);
    this.advanceButton = page.locator(this.s.wizardAdvance).last();
    this.cancelButton = page.locator(this.s.wizardCancel).last();
    this.toast = page.locator(this.s.toast);
    this.saveFailure = page.locator(this.s.wizardSaveFailure);
    this.saveFailureRetry = page.locator(this.s.wizardSaveFailureRetry);
    this.console = new AdminConsolePage(page, config, origin);
  }

  /** Whether the wizard is a modal over the console rather than a route of its own. */
  get isModal(): boolean {
    return this.config.capabilities.has('rbac-console-next');
  }

  /**
   * How many failure reports are on screen once a failed save has been retried
   * and has failed again. `verawood` leaves the first toast up and adds one for
   * the retry, so only **two** show the retry's failure was reported. The modal
   * clears its alert as the retry starts and raises it again: **one**, and it
   * is the retry's.
   */
  get saveFailuresAfterRetry(): number {
    return this.isModal ? 1 : 2;
  }

  /**
   * Opens the wizard from scratch and waits for its first step: through the
   * console's Assign Role button where the wizard is a modal, at its own route
   * where it still has one.
   */
  async open(): Promise<void> {
    if (this.isModal) {
      await this.page.goto(this.console.url(), { waitUntil: 'domcontentloaded' });
      // The button renders only once the console knows the viewer may manage
      // a team, so its arrival is also the console having loaded.
      await this.console.assignRoleButton.click({ timeout: TIMEOUTS.navigation });
    } else {
      await this.page.goto(`${this.origin}${this.s.assignRolePath}`, {
        waitUntil: 'domcontentloaded',
      });
    }
    await this.usersInput.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
  }

  /** The radio for one role, by its key (`library_author`, `course_staff`, …). */
  roleRadio(role: string): Locator {
    return this.page.locator(this.s.wizardRoleRadio(role));
  }

  /** One scope's toggle in step two, by course or library key. */
  scopeToggle(scope: string): Locator {
    return this.page.locator(this.s.wizardScopeToggle(scope));
  }

  /** Fills step one: the identifiers exactly as given, and a role by key. */
  async fillWhoAndRole(users: string, role: string): Promise<void> {
    await this.usersInput.fill(users);
    await this.roleRadio(role).check();
  }

  /**
   * Advances from step one, returning the validation the wizard ran. Use
   * {@link stepError} afterwards to see whether it refused to move on.
   */
  async validateAndAdvance(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes(`${AUTHZ_BASE}/users/validate/`) && r.request().method() === 'POST',
        { timeout: TIMEOUTS.navigation },
      ),
      this.advanceButton.click(),
    ]);
    return response;
  }

  /** Whether the wizard is still on step one (its users field is on screen). */
  async onFirstStep(): Promise<boolean> {
    return (await this.usersInput.count()) > 0;
  }

  /** Picks a scope in step two. */
  async chooseScope(scope: string): Promise<void> {
    await this.scopeToggle(scope).first().click();
  }

  /** Saves, returning the assignment the console sent (a 207 multi-status). */
  async save(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes(`${AUTHZ_BASE}/roles/users/`) && r.request().method() === 'PUT',
        { timeout: TIMEOUTS.navigation },
      ),
      this.advanceButton.click(),
    ]);
    return response;
  }

  /**
   * Retries a failed save from its report, returning the one request it sends —
   * "exactly one retry" is the assertion these cases are about.
   */
  async retryFailedSave(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes(`${AUTHZ_BASE}/roles/users/`) && r.request().method() === 'PUT',
        { timeout: TIMEOUTS.navigation },
      ),
      this.saveFailureRetry.first().click(),
    ]);
    return response;
  }

  /**
   * Leaves the wizard without assigning anything, and waits for it to be gone:
   * the route left behind, or the modal closed.
   */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.usersInput.waitFor({ state: 'hidden', timeout: TIMEOUTS.navigation });
  }

  /**
   * Leaves the wizard from its scope step without assigning anything. The
   * modal wizard (`rbac-console-next`) offers Back there in Cancel's place, so
   * leaving is Back and then step one's Cancel. The routed wizard (`verawood`)
   * is handled either way: if the same control is a Cancel the route is left
   * at once, and if it is a Back, step one's Cancel follows.
   */
  async cancelFromScopeStep(): Promise<void> {
    await this.cancelButton.click();
    // Settled to a boolean either way, so the race's loser cannot reject later.
    const backOnStepOne = this.usersInput
      .waitFor({ state: 'visible', timeout: TIMEOUTS.navigation })
      .then(
        () => true,
        () => false,
      );
    if (this.isModal) {
      await backOnStepOne;
      await this.cancel();
      return;
    }
    const routeLeft = this.page
      .waitForURL((url) => !url.pathname.endsWith(this.s.assignRolePath), {
        timeout: TIMEOUTS.navigation,
      })
      .then(
        () => false,
        () => false,
      );
    if (await Promise.race([backOnStepOne, routeLeft])) await this.cancel();
    else await this.usersInput.waitFor({ state: 'hidden', timeout: TIMEOUTS.navigation });
  }
}
