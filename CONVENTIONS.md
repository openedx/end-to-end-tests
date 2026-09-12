# Conventions

Living companion to [ADR-0002](docs/decisions/0002-core-principles.rst) and
[ARCHITECTURE.md](ARCHITECTURE.md). These are the day-to-day rules for writing
tests in this suite.

## Files and naming

- Specs: `tests/<domain>/<feature>.spec.ts` (e.g. `tests/lms/auth/login.spec.ts`).
- Page objects live in the matching domain folder, **one per surface** the
  platform renders, not one per spec: `src/pages/<domain>/<surface>.page.ts`
  (`catalog.page.ts` serves both `discovery.spec.ts` and `enrollment.spec.ts`).
- Component objects for something rendered _inside_ a surface — an XBlock in a
  unit — use `*.block.ts` beside their page (`courseware/problem.block.ts`).
- Setup projects: `*.setup.ts`.
- One `*.spec.ts` covers one Feature — focused coverage of a single capability.
  To extend the suite, add a new spec under the relevant domain composing existing
  page objects, steps, and fixtures.

## Adding a Feature spec

The layers exist so a spec reads as a sequence of intentions, not of selectors.
Build outwards in this order, and stop as soon as the layer you need already
exists — most new coverage adds only the last two steps.

**1. Anchors → `src/config/selectors/<surface>.ts`.** One module per surface. Give
every anchor a comment naming the localized string it stands in for, so a reader
can trace the spec back to its test case without the suite depending on copy.

```ts
export const CATALOG_SELECTORS = {
  /** Header link to the catalog — the sheet's "Discover New" link. */
  navCatalogLink: 'a.nav-link[href$="/courses"]',
} as const;
```

**2. State → `src/api/<resource>.ts`.** A typed client for whatever the platform
knows about the thing under test. This is what the spec will _assert_ on: an API
answer is numeric or an enum, so it survives both translation and MFE re-skinning.
Throw `ApiError` with an actionable message on an unexpected response.

**3. Behaviour → `src/pages/<domain>/<feature>.page.ts`.** Locators and
single-surface actions. Page objects **never assert** — they navigate, click and
fill, and wait for the state change their action causes (a response, a URL change),
never for a fixed time.

**4. Multi-surface flows → `src/steps/<flow>.ts`.** Only when a journey crosses
page objects (enroll through the catalog; complete a unit). A step that cannot do
its job **reports why** — returning the blockers, as `completeUnit` does — rather
than throwing or, worse, quietly succeeding.

**5. Composition → `src/fixtures/index.ts`.** Add a fixture so the spec receives a
finished object. Put any `skip` here too: a course without the content a spec needs
is a fixture concern, and it keeps conditionals out of the test body. Distinguish
"not configured" from "misconfigured": `courseKey` skips when `COURSE_KEY` is
unset but **fails** (via `assertCourseAccessible`) when it names a course the
target does not have, because that is an operator error, not optional coverage.

**6. The spec → `tests/<domain>/<feature>.spec.ts`.** One Feature per file. Each
test carries its stability tier, any capability tag, `@authenticated` if it reuses
the captured session, and a `testId(...)` annotation when it maps to a BTR case.

```ts
test(
  'enrolls a learner from the course About page',
  { tag: ['@smoke', '@authenticated'], annotation: testId('TC-00008') },
  async ({ request, config, courseAboutPage, courseLearner }) => {
    await courseAboutPage.goto(courseLearner.courseKey);
    await courseAboutPage.enroll(courseLearner.courseKey);

    // The UI drove the action; the API decides whether it worked.
    expect(await isEnrolled(request, config, courseLearner.courseKey)).toBe(true);
  },
);
```

Then add the accessibility gate for any surface the spec visits
(`await checkA11y(page, { label: 'course-about' })`) and run `npm run check`.

### The division that matters

**The UI drives the action; the API decides the outcome.** Reserve UI assertions
for cases where the rendering _is_ the thing under test — a completion marker
appearing, a form's error state — and keep them structural. Everything else, ask
the platform.

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
- **Never compare a value read from the UI against a value fetched separately
  beforehand.** Platform state (grades, completion) is recomputed asynchronously,
  so two readings taken at different moments can straddle an update and disagree
  when nothing is wrong. Take both readings together inside `expect.poll(...)`,
  then restate the comparison as an equality so a real failure names both values.
- **No fixed sleeps.** Never use `waitForTimeout`. Wait for a condition, and take
  timeout budgets from `src/config/timeouts.ts`.
- **`count()` does not retry.** In a spec, prefer `toHaveCount` or `expect.poll`.
  In a page object or step, branching on `count()` is acceptable only after an
  explicit wait for the container it is counted in (`waitFor({ state: 'attached' })`
  on the block, a response the content follows), never straight after navigation.
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
- **Capability:** `@discussions`, `@teams`, `@notes`, `@mfe-authn`, … —
  gates coverage on what the installation has (see `CAPABILITIES` in
  `.env.example`). `src/config/capabilities.ts` is the authoritative vocabulary; a
  tag must match an entry there. A tag that names a capability is **enforced** —
  the `capabilityGate` fixture in `src/fixtures/` reads each test's own tags and
  skips it where that capability is not enabled, so the tag is the whole of the
  contract — while any other tag is only a filter. Most capabilities are off until
  declared; the `DEFAULT_ON_CAPABILITIES` (stock surfaces, currently `mfe-authn`
  and `frontend-base`) are on unless turned off with a `-` prefix.

  `@frontend-base` marks coverage that only makes sense in the `frontend-base`
  shell (`main` onward): its chrome's a11y debt, markup only it renders. It is
  **not** a version switch — a journey that merely passes through the shell stays
  ungated and matches both headers with a selector union (see
  `src/config/selectors/account-menu.ts`). Reach for the tag only when the two
  models need mutually exclusive assertions.

  A capability gates the coverage that is _about_ the optional feature, not every
  spec that happens to pass through it. Where the feature is one of two routes to
  the same place, give the journey a step that takes whichever route the target
  offers and leave those specs ungated — `locateCourseInCatalog` does this for
  catalog search (`@catalog-search`), so discovery and enrollment coverage runs on
  an install with no search field while the search specs themselves skip. A gated
  spec should assert the feature's surface is really present, so a target that
  declares a capability it does not have fails rather than passing vacuously.

