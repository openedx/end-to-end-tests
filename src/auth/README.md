# `src/auth/` — authentication contract

**Single responsibility:** provide a provider-swappable way to obtain a signed-in
session for a named role, as one Playwright storage state valid across every
configured origin.

Authentication is a precondition for almost every test and providers vary widely
(custom SSO, non-default provisioning), so it is a first-class, swappable
contract rather than an assumed sign-in flow (ADR-0002).

Contains:

- `roles.ts` — the `Role` vocabulary (`learner`, `instructor`, `staff`).
- `types.ts` — the `AuthProvider` contract and `AuthContext`.
- `preflight.ts` — post-login assertion that the login JWT cookie was captured
  (the reliable authenticated-session signal; `sessionid` is present for anonymous
  users too), plus the `hasAuthenticatedSession` predicate specs use and the HTTP
  cookie-policy diagnostic.
- `storage.ts` — where per-role storage state is written (`.auth/<role>.json`).
- `api-provider.ts` — `ApiAuthProvider`, the default provider. Signs in through
  the configured account backend's `signIn` flow — by default the LMS APIs the
  authn MFE calls (`GET /csrf/api/v1/token` → `POST .../login_session/`) — and
  captures the parent-domain cookie jar into one storage state. `learner`
  self-registers a unique account (portable seeding); `staff` signs in with the
  pre-existing `ADMIN_*` account and is never provisioned; `instructor` is an
  extension point (reported not-configured so setup skips it). Because sign-in
  goes through the backend, an install with custom auth can redirect every role
  by setting `ACCOUNT_BACKEND` — see [`../accounts/README.md`](../accounts/README.md).
- `default-provider.ts` — exports the default provider instance; swap it for a
  provider with custom SSO without touching the specs.
- `errors.ts` — `AuthError` and `AuthNotConfiguredError` (the latter lets the
  setup project skip an unconfigured role instead of failing the run).

Key design point: a single sign-in sets parent-scoped cookies that cover every
sub-domain origin, so one storage state authenticates LMS, Studio, and all MFEs.
We never disable browser security.
