import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS } from '../../../src/config';
import { canI, listRoleUsers, listUserAssignments } from '../../../src/api';
import { seedScopeAssignments } from '../../../src/steps';
import { issue, testId } from '../../../src/reporting';
import { ADMIN_CONSOLE_A11Y_BASELINE, RBAC_TAGS } from '../helpers';

/**
 * The console's **Assign Role wizard**: who, which role, and where.
 *
 * The sheet describes this surface as a pair of modals ("Add team member",
 * "Add New Role"); this build ships a two-step wizard instead, so each case is
 * asserted against the wizard's equivalent and the mapping is stated where it
 * differs. The biggest difference is **when** the platform is asked about the
 * identifiers: the wizard validates them on leaving step one, before anything
 * is written, so an unknown account never reaches a write and is reported on
 * the step itself rather than in a toast.
 *
 * The oracle after every save is `roles/users/?scope=` — the console is
 * asserted to have changed the platform, not to have shown a message.
 */
test.describe(
  'Roles and Permissions console — Assign Role',
  { tag: ['@regression', ...RBAC_TAGS, '@content-libraries'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'assigns a role to one account and to several at once',
      { annotation: [testId('TC-00563'), testId('TC-00386')] },
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
        const first = await studioColleague();
        const second = await studioColleague();

        // One account.
        await wizard.goto();
        await wizard.fillWhoAndRole(first.identity.username, 'library_author');
        await wizard.validateAndAdvance();
        await wizard.chooseScope(library);
        const saved = await wizard.save();
        expect(saved.status()).toBe(207);
        await expect(adminConsole.teamMembers.table).toBeVisible();
        expect(
          (
            await listUserAssignments(page.request, config, first.identity.username)
          ).assignments.map((row) => row.role),
        ).toContain('library_author');

        // Several at once, with padding and a repeat — TC-00386's trim and
        // deduplicate. Two distinct accounts named three times must produce two
        // assignments, not three.
        await wizard.goto();
        await wizard.fillWhoAndRole(
          `  ${first.identity.username} , ${second.identity.username},  ${second.identity.username}  `,
          'library_user',
        );
        const validated = await wizard.validateAndAdvance();
        const body = (await validated.json()) as { valid_users: string[]; invalid_users: string[] };
        expect(new Set(body.valid_users)).toEqual(
          new Set([first.identity.username, second.identity.username]),
        );
        expect(body.invalid_users).toEqual([]);

        await wizard.chooseScope(library);
        const batch = await wizard.save();
        const outcome = (await batch.json()) as { completed: unknown[]; errors: unknown[] };
        expect(outcome.errors).toEqual([]);
        expect(outcome.completed).toHaveLength(2);

        const team = await listRoleUsers(page.request, config, library);
        const member = (username: string) =>
          team.members.find((row) => row.username === username)?.roles ?? [];
        expect(member(first.identity.username)).toEqual(
          expect.arrayContaining(['library_author', 'library_user']),
        );
        expect(member(second.identity.username)).toEqual(['library_user']);
      },
    );

    test(
      'refuses to advance past an account the platform does not know, keeping what was typed',
      { annotation: [testId('TC-00452'), testId('TC-00453')] },
      async ({
        page,
        config,
        adminConsole,
        authoringLibrary,
        studioAuthorSession,
        studioColleague,
      }) => {
        void studioAuthorSession;
        const wizard = adminConsole.assignRole;
        const known = await studioColleague();
        const unknown = 'e2e_no_such_account_zz';
        const typed = `${known.identity.username}, ${unknown}`;

        await wizard.goto();
        await wizard.fillWhoAndRole(typed, 'library_user');
        const validated = await wizard.validateAndAdvance();
        const body = (await validated.json()) as { valid_users: string[]; invalid_users: string[] };
        expect(body.valid_users).toEqual([known.identity.username]);
        expect(body.invalid_users).toEqual([unknown]);

        // The wizard stays on step one, marks the step, highlights the entry it
        // could not place, and keeps every character the user typed — so a mixed
        // batch is corrected rather than partially applied (the sheet's summary
        // toast belongs to the modal this build replaced).
        expect(await wizard.onFirstStep()).toBe(true);
        await expect(wizard.stepError).toBeVisible();
        await expect(wizard.usersHighlight).toContainText(unknown);
        await expect(wizard.usersInput).toHaveValue(typed);

        // And nothing was written for the account that was valid.
        expect(
          (await listRoleUsers(page.request, config, authoringLibrary.id)).members.map(
            (row) => row.username,
          ),
        ).not.toContain(known.identity.username);
      },
    );

    test(
      'opens from an account’s audit view and cancels without assigning',
      { annotation: [testId('TC-00564'), testId('TC-00402')] },
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
        const subject = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          library,
          [subject.identity.username],
          ['library_user'],
        );

        // From that account's audit view, the wizard is about that account.
        const audit = adminConsole.userAudit;
        await audit.goto(subject.identity.username);
        await audit.assignRoleButton.click();
        const wizard = adminConsole.assignRole;
        await expect(wizard.usersInput).toBeVisible();
        await expect(wizard.usersInput).toHaveValue(new RegExp(subject.identity.username));

        // Assigning a second role from here reaches the platform…
        await wizard.roleRadio('library_contributor').check();
        await wizard.validateAndAdvance();
        await wizard.chooseScope(library);
        await wizard.save();
        expect(
          (
            await listUserAssignments(page.request, config, subject.identity.username)
          ).assignments.map((row) => row.role),
        ).toEqual(expect.arrayContaining(['library_user', 'library_contributor']));

        // …while cancelling changes nothing: the wizard leaves, and the account
        // still holds exactly the two roles it had.
        await audit.goto(subject.identity.username);
        await audit.assignRoleButton.click();
        await wizard.roleRadio('library_author').check();
        await wizard.cancel();
        expect(
          (await listUserAssignments(page.request, config, subject.identity.username)).count,
        ).toBe(2);
      },
    );

    test(
      'shows a success message that clears itself',
      { annotation: [testId('TC-00454'), testId('TC-00455')] },
      async ({ page, adminConsole, authoringLibrary, studioAuthorSession, studioColleague }) => {
        void studioAuthorSession;
        const wizard = adminConsole.assignRole;
        const subject = await studioColleague();

        await wizard.goto();
        await wizard.fillWhoAndRole(subject.identity.username, 'library_user');
        await wizard.validateAndAdvance();
        await wizard.chooseScope(authoringLibrary.id);

        // The wizard's own surface, scanned where it carries the most: both
        // steps filled in and the scope list rendered.
        await checkA11y(page, {
          label: 'admin-console-assign-role',
          additionalBaseline: ADMIN_CONSOLE_A11Y_BASELINE,
        });
        await wizard.save();

        // Shown on success, and gone again without anyone dismissing it.
        await expect(wizard.toast).toBeVisible();

        // The pointer is parked away from the message first. Paragon's `Toast`
        // treats a hover (or a focus) as "the reader is still looking at this"
        // and cancels the auto-hide, and where the save control sits relative to
        // the toast differs by release — on `verawood` the click leaves the
        // pointer on it, which kept the toast up for the whole wait and failed
        // this case three attempts running. Nobody in the case is hovering the
        // message, so this removes an interaction the case does not describe
        // rather than weakening it.
        await page.mouse.move(0, 0);
        await expect(wizard.toast).toBeHidden({ timeout: TIMEOUTS.blockCompletion });
      },
    );

    test(
      'offers the Assign Role action only to an account that may manage the team',
      {
        annotation: [
          testId('TC-00396'),
          issue('https://github.com/openedx/wg-build-test-release/issues/603'),
        ],
      },
      async ({
        config,
        adminConsole,
        authoringLibrary,
        studioAuthorSession,
        studioColleague,
        page,
      }) => {
        test.fail(
          true,
          'The console offers Assign Role to a member who cannot manage the team: ' +
            'https://github.com/openedx/wg-build-test-release/issues/603',
        );
        void studioAuthorSession;
        const library = authoringLibrary.id;
        const member = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          library,
          [member.identity.username],
          ['library_user'],
        );

        // The platform is clear about what this member may do…
        expect(
          await canI(member.request, config, 'content_libraries.manage_library_team', library),
        ).toBe(false);

        // …so the console should not offer them the action. It does, which is
        // what this case reports; the wizard it opens has no roles to choose,
        // and a write would be refused.
        const memberConsole = adminConsole.consoleFor(member.page);
        await memberConsole.goto(library);
        // Asserted only once the console has rendered its table: it decides
        // whether to offer the action after asking the platform what the viewer
        // may do, so an absence assertion taken earlier passes for the wrong
        // reason.
        await expect(memberConsole.assignRoleButton).toHaveCount(0);
      },
    );
  },
);
