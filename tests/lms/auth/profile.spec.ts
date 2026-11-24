import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { fetchAccount } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';

/**
 * Update learner profile on the account settings page (`frontend-app-account`),
 * BTR TC-00001.
 *
 * Runs in the `lms-learner` project (`@authenticated`). The name change is made
 * by a learner of the test's own (`newLearner`, installed in the page), not the
 * learner captured by `setup`: it changes the account, and the frontend-base
 * Account app then refreshes the session (`POST /login_refresh`), which the
 * shared session may no longer hold — a `courseLearner` registering on the
 * shared request context ends it. Each edit persists directly via the account
 * API, which decides along with a reload of the page. The password half of
 * TC-00001 is the page's own reset button, pressed and answered by the
 * platform; what follows the mailed link is the reset flow covered text-free
 * by `password-reset.spec.ts` (TC-00004).
 */
test.describe('Account settings (profile)', () => {
  test(
    'updates the full name',
    { tag: ['@smoke', '@authenticated', '@mfe-account'], annotation: testId('TC-00001') },
    async ({ page, config, accountSettingsPage, learnerIdentity, newLearner }) => {
      const learner = await newLearner();
      await page.context().clearCookies();
      await page.context().addCookies((await learner.request.storageState()).cookies);
      await accountSettingsPage.goto();

      // `learnerIdentity.name` is just a fresh, unique display name to save; we
      // assert on that value (our own data), not on any localized UI text.
      await accountSettingsPage.updateFullName(learnerIdentity.name);
      await expect(page.getByText(learnerIdentity.name).first()).toBeVisible();

      // It persisted: the account API holds it, and loading the page afresh shows it.
      await expect
        .poll(
          async () => (await fetchAccount(learner.request, config, learner.identity.username)).name,
        )
        .toBe(learnerIdentity.name);
      await accountSettingsPage.goto();
      await expect(page.getByText(learnerIdentity.name).first()).toBeVisible();
    },
  );

  test(
    'changes other account fields, which survive a reload, and requests a password reset',
    { tag: ['@regression', '@authenticated', '@mfe-account'], annotation: testId('TC-00001') },
    async ({ page, config, accountSettingsPage, newLearner }) => {
      const learner = await newLearner();
      const { username } = learner.identity;
      await page.context().clearCookies();
      await page.context().addCookies((await learner.request.storageState()).cookies);
      await accountSettingsPage.goto();

      // Two more fields, one from each section, chosen by option value (the
      // option labels are localized): a year of birth and a level of education.
      expect((await accountSettingsPage.saveSelectField('yearOfBirth', '1990')).status()).toBe(200);
      expect((await accountSettingsPage.saveSelectField('levelOfEducation', 'b')).status()).toBe(
        200,
      );
      await expect
        .poll(async () => {
          const account = await fetchAccount(learner.request, config, username);
          return [account.year_of_birth, account.level_of_education];
        })
        .toEqual([1990, 'b']);

      // Refreshed, the page offers each field with the saved value selected.
      await accountSettingsPage.goto();
      await expect(await accountSettingsPage.editSelectField('yearOfBirth')).toHaveValue('1990');
      await accountSettingsPage.goto();
      await expect(await accountSettingsPage.editSelectField('levelOfEducation')).toHaveValue('b');

      // The page's own reset button asks the platform for a reset of this
      // account's password and reports that the request went out. Following the
      // mailed link to a new password is TC-00004.
      const reset = await accountSettingsPage.requestPasswordReset();
      expect(reset.status()).toBe(200);
      expect(new URLSearchParams(reset.request().postData() ?? '').get('email')).toBe(
        learner.identity.email,
      );
      await expect(accountSettingsPage.resetPasswordButton).toHaveClass(
        /pgn__stateful-btn-state-complete/,
      );
    },
  );

  test(
    'the account settings screen meets WCAG 2.2 AA',
    { tag: ['@regression', '@authenticated', '@mfe-account'] },
    async ({ page, accountSettingsPage }) => {
      await accountSettingsPage.goto();
      // The account MFE ships with unlabeled form controls (the `label` rule, 14
      // nodes) — upstream debt tolerated only for this screen so the rule still
      // guards the simpler auth screens.
      await checkA11y(page, { label: 'account-settings', additionalBaseline: ['label'] });
    },
  );
});
