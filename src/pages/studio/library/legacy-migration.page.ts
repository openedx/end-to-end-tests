import type { Locator, Page, Response } from '@playwright/test';

import { MIGRATOR_PATH } from '../../../api';
import {
  LEGACY_MIGRATION_SELECTORS,
  TIMEOUTS,
  legacyMigrationPath,
  type AppConfig,
} from '../../../config';
import { waitForWrite } from '../wait-for-write';

/**
 * The legacy-library migration stepper (`/libraries-v1/migrate`): pick one or
 * more legacy libraries, pick the destination v2 library, confirm. Confirming
 * queues the migration (`POST migrations/` for one source, `bulk_migration/`
 * for several) and navigates to the destination library with
 * `?migration_task=<uuid>`.
 */
export class LegacyMigrationPage {
  private readonly s = LEGACY_MIGRATION_SELECTORS;
  readonly steps: Locator;
  readonly activeStep: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.steps = page.locator(this.s.stepperStep);
    this.activeStep = page.locator(this.s.activeStep);
  }

  async goto(): Promise<void> {
    await this.page.goto(legacyMigrationPath(this.config));
    await this.steps.first().waitFor();
  }

  /** Narrows the legacy-library list to `term` (our own library's name). */
  async search(term: string): Promise<void> {
    await this.page.locator(this.s.searchInput).fill(term);
  }

  /** Ticks the legacy library whose card shows `displayName`. */
  async selectLegacyLibrary(displayName: string): Promise<void> {
    await this.page
      .locator('[role="group"] > *, .pgn__form-control-set > *')
      .filter({ hasText: displayName })
      .first()
      .locator('input[type="checkbox"]')
      .check();
  }

  /** "Next" — to the destination step. */
  async next(): Promise<void> {
    await this.page.locator(this.s.footerPrimaryButton).last().click();
  }

  /** Picks the destination v2 library by key. */
  async selectDestination(libraryKey: string): Promise<void> {
    await this.page.locator(this.s.destinationRadio(libraryKey)).check();
  }

  /** "Confirm", waiting for the migration request; returns its response. */
  async confirm(): Promise<Response> {
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().includes(MIGRATOR_PATH),
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.page.locator(this.s.footerPrimaryButton).last().click(),
    );
  }
}
