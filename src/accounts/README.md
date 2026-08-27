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

Planned (from the spike, not yet implemented): a 3rd-party mailbox API
(Mailosaur/MailSlurp/MailHog) and a local-file mail reader — each an
`AccountBackend` that automates `createIdentity`/`activate` non-interactively.

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

The paths are checked for existence at config load; the modules themselves are
loaded by `plugin-loader.ts` and registered by `AccountPluginRegistry` — in global
setup (so a broken plugin or an unknown `ACCOUNT_BACKEND` fails the run up front)
and lazily in each worker via `resolveAccountBackend()`. A plugin whose `name`
collides with an already-registered backend is an error, so plugins cannot
silently shadow `automatic` or `manual`.
