import { expect, test } from '../../../src/fixtures';
import { AUTHZ_BASE, listRoleUsers } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { testId } from '../../../src/reporting';
import { RBAC_TAGS } from '../helpers';

/**
 * How the Assign Role wizard behaves when the **server** fails the write.
 *
 * These three cases cannot be produced against a healthy installation, so they
 * are the suite's one use of request interception, under the rules of
 * `docs/decisions/0003-network-interception.rst`: one named route is made to
 * **fail**, nothing is faked, the assertions are the rendered error state and
 * the number of requests, and what the platform actually holds is read on a
 * real request outside the intercepted route.
 *
 * The sheet describes this on the "Add team member" and "Add New Role" modals
 * this build replaced with the wizard; the behaviour it asks for — a toast with
 * a retry, the flow staying put, exactly one retry request, a new toast when
 * the retry fails too — is asserted on the wizard's save.
 */
test.describe(
  'Roles and Permissions console — Assign Role failures',
  { tag: ['@regression', ...RBAC_TAGS, '@content-libraries'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'reports a failed assignment with a retry, keeps the wizard, and retries exactly once',
      {
        annotation: [testId('TC-00450'), testId('TC-00451'), testId('TC-00456')],
      },
      async ({
        page,
        config,
        adminConsole,
        authoringLibrary,
        studioAuthorSession,
        studioColleague,
      }) => {
        void studioAuthorSession;
        const library = authoringLibrary.id;
        const wizard = adminConsole.assignRole;
        const subject = await studioColleague();

        // ADR-0003: one route, failing only, removed at the end of the test.
        let attempts = 0;
        const route = `**${AUTHZ_BASE}/roles/users/`;
        await page.route(route, async (handler) => {
          if (handler.request().method() !== 'PUT') {
            await handler.continue();
            return;
          }
          attempts += 1;
          await handler.fulfill({
            status: 500,
            contentType: 'application/json',
            body: '{"detail":"e2e injected failure"}',
          });
        });

        try {
          await wizard.open();
          await wizard.fillWhoAndRole(subject.identity.username, 'library_author');
          await wizard.validateAndAdvance();
          await wizard.chooseScope(library);

          const failed = await wizard.save();
          expect(failed.status()).toBe(500);
          expect(attempts).toBe(1);

          // The wizard stays where it was, with its scope step intact, and says
          // so with one report that offers a retry (a toast on `verawood`, an
          // alert inside the modal wizard after it).
          await expect(wizard.scopeToggles.first()).toBeVisible();
          await expect(wizard.saveFailure).toHaveCount(1);
          await expect(wizard.saveFailureRetry.first()).toBeVisible();

          // Retry sends exactly one more request — not a stream of them — and
          // because it fails again the console reports it again, still offering
          // a retry. (`verawood` stacks the second report on the first; the
          // modal replaces it. Either way the failure is on screen.)
          const retried = await wizard.retryFailedSave();
          expect(retried.status()).toBe(500);
          expect(attempts).toBe(2);
          await expect(wizard.saveFailure).not.toHaveCount(0);
          await expect(wizard.saveFailureRetry.first()).toBeVisible();
          await expect(wizard.scopeToggles.first()).toBeVisible();
        } finally {
          await page.unroute(route);
        }

        // Read on a real request, outside the interception: nothing was
        // assigned, so the failure was reported rather than swallowed.
        expect(
          (await listRoleUsers(page.request, config, library)).members.map((row) => row.username),
        ).not.toContain(subject.identity.username);
      },
    );
  },
);
