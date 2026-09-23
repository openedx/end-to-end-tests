# `src/mail/` — mailbox providers

**Single responsibility:** give specs an inbox they can read, so the e-mail the
platform sends — notification mail, digests, unsubscribe links — can be
asserted. It is the oracle behind the opt-in `email-inbox` capability.

A provider creates an `Inbox` per use (`createInbox`); the inbox has an
`address` to register a learner with, `waitForMessage({ request, match,
timeoutMs })`, and `dispose(request)`. A wait that runs out of budget is an
**outcome** (`found: undefined`, plus the subjects that did arrive), not an
error, so the spec decides and its failure message says what reached the inbox;
a provider error (bad credentials, an unreachable API) still throws.
`messageLinks(message)` lists a message's links — HTML `href`s first, then URLs
in the text part — which is how a spec follows a mail without reading its
localized copy.

## Selecting a provider

The suite ships **no built-in provider**: a mailbox is operator infrastructure,
not a platform surface (ADR-0002). Providers are plugins:

```sh
CAPABILITIES=…,email-inbox
CUSTOM_MAIL_PROVIDER_PLUGINS=./plugins/mailpit.plugin.ts
MAIL_PROVIDER=mailpit
```

- Declaring `email-inbox` without `MAIL_PROVIDER`, or naming a provider with no
  plugin list, fails config loading (`src/config/load.ts`) — the `studio` /
  `CMS_BASE_URL` pattern.
- Plugin paths are checked at config load; the modules are loaded by
  `plugin-loader.ts` and registered by `MailProviderRegistry`, in global setup
  (so a provider's missing settings fail the run up front) and lazily in each
  worker via `resolveMailProvider()`.
- A module's named `mailProvider` export is the provider when present, else its
  default export — so one module can ship an account backend (default) and a
  provider side by side. Each may be the provider, a class, or a factory; the
  constructor or factory is where a plugin validates its own `PLUGIN_*`
  variables (CONVENTIONS "Configuration and secrets").

## Shipped providers (`plugins/`)

| Provider    | Use when                                                                                | Settings                                                                           |
| ----------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `mailpit`   | The target's SMTP points at a [Mailpit](https://mailpit.axllent.org) catcher (Tutor CI) | `MAILPIT_BASE_URL` (required), `MAILPIT_DOMAIN`, `MAILPIT_POLL_INTERVAL_MS`        |
| `openinbox` | The target sends real mail to the internet (an already-running target)                  | `OPENINBOX_API_KEY` (required), `OPENINBOX_BASE_URL`, `OPENINBOX_POLL_INTERVAL_MS` |

Mailpit accepts mail for any recipient, so its "inbox" is a freshly minted
address and a wait is a search by recipient; nothing is created up front, and
dispose deletes that address's messages. Openinbox creates a real disposable
inbox and deletes it on dispose (its plan caps concurrent inboxes).

Both are unit-tested against a stub request context in
`tests/mail/providers.spec.ts`; plugin loading and selection in
`tests/mail/registry.spec.ts`.

## Rules for specs

- **One inbox per test**, from a test-scoped fixture: what arrived is the
  assertion, so an inbox is never shared.
- **Match on the test's own data** (a thread title it generated, a link's path),
  never on the platform's subjects or body copy.
- **Take the timeout from `TIMEOUTS`**, not from the provider: one named budget
  governs a wait whichever provider is configured.
