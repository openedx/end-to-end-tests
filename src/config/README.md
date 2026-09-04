# `src/config/` — typed configuration layer

**Single responsibility:** turn environment variables into a validated, typed,
immutable configuration object — and fail fast with a clear message when the
environment is wrong.

This is the lowest layer in the architecture (`config → api → pages → steps →
fixtures → tests`). Nothing here imports from any other layer.

Contains:

- Env parsing and load-time validation (Zod schemas in `schema.ts`, `load.ts`),
  including the scheme / shared-parent-domain checks for multi-origin auth
  (`domain.ts`).
- Base URLs (LMS, Studio, the MFE host), credentials, tenant/org identifiers and
  the optional `COURSE_KEY`.
- The capability vocabulary and mutually-exclusive pairs (`capabilities.ts`) —
  the authoritative list a `@capability` tag must match.
- The built-in account-backend names (`account-backends.ts`).
- Centralized timeout budgets (`timeouts.ts`), each one justified.
- `selectors/` — one module per surface holding the structural anchors page
  objects use, each with a comment naming the localized string it stands in for
  (see `selectors/README.md`).

Rules:

- No test logic, no Playwright `page`/`test` usage.
- Never read `process.env` outside this layer — everything else imports the
  typed config object. (This is the anti-pattern the ADR calls out in the WGU
  suite, which reads `process.env.*` ad hoc inside specs.)
