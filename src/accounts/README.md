# `src/accounts/` — account-creation / activation backends

**Single responsibility:** provide a **user-choosable** way to obtain a learner
account that can sign in, so the same specs run against installations with
different email-validation behaviour
([issue #10](https://github.com/openedx/end-to-end-tests/issues/10)).

The backend is selected by `ACCOUNT_BACKEND` (validated in `src/config/`). Every
consumer provisions accounts through `provisionLearnerAccount(request, config)` —
create identity → register → activate — so switching backends changes the whole
suite without touching the auth provider or the specs.

## Backends

- `automatic` (default) — auto-activating targets (`SKIP_EMAIL_VALIDATION = True`,
  the Tutor/sandbox default). Generates a throwaway `@example.com` identity;
  activation is a no-op because accounts are active on creation.
- `manual` — interactive, for targets that enforce email activation and cannot be
  reconfigured. Prompts the operator for an email to register with, then for the
  activation link/token from the email, and visits it to activate the account.
  **Run with `--workers=1`** so prompts don't interleave; the prompt clears the
  test timeout while waiting for input. Plus-addressing (`you+e2e1@example.com`)
  lets one inbox serve several runs.

Planned (from the spike, not yet implemented): a 3rd-party mailbox API
(Mailosaur/MailSlurp/MailHog) and a local-file mail reader — each an
`AccountBackend` that automates `createIdentity`/`activate` non-interactively.

## Adding a backend

1. Add its name to `ACCOUNT_BACKENDS` in `src/config/account-backends.ts`.
2. Implement `AccountBackend` here.
3. Map it in `registry.ts` (the `switch` is exhaustive, so the compiler flags a
   missing case).
