# Conventions

Living companion to [ADR-0002](docs/decisions/0002-core-principles.rst) and
[ARCHITECTURE.md](ARCHITECTURE.md). These are the day-to-day rules for writing
tests in this suite.

## Files and naming

- Specs: `tests/<domain>/<feature>.spec.ts` (e.g. `tests/lms/auth/login.spec.ts`).
- Page objects mirror the spec tree: `src/pages/<domain>/<feature>.page.ts`.
- Setup projects: `*.setup.ts`.
- One `*.spec.ts` covers one Feature — focused coverage of a single capability.
  To extend the suite, add a new spec under the relevant domain composing existing
  page objects, steps, and fixtures.

## Locators

Prefer stable, user-facing locators. Priority order:

1. **Test IDs** — `getByTestId(...)` where the app exposes them.
2. **Role / label / text** — `getByRole`, `getByLabel`, `getByText`.
3. **CSS containers** — only as a last resort, for structural scoping.

Avoid brittle selectors (deep CSS/XPath chains, nth-child, generated class names).

## Assertions and stability

- Use **web-first, auto-retrying** assertions (`await expect(locator).toBeVisible()`),
  not manual polling.
- **No fixed sleeps.** Never use `waitForTimeout`. Wait for a condition, and take
  timeout budgets from `src/config/timeouts.ts`.
- Specs **own the assertions** that decide pass/fail. Page objects and steps
  perform actions and navigation; they don't assert outcomes.
- Tests must be **parallel-safe**: each test owns its context and identity and
  makes no assumptions about order or shared mutable state.

## Test data

- Generate **deterministic, unique-per-run** data (e.g. a unique suffix per test)
  so parallel runs don't collide.
- Set up state through **portable mechanisms** — documented public APIs or a
  documented, idempotent seeding step — never one operator's private fixtures.
- Prefer creating data via `src/api/` factories over driving the UI, except when
  the UI flow is the thing under test.

## Tags

Domain decides the folder; everything else is a tag. Tags drive Playwright
project selection (`--grep`) and make failures legible to non-technical readers.

- **Stability tier:** `@smoke` (critical path), `@regression` (broader depth).
- **Pure logic:** `@unit` (no browser/target; runs in the `unit` project).
- **Capability:** `@discussions`, `@teams`, `@certificates`, … — gates optional
  coverage on installations that declare the capability (see `CAPABILITIES` in
  `.env.example`). Keep tags in sync with `src/config/capabilities.ts`.
- **MFE / subsystem:** `@mfe-learning`, `@mfe-authoring`, … — filters the suite to
  one micro-frontend.

Apply tags with the `tag` option:

```ts
test('the LMS landing page loads', { tag: '@smoke' }, async ({ page }) => {
  /* ... */
});
```

## BTR test-case IDs

Tests that correspond to a case in the BTR Release Test Plan carry that case's ID
explicitly — as a `test_id` annotation of the form `TC-0000X`, never inferred from
the title. This lets a reporter map outcomes back to the release sheet. (The
annotation convention and reporter land with the auth epic.)

## Configuration and secrets

- Read configuration through `getConfig()` / the `config` fixture. **Never read
  `process.env` directly in specs, pages, or steps** — that is the anti-pattern
  the typed config layer exists to prevent.
- Only `.env.example` is committed. Never commit a real `.env` or captured auth
  state (`.auth/`); both are gitignored.

## Accessibility

Accessibility checks (`@axe-core/playwright`) target **WCAG 2.2 Level AA** and
fail on critical/serious violations, with a known-debt baseline for pre-existing
issues. The gate is introduced with the auth epic; new screens should be built to
pass it.

## Quality gates

Run `npm run check` (typecheck + lint + format) before pushing. Strict
`tsc --noEmit` is the real type gate — Playwright transpiles but does not
type-check. Favor `unknown` + narrowing over `any`.
