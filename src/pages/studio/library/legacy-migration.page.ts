import type { Locator, Page } from '@playwright/test';

import { MIGRATOR_PATH, type MigrationTask } from '../../../api';
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
      .locator(this.s.legacyLibraryCard)
      .filter({ hasText: displayName })
      .first()
      .locator(this.s.legacyLibraryCardCheckbox)
      .check();
  }

  /** "Next" — to the destination step. */
  async next(): Promise<void> {
    await this.page.locator(this.s.footerPrimaryButton).last().click();
  }

  /** Picks the destination v2 library by key. */
  async selectDestination(libraryKey: string): Promise<void> {
    // The destination list paginates (50 per page over every v2 library the user
    // can reuse), so a run with many accumulated libraries pushes the target off
    // the first page. Filter to it by slug — the `lib:<org>:<slug>` key's last
    // segment — before ticking its radio.
    const slug = libraryKey.split(':').pop() ?? libraryKey;
    const search = this.page.locator(this.s.searchInput).last();
    await search.fill(slug);
    await search.press('Enter');
    const radio = this.page.locator(this.s.destinationRadio(libraryKey));
    await radio.waitFor({ timeout: TIMEOUTS.librarySearch });
    await radio.check();
  }

  /** "Confirm", waiting for the migration request; returns its response. */
  async confirm(): Promise<MigrationTask[]> {
    const response = await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().includes(MIGRATOR_PATH),
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.page.locator(this.s.footerPrimaryButton).last().click(),
    );
    // One source answers with a task, several (`bulk_migration/`) with a list.
    const body = (await response.json()) as MigrationTask | MigrationTask[];
    return Array.isArray(body) ? body : [body];
  }
}
