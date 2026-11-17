import { checkA11y } from '../../../src/a11y';
import { fetchChromeConfig, loginSession } from '../../../src/api';
import { newCleanRequestContext } from '../../../src/auth';
import { testId } from '../../../src/reporting';
import { expect, test } from '../../../src/fixtures';
import { linkIn, linkingTo, waitForMail } from '../../../src/steps';

/**
 * Forgot-password (password reset) through the authn MFE `/reset` route
 * (BTR TC-00004, TC-00073). The request side needs no mailbox: the endpoint is
 * enumeration-safe (it confirms whatever the address), so the confirmation is
 * asserted on its own. Under `@email-inbox` the reset mail itself is read: it
 * reaches the learner, links to a working reset form, and the confirmation's
 * support link is the one the installation configures; and the whole journey
 * runs — a new password set through the mailed link signs the learner in, and
 * the old one no longer does.
 */
test.describe('Password reset (authn MFE)', () => {
  test(
    'requests a reset and shows the confirmation',
    { tag: ['@smoke', '@mfe-authn'], annotation: testId('TC-00004') },
    async ({ forgotPasswordPage, learnerIdentity }) => {
      await forgotPasswordPage.goto();
      await forgotPasswordPage.requestReset(learnerIdentity.email);

      // The success-variant alert is the language-independent signal of acceptance.
      await expect(forgotPasswordPage.confirmation).toBeVisible();
    },
  );

  test(
    'rejects an invalid email address',
    { tag: ['@smoke', '@mfe-authn'], annotation: testId('TC-00004') },
    async ({ forgotPasswordPage }) => {
      await forgotPasswordPage.goto();
      await forgotPasswordPage.requestReset('not-an-email');

      await expect(forgotPasswordPage.error).toBeVisible();
    },
  );

  test(
    'resets a forgotten password from the mailed link, and signs in with the new one',
    { tag: ['@regression', '@mfe-authn', '@email-inbox'], annotation: testId('TC-00004') },
    async ({ playwright, config, forgotPasswordPage, inboxLearner }, testInfo) => {
      const { email, password: oldPassword } = inboxLearner.identity;
      await forgotPasswordPage.goto();
      await forgotPasswordPage.requestReset(email);
      await expect(forgotPasswordPage.confirmation).toBeVisible();

      const toReset = (url: URL) => url.pathname.includes('/password_reset_confirm/');
      const mail = await waitForMail(inboxLearner.inbox, inboxLearner.request, linkingTo(toReset));
      expect(mail.found, `mails seen: ${JSON.stringify(mail.subjects)}`).toBeDefined();
      await forgotPasswordPage.openResetLink(linkIn(mail.found!, toReset)!);
      const newPassword = `E2e-reset-${testInfo.testId.slice(-6)}-${testInfo.retry}-q8`;
      expect((await forgotPasswordPage.setNewPassword(newPassword)).ok()).toBe(true);

      // The platform decides: the new password signs in, the old one is refused.
      // Each sign-in on a fresh context (a credential POST refuses a dirty jar).
      const fresh = await newCleanRequestContext(playwright.request);
      const stale = await newCleanRequestContext(playwright.request);
      try {
        await loginSession(fresh, config, { emailOrUsername: email, password: newPassword });
        await expect(
          loginSession(stale, config, { emailOrUsername: email, password: oldPassword }),
        ).rejects.toThrow();
      } finally {
        await Promise.all([fresh.dispose(), stale.dispose()]);
      }
    },
  );

  test(
    'the reset screen meets WCAG 2.2 AA',
    { tag: ['@regression', '@mfe-authn'] },
    async ({ page, forgotPasswordPage }) => {
      await forgotPasswordPage.goto();
      await checkA11y(page, { label: 'reset' });
    },
  );

  test(
    'mails a working reset link, and points to technical support',
    { tag: ['@smoke', '@mfe-authn', '@email-inbox'], annotation: testId('TC-00073') },
    async ({ request, config, forgotPasswordPage, inboxLearner }) => {
      await forgotPasswordPage.goto();
      await forgotPasswordPage.requestReset(inboxLearner.identity.email);
      await expect(forgotPasswordPage.confirmation).toBeVisible();

      // The confirmation's "contact technical support" goes where the
      // installation says. The authn screen has no header to tell its frontend
      // generation by, and the LMS serves this key identically to both (the
      // authn MFE config and the shell's common config), so the MFE config is
      // read.
      const chrome = await fetchChromeConfig(request, config, { kind: 'legacy', mfe: 'authn' });
      expect(chrome.passwordResetSupportLink, 'the target configures a support link').toBeDefined();
      await expect(forgotPasswordPage.supportLink).toHaveAttribute(
        'href',
        chrome.passwordResetSupportLink!,
      );

      // The mail reaches the learner and its link opens the reset form.
      const toReset = (url: URL) => url.pathname.includes('/password_reset_confirm/');
      const mail = await waitForMail(inboxLearner.inbox, inboxLearner.request, linkingTo(toReset));
      expect(mail.found, `mails seen: ${JSON.stringify(mail.subjects)}`).toBeDefined();
      await forgotPasswordPage.openResetLink(linkIn(mail.found!, toReset)!);
      await expect(forgotPasswordPage.newPasswordFields.first()).toBeVisible();
    },
  );
});
