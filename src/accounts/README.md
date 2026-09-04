# `src/accounts/` — account-creation / activation backends

**Single responsibility:** provide a **user-choosable** way to obtain a learner
account that can sign in, so the same specs run against installations with
different email-validation behaviour
([issue #10](https://github.com/openedx/end-to-end-tests/issues/10)).

The backend is selected by `ACCOUNT_BACKEND` (validated in `src/config/`). Every
consumer provisions accounts through `provisionLearnerAccount(request, config)` —
create identity → register → activate — so switching backends changes the whole
suite without touching the auth provider or the specs.

The learner auth contract captures the session that **registration itself**
creates (the platform auto-authenticates every successful registration), so the
reusable storage state needs no separate sign-in — the "Automatic login on"
behaviour. A separate sign-in is only exercised by the login/logout specs, which
therefore need an install where the account can actually log in.

## Backends

- `automatic` (default) — "Automatic login on". Generates a throwaway
  `@example.com` identity; activation is a no-op because registration already
  yields an authenticated session. Works against the default even when accounts
  stay inactive until activation, since the auth contract uses the registration
  session (login/logout specs still require a login-able account, e.g.
  `SKIP_EMAIL_VALIDATION = True`).
- `manual` — interactive, for targets that enforce email activation and cannot be
  reconfigured. Prompts the operator for an email to register with, then for the
  activation link/token from the email, and visits it to activate the account.
  **Run with `--workers=1`** so prompts don't interleave; the prompt clears the
  test timeout while waiting for input. Plus-addressing (`you+e2e1@example.com`)
  lets one inbox serve several runs.

  **Getting the activation key without email (Tutor).** When you administer the
  target and don't want to wait on (or configure) email, read the pending
  registrations' keys straight from the database and paste the one for the email
  you registered with:

  ```sh
  tutor local run lms ./manage.py lms shell -c "from common.djangoapps.student.models import Registration; rs = [ (r.user.email, r.activation_key) for r in Registration.objects.select_related('user').all()]; print(rs);"
  ```

  Use `tutor dev run` on a dev stack. The prompt accepts either the bare
  `activation_key` or the full `.../activate/<key>` link.

A 3rd-party mailbox API is covered by the example plugin below rather than by a
built-in backend.

## Adding a built-in backend

1. Add its name to `ACCOUNT_BACKENDS` in `src/config/account-backends.ts`.
2. Implement `AccountBackend` here.
3. Register it in `AccountPluginRegistry.registerAll()` in `registry.ts`.

## Custom backend plugins

An installation with its own auth (SSO, SAML, a mailbox API) can supply a backend
without forking the suite. Point `CUSTOM_ACCOUNT_BACKEND_PLUGINS` at one or more
module paths (comma-separated, resolved from the working directory) and select one
by its `name`:

```sh
CUSTOM_ACCOUNT_BACKEND_PLUGINS=./plugins/saml-enterprise.plugin.ts
ACCOUNT_BACKEND=saml-enterprise
```

Each module's **default export** (or a named `accountBackend` export) must be an
`AccountBackend`, a class implementing it, or a factory returning one:

```ts
// plugins/saml-enterprise.plugin.ts
import type { AccountBackend } from 'openedx-end-to-end-tests/src/accounts';

export default class SamlEnterpriseBackend implements AccountBackend {
  readonly name = 'saml-enterprise';
  async createIdentity({ config, request }) {
    /* ... */
  }
  async activate({ config, request, identity }) {
    /* ... */
  }
}
```

### Plugin API

`AccountBackend` (`types.ts`) has two required methods and three optional ones:

| Method             | Required | Runs when                                             | Default when omitted              |
| ------------------ | -------- | ----------------------------------------------------- | --------------------------------- |
| `createIdentity`   | yes      | An account is about to be registered                  | —                                 |
| `activate`         | yes      | Just after registration, to make sign-in possible     | —                                 |
| `signIn`           | no       | Headless sign-in that captures reusable storage state | LMS login-session API             |
| `signInThroughUi`  | no       | A spec signs in through the browser                   | authn MFE `/login` form           |
| `signOutThroughUi` | no       | A spec signs out through the browser                  | header account-menu sign-out link |

Each receives a single context object: `config` and `request` for the account
methods, plus `identity` (`activate`), `credentials` (`signIn`,
`signInThroughUi`), or `page` and `username` (the UI flows). The defaults are
exported as `defaultSignIn`, `defaultSignInThroughUi`, and
`defaultSignOutThroughUi`, so a plugin that replaces only one flow can delegate
the rest.

The optional flows are what make an SSO install viable: `signIn` is what the
`setup` project uses to capture `.auth/<role>.json` for **every** role including
`staff` (admin accounts are never provisioned — they must already exist on the
target), and the two UI flows are what the login/logout specs drive, so those
specs exercise the install's own screens rather than the authn MFE.

### Example plugin: `openinbox`

`plugins/openinbox.plugin.ts` is a working example of the whole plugin contract,
loaded like any operator's own plugin — it lives outside `src/`, is not in
`registry.ts`, and uses only the exports above. It automates what `manual` asks
an operator to do by hand: create a disposable [openinbox.io](https://openinbox.io)
inbox and register with it, then poll that inbox until the Open edX activation
email arrives and visit its link via `activateAccount`. Sign-in and sign-out are
left unimplemented, so the built-in defaults run — which is what makes the
optional flows optional.

```sh
CUSTOM_ACCOUNT_BACKEND_PLUGINS=./plugins/openinbox.plugin.ts
ACCOUNT_BACKEND=openinbox
OPENINBOX_API_KEY=...           # required; reading an inbox needs a paid plan
# OPENINBOX_BASE_URL, OPENINBOX_POLL_TIMEOUT_MS, OPENINBOX_POLL_INTERVAL_MS
```

Plugins have no config-schema hook, so it reads its own settings from the
environment and fails with a clear message when the key is missing — before an
account is registered, not after. The target must genuinely send activation
email.

`tests/accounts/openinbox.spec.ts` tests it with a stubbed request context,
so no key and no network are needed to run the suite's own tests.

The paths are checked for existence at config load; the modules themselves are
loaded by `plugin-loader.ts` and registered by `AccountPluginRegistry` — in global
setup (so a broken plugin or an unknown `ACCOUNT_BACKEND` fails the run up front)
and lazily in each worker via `resolveAccountBackend()`. A plugin whose `name`
collides with an already-registered backend is an error, so plugins cannot
silently shadow `automatic` or `manual`.
