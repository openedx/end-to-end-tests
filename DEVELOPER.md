# Developer guide

The short version of how to write a test here that passes review and keeps
passing on every target. It synthesizes [README.md](README.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [CONVENTIONS.md](CONVENTIONS.md), and the
agent skill under [`skills/openedx-e2e/`](skills/openedx-e2e/SKILL.md). Those are
authoritative; this document tells you what matters and where to read more.

The one idea everything follows from: **the suite is deployment-agnostic.** Any
provider points it at their installation through configuration alone
([ADR-0002](docs/decisions/0002-core-principles.rst)). If a change would only work
on one install, one language, or one release, it is the wrong change.

## Before you start

```sh
nvm use && npm install && npm run install:browsers
cp .env.example .env            # point at a dev/test install; never a shared production one
npx playwright test --project=unit   # no target or browser needed
```

- Every variable is documented in `.env.example`. Real env vars beat `.env`.
- All origins share one scheme and one registrable parent domain. No `localhost`,
  no IPs. Details: [README › Configuration](README.md#configuration).
- Course-completion specs need `COURSE_KEY` pointing at an imported demo course;
  unset means they skip, wrong means startup fails.
- Repeated local runs hit platform rate limits: registration (`60/7d`),
  password reset (`1/m` per IP), login (`30/5m` per account). Raise them on any
  target you run against often. [README › Account creation](README.md#account-creation--email-activation).
- Ask the install what it has before declaring `CAPABILITIES`; a declared
  capability the target lacks fails its specs by design.

Run selectively while developing:

```sh
npx playwright test tests/lms/auth/login.spec.ts -g "valid credentials" --headed
npm run test:ui                 # best for stepping through locators
npm run check                   # typecheck + lint + format:check, before every push
```

More: [`skills/openedx-e2e/references/running-tests.md`](skills/openedx-e2e/references/running-tests.md).

## Where code goes

Layers have a strict dependency direction. Never import sideways or downward.

| Layer    | Path                                   | Does                                                                | Never                              |
| -------- | -------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| config   | `src/config/`, `src/config/selectors/` | Validated env; one selector module per surface                      | reads `process.env` elsewhere      |
| api      | `src/api/`                             | Typed clients and data factories; throws `ApiError`                 | knows about pages                  |
| pages    | `src/pages/<domain>/<surface>.page.ts` | Locators and single-surface actions; waits for the change it caused | asserts                            |
| steps    | `src/steps/`                           | Multi-page flows; reports blockers instead of throwing              | asserts                            |
| fixtures | `src/fixtures/index.ts`                | Composition root; owns every `skip`                                 | business logic                     |
| tests    | `tests/<domain>/<feature>.spec.ts`     | One Feature per file; owns pass/fail                                | conditionals, selectors, env reads |

Domain decides the folder (`lms/auth`, `lms/course-home`, `studio/outline`).
Everything else, tier, capability, MFE, is a tag. Page objects are one per
surface the platform renders, so several specs share one page object.
Full table and diagram: [ARCHITECTURE.md](ARCHITECTURE.md#layered-architecture).

## Adding a spec

Build outward and stop at the first layer that already exists. Most new coverage
is a fixture tweak plus a spec.

1. **Anchors** in `src/config/selectors/<surface>.ts`, `as const`. Every anchor
   gets a comment naming the localized string it stands in for and any release
   caveat.
2. **State** in `src/api/<resource>.ts`. This is what the spec asserts on.
3. **Behaviour** in the page object. Constructor builds locators from the selector
   module; actions wait for a response or URL change, never a fixed time.
4. **Flows** in `src/steps/` only when a journey crosses page objects. Where a
   feature is one of two routes to the same place, the step takes whichever
   route the target offers so journey specs stay ungated (ex: `locateCourseInCatalog`
   which searches for a course when search is enabled, or paginates to find it 
   otherwise).
5. **Fixture** with a doc comment. Skips live here: "not configured" skips,
   "misconfigured" fails.
6. **Spec.** Tags, `testId(...)` annotation, `checkA11y` on every surface visited.

```ts
import { isEnrolled } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

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

Worked example with commentary:
[`skills/openedx-e2e/references/writing-tests.md`](skills/openedx-e2e/references/writing-tests.md).
Recipe in full: [CONVENTIONS › Adding a Feature spec](CONVENTIONS.md#adding-a-feature-spec).

## The rules reviewers will hold you to

1. **Never match the platform's localized text.** No `getByText`, `getByLabel`,
   `getByRole(…, { name: '<literal>' })`, `toContainText('<literal>')`, `hasText`,
   `:has-text()`. Priority: test ID, then stable attribute or role without a
   name, then structural CSS. Data the test itself typed is fine. Enforced by
   `tests/conventions/no-displayed-text.spec.ts`. If nothing non-localized exists,
   read the state from the API instead.
2. **The UI drives the action; the API decides the outcome.** UI assertions only
   where the rendering is the thing under test, and then structural.
3. **No fixed sleeps.** No `waitForTimeout`, no `force`. Budgets come from
   `src/config/timeouts.ts`; add a named, justified constant if none fits.
4. **Never compare a UI reading with a separately fetched value.** Platform
   state is recomputed asynchronously. Take both readings in one `expect.poll`.
5. **`count()` does not retry.** Use `toHaveCount` or `expect.poll` in specs. In
   a page object, branch on `count()` only after waiting for the container.
6. **Tags are one string each.** `tag: ['@regression', '@authenticated']`. A
   space-joined string is a single tag and silently defeats the capability gate.
7. **Parallel-safe by construction.** Unique-per-run data, own identity per test,
   no shared mutable state, setup through public APIs or documented seeding.
8. **Config through `getConfig()` or the `config` fixture.** Plugins under
   `plugins/` are the one exception and validate their own `PLUGIN_*` vars.
9. **Never commit `.env` or `.auth/`.**
10. **`npm run check` passes.** Strict `tsc` is the real type gate; Playwright
    only transpiles. Prefer `unknown` plus narrowing over `any`.

## Tags and projects

| Tag                      | Effect                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `@smoke` / `@regression` | Stability tier; anonymous projects of the same name                                                   |
| `@unit`                  | No browser or target; `unit` project                                                                  |
| `@authenticated`         | `lms-learner` project with the captured learner session. Mutating course state? Take `courseLearner`. |
| `@author`                | `studio-author` project, one author per worker. Always paired with `@studio` and `@mfe-authoring`.    |
| `@<capability>`          | Must exist in `src/config/capabilities.ts`. The `capabilityGate` fixture skips it where undeclared.   |
| `@mfe-*`                 | Filter only, except `@mfe-authn`, which is also a capability                                          |

A capability gates coverage that is _about_ the optional feature, not every spec
that passes through it. A gated spec must assert the feature's surface is
present, so a wrongly declared capability fails rather than passing vacuously.
Add `annotation: testId('TC-0000X')` for any BTR Release Test Plan case; the
test reporter writes `test-results/btr-coverage.json`.
Details: [CONVENTIONS › Tags](CONVENTIONS.md#tags).

## Accounts and sessions

- Get a learner through `provisionLearnerAccount(request, config)` or the
  `courseLearner` fixture. `ACCOUNT_BACKEND` decides how activation clears, so
  specs never assume one path. [`src/accounts/README.md`](src/accounts/README.md).
- One sign-in covers the LMS and every MFE via the shared parent domain. Studio
  keeps its own session behind a silent OAuth handshake. Never disable web
  security to make cross-origin auth work.
  [ARCHITECTURE › Authentication](ARCHITECTURE.md#authentication-and-multi-origin-sessions).

### Studio specs

Studio sessions are fragile by platform design: `PREVENT_CONCURRENT_LOGINS` ends a
user's other LMS sessions on every login, sessions live in an LRU Redis cache,
legacy views accept only the session cookie while DRF views accept the JWT, and
login is limited to 30 per account per 5 minutes by default. The fixtures encode the
survival strategy, so the rules for a spec are short:

- Depend on `studioAuthorSession` for browser work and on the worker course
  `authoredCourse`. There is no course-deletion API, so only a spec whose
  subject is course creation makes its own course (`lifecycleCourse`).
- **Same user in browser and API in one test: `page.request`, never `request`.**
  Pattern: `tests/studio/home/course-lifecycle.spec.ts`.
- **Different user: different context.** Learners via `newLearner`, a
  not-yet-course-creator author via `studioNewcomer`, the admin via `adminPage` or
  `newOrgCreator`. Never sign a second user in on the author's `page`, and never
  sign in as a shared account outside `withAdminSession`.
- LMS session-auth views (cohorts, instructor dashboard) reject JWT-only
  contexts with a 405. Open a fresh `loginSession` on a throwaway request
  context after the browser work, and dispose it in `finally`.
- Legacy CMS writes (`/course/`, `/xblock/`) need `studioWriteHeaders` and
  `maxRedirects: 0`, so a dead session surfaces as a 302 rather than a followed
  redirect that lands on a 404.
- Detect a dead session by the operation, never by probing `/api/user/v1/me`.
  It is JWT-authed and answers 200 on a dead session.
- No unconditional sign-ins. Every recovery spends one login on a clean context
  and persists the state.

## Known upstream defects

Write against the intended behaviour and mark the test so the report stays
honest. `test.fail()` for a defect you expect fixed; the body runs and an
unexpected pass fails the run, which is the signal to drop the marker.
`test.fixme()` in declaration form for a body that cannot run yet, so no fixture
provisions an account for nothing. Add an `issue(...)` annotation beside the
`testId`. Never soften the assertion or reach for `force`.
[CONVENTIONS › Known upstream defects](CONVENTIONS.md#known-upstream-defects).

## Accessibility

`await checkA11y(page, { label: '<surface>' })` on every surface a spec visits.
WCAG 2.2 AA, failing on critical and serious. Pre-existing debt is baselined in
`src/a11y/baseline.ts` and still reported. New screens should pass without
adding to it. Every run writes `test-results/a11y-violations.json`.

## Supporting several releases

Every PR runs against Tutor `main` and the last named release. One suite, no
branch per release, no version switches in code. Absorb a platform change with
the cheapest mechanism that fits:

1. Markup moved, both forms stable: widen the selector and comment which release
   has which.
2. Feature exists only from some release on: add a capability, tag the coverage,
   declare it per release in `.ci/openedx-releases.json` and `.env.example`.
3. Two implementations of one surface: two capabilities in
   `MUTUALLY_EXCLUSIVE_CAPABILITIES`; keep both sides' coverage.
4. Two routes to the same place: put the choice in a step, leave the journey ungated.
5. API shape changed: absorb both shapes in the `src/api/` client.

Never drop coverage older releases still need to make `main` pass. When a change
plausibly affects an older release, dispatch `run_tests_tutor.yml` with that
release rather than assuming.
[`skills/openedx-e2e/references/releases.md`](skills/openedx-e2e/references/releases.md).

## When a test fails

Classify first. A `ConfigError` at startup or every spec failing is the target,
not the test. A 403 `forbidden-request` or "previous request is in progress" is
a rate limit. A gated spec failing on a missing surface is a wrong `CAPABILITIES`
declaration. A locator timeout means the markup moved and the fix belongs in the
selector module. A Studio write that 302s while DRF writes pass is a session
problem and belongs in the rules above. A step reporting blockers is a property
of the target's content, not a failure to fix by weakening an assertion.

```sh
npm run report                                # trace, screenshot, video, a11y detail
npx playwright test <spec> -g "<title>" --retries=1 --trace=on
```

Look at the real page before guessing markup, then translate the finding into
the right layer. Full playbook, including live probes and reading CI artifacts:
[`debugging.md`](skills/openedx-e2e/references/debugging.md) and
[`ci-artifacts.md`](skills/openedx-e2e/references/ci-artifacts.md).

## Definition of done

- `npm run check` and `npx playwright test --project=unit` pass.
- The affected specs pass against a real target, and you say which releases you
  could and could not verify.
- Every new anchor has a comment naming the string it stands in for.
- Every new surface has a `checkA11y` call and no new baseline entries.
- No new file reads `process.env`, matches localized text, sleeps, or signs in
  unconditionally.
