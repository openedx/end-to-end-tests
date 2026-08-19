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
- `preflight.ts` — post-login assertion that the session cookie was captured,
  with the HTTP cookie-policy diagnostic.
- `storage.ts` — where per-role storage state is written (`.auth/<role>.json`).
- `default-provider.ts` — the default provider (an Epic 1 stub; real MFE-era
  sign-in lands in Epic 2).

Key design point: a single sign-in sets parent-scoped cookies that cover every 
sub-domain origin, so one storage state authenticates LMS, Studio, and all MFEs. 
We never disable browser security.
