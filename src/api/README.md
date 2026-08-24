# `src/api/` — typed API client & data factories

**Single responsibility:** talk to Open edX HTTP APIs with typed request/response
shapes, and build deterministic, unique-per-run test data.

Contains:

- Typed clients over Playwright's `APIRequestContext` (e.g. CSRF token,
  login-session, registration endpoints).
- Data factories that produce isolated, unique-per-run entities (users, etc.)
  using portable, documented APIs — never one operator's private fixtures.

Rules:

- No locators, no page interaction — that belongs in `pages/`.
- Depends only on `config/`.
