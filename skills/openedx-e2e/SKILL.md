---
name: openedx-e2e
description: Work on the Open edX end-to-end Playwright suite in this repo — write or extend specs, run them against a local/remote/CI target, debug failures with live Playwright probes, and update tests without breaking older named releases. Use for any task touching tests/, src/pages, src/steps, src/api, src/config, playwright.config.ts, or the CI workflows here.
---

# Open edX end-to-end test suite

Playwright + TypeScript e2e tests for the Open edX platform. **The suite is
deployment-agnostic**: any provider must be able to point it at their own
installation through configuration alone, with no code edits. Almost every rule
below follows from that.

## Read the foundations first

Authoritative, in this order. Read the ones relevant to the task before writing
code — don't work from this skill alone:

| Document                                       | What it fixes                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/decisions/0001-purpose-of-this-repo.rst` | Why the repo exists; Playwright chosen; treated as experimental.                                                                                                                     |
| `docs/decisions/0002-core-principles.rst`      | **The intent.** Deployment-agnostic config, capability gating, auth contract, strict TS, domain-first layout, a11y, BTR `test_id` cross-linking, framework principles.               |
| `ARCHITECTURE.md`                              | **The mechanics.** Layer diagram + dependency direction, locator rule, multi-origin auth/storage state, Playwright projects, `src/reporting` + `src/a11y`.                           |
| `CONVENTIONS.md`                               | **Day-to-day rules.** Naming, the 6-step recipe for adding a Feature spec, locators, assertions, test data, tags, `test_id`, upstream-defect handling, secrets, a11y, quality gates. |
| `README.md`                                    | Setup, every env var, account backends, rate limits, run commands, CI workflows, project structure.                                                                                  |
| `src/*/README.md`                              | Per-layer responsibility (`src/config`, `src/api`, `src/accounts`, `src/fixtures`, `src/steps`, `src/reporting`, `src/config/selectors`).                                            |

Ignore `docs/planning/` and `.private/` for anything you write or cite — they
are not foundational and must not be referenced from code, docs, or commits.

## The rules that get broken most

1. **Never match the platform's localized text.** No `getByText`, `getByLabel`,
   `getByRole(…, { name: '<literal>' })`, `toContainText('<literal>')`,
   `hasText`, `:has-text()` against platform copy. Locator priority: test ID →
   stable attribute/role (no localized name) → structural CSS. Matching data the
   test itself supplied is fine. Enforced by
   `tests/conventions/no-displayed-text.spec.ts`.
2. **The UI drives the action; the API decides the outcome.** Assert on
   `src/api/` answers (numeric/enum/boolean) unless the rendering _is_ the thing
   under test — and then keep the assertion structural.
3. **Layer direction is strict:** `config → api → pages → steps → fixtures →
tests` (plus `config → auth → fixtures`). Never sideways or downward. Page
   objects and steps never assert; specs own pass/fail. Skips belong in fixtures,
   not in test bodies.
4. **No fixed sleeps, no `waitForTimeout`.** Wait for conditions; take budgets
   from `src/config/timeouts.ts`, adding a justified named constant if none fits.
5. **Never read `process.env` directly** in specs, pages, or steps — go through
   `getConfig()` / the `config` fixture.
6. **Never compare a UI reading against a separately-fetched value.** Take both
   readings inside one `expect.poll(...)`.
7. **Tags are one string per tag** — `tag: ['@regression', '@authenticated']`,
   never `'@regression @authenticated'` (that is a single tag to Playwright and
   silently defeats the capability gate).
8. **Parallel-safe:** unique-per-run data, each test owns its identity, no shared
   mutable state, portable setup (public APIs / documented idempotent seeding).
9. **Never commit** a real `.env` or `.auth/`.
10. `npm run check` (typecheck + lint + format:check) must pass before pushing.

## Workflows

Load the reference file for the task at hand:

- **Writing or extending a spec** → `references/writing-tests.md`
- **Running the suite against an environment** → `references/running-tests.md`
- **Debugging a failure (incl. live Playwright probes)** → `references/debugging.md`
- **Changing tests for platform changes across named releases** → `references/releases.md`
