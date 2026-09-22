import type { Route } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS } from '../../../src/config';
import { AUTHZ_BASE } from '../../../src/api';
import { issue, testId } from '../../../src/reporting';

/**
 * What the console shows when a request cannot be served: an expired session, a
 * route that does not exist, and a list the server fails.
 *
 * Three of these are produced honestly — by clearing the context's cookies, and
 * by asking for a route the app does not have. The 5xx cases cannot be produced
 * against a healthy installation, so they make **one** named route fail under
 * `docs/decisions/0003-network-interception.rst`: nothing is faked, the
 * assertions are the rendered state and the number of requests, and the route
 * is removed when the test ends.
 *
 * The sheet describes this block on the library console, with a "Server Error"
 * page offering *Reload Page* and *Back to Libraries*. This build reports a
 * failed list as a **toast with a retry** over an empty table, and its only
 * full-page error view is the 404 (`RBAC-004`), so each case is asserted
 * against what the console actually renders.
 */
test.describe(
  'Roles and Permissions console — error views',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@rbac'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'sends a caller whose session has gone to sign in again',
      { annotation: testId('TC-00437') },
      async ({ page, context, adminConsole, studioAuthorSession }) => {
        void studioAuthorSession;
        await adminConsole.console.goto();
        await expect(adminConsole.teamMembers.table).toBeVisible();

        // The sheet's own recipe: drop the session and revisit.
        await context.clearCookies();
        await page.goto(adminConsole.console.url(), { waitUntil: 'domcontentloaded' });

        // The console hands over to the sign-in screen, carrying where to return
        // to, and shows none of its own content.
        await page.waitForURL(/\/(authn\/)?login/, { timeout: TIMEOUTS.navigation });
        expect(new URL(page.url()).searchParams.get('next') ?? '').toContain('/authz');
        await expect(adminConsole.teamMembers.table).toHaveCount(0);
      },
    );

    test(
      'answers a route it does not have with a not-found view and no retry',
      { annotation: testId('TC-00439') },
      async ({ page, adminConsole, studioAuthorSession }) => {
        void studioAuthorSession;
        await page.goto(`${adminConsole.origin}/authz/e2e-no-such-route`, {
          waitUntil: 'domcontentloaded',
        });

        // The view replaces the console: its one action is on screen, the table
        // is gone, and — the case's point — nothing offers a retry. "No retry"
        // is read as the console's own retry affordance being absent, which is
        // its toast; the shells differ in what wraps the view, so nothing here
        // anchors through a page region.
        await expect(page.locator(ADMIN_CONSOLE_SELECTORS.errorViewAction)).toBeVisible();
        await expect(adminConsole.teamMembers.table).toHaveCount(0);
        await expect(adminConsole.console.toast).toHaveCount(0);
        await expect(adminConsole.console.toastRetry).toHaveCount(0);
      },
    );

    test(
      'leads back out of an error view',
      {
        annotation: [
          testId('TC-00442'),
          issue('https://github.com/openedx/wg-build-test-release/issues/605'),
        ],
      },
      async ({ page, adminConsole, studioAuthorSession }) => {
        test.fail(
          true,
          "The error view's only action does nothing: the anchor carries no href and its handler " +
            'leaves the route unchanged (RBAC-008).',
        );
        void studioAuthorSession;
        await page.goto(`${adminConsole.origin}/authz/e2e-no-such-route`, {
          waitUntil: 'domcontentloaded',
        });
        const action = page.locator(ADMIN_CONSOLE_SELECTORS.errorViewAction);
        await expect(action).toBeVisible();

        await action.click();
        await page.waitForURL((url) => !url.pathname.includes('e2e-no-such-route'), {
          timeout: TIMEOUTS.optionalOverlay,
        });
      },
    );

    test(
      'reports a failed list, retries it once, and leaks nothing when the caller moves on',
      { annotation: [testId('TC-00440'), testId('TC-00441'), testId('TC-00443')] },
      async ({ page, adminConsole, studioAuthorSession }) => {
        void studioAuthorSession;
        const route = `**${AUTHZ_BASE}/assignments/**`;
        let attempts = 0;
        let held: Route | undefined;

        // ADR-0003: one route, failing only. The second attempt is held open so
        // the caller can navigate away mid-flight, which is TC-00443's premise.
        await page.route(route, async (handler) => {
          attempts += 1;
          if (attempts === 1) {
            await handler.fulfill({
              status: 500,
              contentType: 'application/json',
              body: '{"detail":"e2e injected failure"}',
            });
            return;
          }
          held = handler;
        });

        try {
          await page.goto(adminConsole.console.url(), { waitUntil: 'domcontentloaded' });

          // TC-00440: the failure is reported, and no rows are rendered behind it.
          await expect(adminConsole.console.toast).toBeVisible();
          await expect(adminConsole.console.toast.locator('button')).not.toHaveCount(0);
          await expect(adminConsole.teamMembers.rows).toHaveCount(0);

          // TC-00441: the retry is one request, and the report clears as it goes,
          // so there is nothing left to press twice.
          const retry = adminConsole.console.toast.locator('button').last();
          await retry.click();
          await expect(adminConsole.console.toast).toHaveCount(0);
          expect(attempts).toBe(2);

          // TC-00443: leave while that retry is still in flight.
          await page.goto(adminConsole.assignRole.url(), { waitUntil: 'domcontentloaded' });
          await expect(adminConsole.assignRole.usersInput).toBeVisible();
          await expect(adminConsole.console.toast).toHaveCount(0);

          // Even once the abandoned request finally fails, its error does not
          // surface on the page the caller moved to.
          await held?.fulfill({
            status: 500,
            contentType: 'application/json',
            body: '{"detail":"e2e injected failure"}',
          });
          await expect(adminConsole.console.toast).toHaveCount(0);
          expect(attempts).toBe(2);
        } finally {
          await page.unroute(route);
        }
      },
    );
  },
);
