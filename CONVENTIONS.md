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

Prefer stable, user-facing locators. **Never match on the target's displayed
(localized) text** — installations run in different languages, so text-based
locators break under a different site language. Priority order:

1. **Test IDs** — `getByTestId(...)` where the app exposes them.
2. **Stable attributes / roles** — `name` / `id` / `href` attributes, or
   `getByRole('<role>')` **without** a localized `name`.
3. **CSS containers** — only as a last resort, for language-independent structural
   scoping.

Do **not** use `getByText`, `getByLabel`, `getByRole(..., { name: '<literal>' })`,
`toContainText('<literal>')`, `hasText`, `:has-text()`, etc. against platform copy.
Matching a value the test itself supplied (a generated username, a name you typed)
is fine — that is your own, language-independent data. The rule is enforced by
`tests/conventions/no-displayed-text.spec.ts` and detailed in
[ARCHITECTURE.md](ARCHITECTURE.md#locators-never-depend-on-displayed-text).

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
- Obtain a sign-in-able learner via `provisionLearnerAccount(request, config)`
  (`src/accounts/`), never by assuming a target auto-activates. The configured
  `ACCOUNT_BACKEND` decides how the account clears email validation, so specs stay
  the same across targets.

## Tags

Domain decides the folder; everything else is a tag. Tags drive Playwright
project selection (`--grep`) and make failures legible to non-technical readers.

- **Stability tier:** `@smoke` (critical path), `@regression` (broader depth).
- **Pure logic:** `@unit` (no browser/target; runs in the `unit` project).
- **Capability:** `@discussions`, `@teams`, `@certificates`, … — gates optional
  coverage on installations that declare the capability (see `CAPABILITIES` in
  `.env.example`). Keep tags in sync with `src/config/capabilities.ts`. **The gate
  is automatic**: the `capabilityGate` fixture reads each test's own tags and skips
  it when the installation does not declare one of them, so the tag is the whole of
  the contract — there is nothing else to keep in sync.
- **MFE / subsystem:** `@mfe-authn`, `@mfe-account`, `@mfe-learning`,
  `@mfe-authoring`, … — filters the suite to one micro-frontend.
- **Authenticated:** `@authenticated` — the spec reuses captured storage state and
  runs in the `lms-learner` project (which depends on `setup`); the anonymous
  `@smoke`/`@regression` projects exclude it.

Apply tags with the `tag` option, **one string per tag**:

```ts
test('the LMS landing page loads', { tag: '@smoke' }, async ({ page }) => {
  /* ... */
});

test('outline renders', { tag: ['@regression', '@authenticated'] }, async ({ page }) => {
  /* ... */
});
```

A space-separated string (`tag: '@regression @authenticated'`) is **one** tag as
far as Playwright is concerned. `--grep` still appears to work, because it matches
on substrings, but anything reading `testInfo.tags` — the capability gate above —
sees a single unrecognized tag and silently does nothing.

## BTR test-case IDs

Tests that correspond to a case in the BTR Release Test Plan carry that case's ID
explicitly — as a `test_id` annotation of the form `TC-0000X`, never inferred from
the title. Build it with the `testId` helper so typos fail fast:

```ts
import { testId } from '../../../src/reporting';

test('signs in with valid credentials', { tag: '@smoke', annotation: testId('TC-00003') }, ...);
```

The always-on coverage reporter maps each `test_id` to its outcome and reports
annotation coverage every run, writing `test-results/btr-coverage.json` (a local
file only — see `src/reporting/README.md` for the upload/sheet policy).

## Known upstream defects

When a test case describes behaviour the platform does not yet deliver, write the
spec against the **intended** behaviour, mark it `test.fixme()` with the issue URL
in the reason, and add an `issue(...)` annotation next to its `test_id`:

```ts
test(
  'clears the search in a single click',
  {
    tag: '@regression',
    annotation: [testId('TC-00016'), issue('https://github.com/openedx/…/issues/160')],
  },
  async ({ catalogPage }) => {
    test.fixme(true, 'The clear-search button needs two clicks: https://github.com/…/160');
    /* ... */
  },
);
```

This keeps the report honest: the coverage gap is visible and attributed, and the
test starts failing the day the fix lands, which is the signal to drop the
`fixme`. Do **not** instead soften the assertion to match the buggy behaviour, and
do not work around a defect with `force`. Where a workaround is genuinely needed
to reach _other_ coverage, put it in the page object with a comment naming the issue,
and keep a separate `fixme` test on the broken path itself.

## Configuration and secrets

- Read configuration through `getConfig()` / the `config` fixture. **Never read
  `process.env` directly in specs, pages, or steps** — that is the anti-pattern
  the typed config layer exists to prevent.
- Only `.env.example` is committed. Never commit a real `.env` or captured auth
  state (`.auth/`); both are gitignored.

## Accessibility

Accessibility checks (`@axe-core/playwright`) target **WCAG 2.2 Level AA** and
fail on critical/serious violations, with a known-debt baseline for pre-existing
issues. Call the gate as an explicit assertion line:

```ts
import { checkA11y } from '../../../src/a11y';

await checkA11y(page, { label: 'login' });
```

Baselined rules (`src/a11y/baseline.ts`) are still executed and reported, just not
failed — unlike disabling a rule, which hides it. New screens should pass the gate
without adding to the baseline.

Every run consolidates all scans into **`test-results/a11y-violations.json`**
(grouped by rule; failing / baselined / below-threshold) — the working list for
fixing the accessibility backlog. Per-screen detail is also attached to each test
in the HTML report.

## Quality gates

Run `npm run check` (typecheck + lint + format) before pushing. Strict
`tsc --noEmit` is the real type gate — Playwright transpiles but does not
type-check. Favor `unknown` + narrowing over `any`.
