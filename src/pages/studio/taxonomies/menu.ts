import type { Locator, Page } from '@playwright/test';

import { TIMEOUTS } from '../../../config';

/**
 * Reads the `data-testid` of every item in a taxonomy menu, in DOM order. The
 * value is the app's untranslated item key, so the set and order are read
 * without matching displayed text. `items` must already be open.
 */
export function menuItemTestIds(items: Locator): Promise<string[]> {
  return items.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-testid') ?? ''),
  );
}

/** Waits for the SPA to reach a Competency Management route (`.../competencies`). */
export async function waitForCompetencyRoute(page: Page): Promise<void> {
  await page.waitForURL((url) => url.pathname.endsWith('/competencies'), {
    timeout: TIMEOUTS.navigation,
  });
}
