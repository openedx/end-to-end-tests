# `src/config/` — typed configuration layer

**Single responsibility:** turn environment variables into a validated, typed,
immutable configuration object — and fail fast with a clear message when the
environment is wrong.

This is the lowest layer in the architecture (`config → api → pages → steps →
fixtures → tests`). Nothing here imports from any other layer.

Contains:

- Env parsing and load-time validation (Zod schemas), including scheme /
  shared-parent-domain checks for multi-origin auth.
- Base URLs (LMS, Studio, each MFE), credentials, tenant/org identifiers.
- The capability-declaration schema (`discussions`, `teams`, `certificates`, …).
- Centralized route and timeout constants.

Rules:

- No test logic, no Playwright `page`/`test` usage.
- Never read `process.env` outside this layer — everything else imports the
  typed config object. (This is the anti-pattern the ADR calls out in the WGU
  suite, which reads `process.env.*` ad hoc inside specs.)
