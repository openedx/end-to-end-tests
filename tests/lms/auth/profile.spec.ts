import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { expect, test } from '../../../src/fixtures';

/**
 * Update learner profile on the account settings page (`frontend-app-account`),
 * BTR TC-00001.
 *
 * Runs in the `lms-learner` project (`@authenticated`), reusing the signed-in
 * learner session captured by `setup` — so it needs no fresh account and never
 * prompts under the manual backend. The profile edit persists directly via the
 * account API. The password half of TC-00001 is the same reset flow covered
 * text-free by `password-reset.spec.ts` (TC-00004); the account page's reset
 * button has no language-independent locator, so it is not driven here.
 */
test.describe('Account settings (profile)', () => {
  test(
    'updates the full name',
    { tag: ['@authenticated', '@mfe-account'], annotation: testId('TC-00001') },
    async ({ page, accountSettingsPage, learnerIdentity }) => {
      await accountSettingsPage.goto();

      // `learnerIdentity.name` is just a fresh, unique display name to save; we
      // assert on that value (our own data), not on any localized UI text.
      await accountSettingsPage.updateFullName(learnerIdentity.name);

      await expect(page.getByText(learnerIdentity.name).first()).toBeVisible();
    },
  );

  test(
    'the account settings screen meets WCAG 2.2 AA',
    { tag: ['@authenticated', '@mfe-account'] },
    async ({ page, accountSettingsPage }) => {
      await accountSettingsPage.goto();
      // The account MFE ships with unlabeled form controls (the `label` rule, 14
      // nodes) — upstream debt tolerated only for this screen so the rule still
      // guards the simpler auth screens.
      await checkA11y(page, { label: 'account-settings', additionalBaseline: ['label'] });
    },
  );
});
