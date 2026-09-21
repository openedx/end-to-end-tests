import type { Locator, Page, Response } from '@playwright/test';

import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS } from '../../config';
import { AUTHZ_BASE } from '../../api';

/**
 * The console's **Assign Role wizard** (`/authz/assign-role`): who and which
 * role in step one, which course or library in step two.
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
 * - Saving sends `PUT roles/users/` and, on success, returns to the Team
 *   Members table; on a server failure it stays put and shows a toast with a
 *   retry.
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
  readonly toast: Locator;
  readonly toastRetry: Locator;

  constructor(
    readonly page: Page,
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
    this.toastRetry = page.locator(this.s.toastRetry);
  }

  url(): string {
    return `${this.origin}${this.s.assignRolePath}`;
  }

  /** Opens the wizard directly and waits for its first step. */
  async goto(): Promise<void> {
    await this.page.goto(this.url(), { waitUntil: 'domcontentloaded' });
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
   * Retries a failed save from the toast, returning the one request it sends —
   * "exactly one retry" is the assertion these cases are about.
   */
  async retryFromToast(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes(`${AUTHZ_BASE}/roles/users/`) && r.request().method() === 'PUT',
        { timeout: TIMEOUTS.navigation },
      ),
      this.toastRetry.first().click(),
    ]);
    return response;
  }

  /** Leaves the wizard without assigning anything. */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.page.waitForURL((url) => !url.pathname.endsWith('/assign-role'), {
      timeout: TIMEOUTS.navigation,
    });
  }
}