- **MFE / subsystem:** `@mfe-account`, `@mfe-learning`, `@mfe-authoring`, … —
  filters the suite to one micro-frontend. `@mfe-authn` is also a capability, so
  apply it only to coverage that genuinely needs the authn MFE — not to specs
  that drive sign-in through the account backend's flows.
- **Authenticated:** `@authenticated` — the spec runs in the `lms-learner` project
  (which depends on `setup`); the anonymous `@smoke`/`@regression` projects exclude
  it. The project loads the captured learner storage state, and specs that only
  read (`session`, `profile`) use it as is. Specs that **change course state**
  (enroll, complete, grade) request `courseLearner`, which provisions a fresh
  learner for that test and installs its session in place of the shared one, so
  parallel tests never share an enrollment. That costs one registration per test —
  see the README's rate-limit section.

- **Author:** `@author` — the spec runs in the `studio-author` project (depends on
  `setup`) as the worker's own author (`workerAuthor`), whose session is valid on
  Studio and the LMS; the anonymous projects exclude it. A spec that signs a
  browser in as the **admin** takes the `adminPage`/`newOrgCreator` fixtures,
  which hold the cross-worker admin lock — never sign the admin in from a test
  body. Every Studio spec also carries `@studio`, the
  capability that gates the tree, and `@mfe-authoring`. Studio specs act on the
  worker-scoped `authoredCourse` unless creating a course is the thing under test:
  **there is no course-deletion API, so a Studio spec never creates a course it
  does not have to.**

Apply tags with the `tag` option:

```ts
test('the LMS landing page loads', { tag: '@smoke' }, async ({ page }) => {
  /* ... */
});
```

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

## Timing report

Every run also writes `test-results/timings-tests.csv` (one row per test attempt)
and `test-results/timings-steps.csv` (one row per recorded step), each row stamped
with the run's start time and target URL for import into a spreadsheet or
database and comparison across runs. Nothing to do in a spec: Playwright records
the durations; the reporter reshapes them. Wrapping a long flow in
`test.step('…')` gives it a named row in the steps file.

## Known upstream defects

When a test case describes behaviour the platform does not yet deliver, write the
spec against the **intended** behaviour and mark it so the report stays honest.
Two markers exist and they do different jobs:

- **`test.fail()` — a defect we expect to be fixed.** The body runs on every run
  and is expected to fail. The day the fix lands the body passes, Playwright
  reports an _unexpected pass_ and fails the run, and that is the signal to drop
  the marker. Put the issue URL in the reason and add an `issue(...)` annotation
  next to the `test_id`:

  ```ts
  test(
    'clears the search in a single click',
    {
      tag: '@regression',
      annotation: [testId('TC-00016'), issue('https://github.com/openedx/…/issues/160')],
    },
    async ({ catalogPage }) => {
      test.fail(true, 'The clear-search button needs two clicks: https://github.com/…/160');
      /* ... */
    },
  );
  ```

- **`test.fixme()` — a body that cannot run yet.** Nothing in the platform will
  flip it: the course content lacks what it needs, or the mechanism has no
  automatable path (a third-party video player). Use the **declaration form** so
  Playwright skips it before any fixture runs — an in-body `test.fixme(true, …)`
  still provisions a learner, enrolls and fetches the outline, then skips, which
  spends the registration rate limit for nothing. Say why in a comment above it:

  ```ts
  // The demo course's videos are YouTube-hosted; there is no player handle to drive.
  test.fixme(
    'completes a unit containing a video by watching it',
    { tag: ['@smoke', '@authenticated'], annotation: testId('TC-00022') },
    async ({ courseOutline }) => {
      /* ... */
    },
  );
  ```

The coverage reporter reads both the same way — an expected failure or a `fixme`
counts as `skipped` for its BTR case, so a case with passing siblings shows as
`partial` — and treats an unexpected pass as a failure so a stale marker is
visible. Do **not** instead soften the assertion to match the buggy behaviour, and
do not work around a defect with `force`. Where a workaround is genuinely needed
to reach _other_ coverage, put it in the page object with a comment naming the
issue, and keep a separate `test.fail` test on the broken path itself.

## Configuration and secrets

- Read configuration through `getConfig()` / the `config` fixture. **Never read
  `process.env` directly in specs, pages, or steps** — that is the anti-pattern
  the typed config layer exists to prevent.
- **Plugins are the one exception.** An account-backend plugin under `plugins/`
  (or an operator's own) has no hook into the config schema, so it reads and
  validates its own `PLUGIN_*` variables at load time and fails with a clear
  message before any account is registered. Its polling budgets are its own too,
  since `TIMEOUTS` is tuned for browser actions; keep them named and documented.
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
