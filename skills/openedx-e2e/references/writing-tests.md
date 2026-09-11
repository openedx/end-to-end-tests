# Writing and extending tests

`CONVENTIONS.md` ("Adding a Feature spec") is authoritative. This is the working
checklist.

## Where things go

```
tests/<domain>/<feature>.spec.ts        one Feature per file
src/pages/<domain>/<feature>.page.ts    mirrors the spec tree
```

Domain (`lms/auth`, `lms/course-home`, `studio/outline`, …) decides the folder.
Everything else — stability tier, capability, MFE — is a **tag**, never another
folder. Adding coverage for an area that already has page objects and fixtures
should be a new `*.spec.ts` and nothing else.

## Build outward, stop as soon as the layer exists

1. **Anchors** → `src/config/selectors/<surface>.ts`. One module per surface,
   `as const`. Every anchor carries a comment naming the localized string it
   stands in for, so a reader can trace the spec back to its BTR case without the
   suite depending on copy. Note version-specific quirks in the comment.
2. **State** → `src/api/<resource>.ts`. A typed client for what the platform
   knows about the thing under test — this is what the spec asserts on. Throw
   `ApiError` with an actionable message on an unexpected response.
3. **Behaviour** → `src/pages/<domain>/<feature>.page.ts`. Locators built from
   the selector module in the constructor; `url()`/`goto()`; single-surface
   actions that wait for the state change they cause (a response, a URL change),
   never a fixed time. **No assertions.**
4. **Multi-surface flows** → `src/steps/<flow>.ts`, only when a journey crosses
   page objects. A step that cannot do its job **reports why** (returns the
   blockers, as `completeUnit` does) rather than throwing or quietly passing.
   Where a feature is one of two routes to the same place, the step takes
   whichever route the target offers (see `locateCourseInCatalog`) so the
   journey coverage stays ungated.
5. **Composition** → `src/fixtures/index.ts`. Add a typed fixture with a doc
   comment so the spec receives a finished object. Put any `test.skip` condition
   here (missing `COURSE_KEY`, a course lacking the needed content) — conditionals
   do not belong in test bodies.
6. **The spec** → `tests/<domain>/<feature>.spec.ts`.

```ts
import { isEnrolled } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { catalogSearchTermFor, locateCourseInCatalog } from '../../../src/steps';

/**
 * Enrollment through the course About page — the journey a learner takes from
 * discovery to being enrolled.
 *
 * The UI drives the action; the **enrollment API decides pass/fail**. The test
 * case's wording ("the button is disabled and says *You are enrolled in this
 * course*") is deliberately not asserted as copy — and on this platform version
 * the enrolled state is not a disabled button at all, but a link into the
 * courseware, which is what the structural assertion below checks.
 */
test.describe('Course enrollment', () => {
  test(
    'enrolls a learner from the course About page',
    { tag: ['@smoke', '@authenticated'], annotation: testId('TC-00008') },
    async ({ request, config, catalogPage, courseAboutPage, courseDetail, courseLearner }) => {
      const { courseKey } = courseLearner;

      // Not enrolled yet: the About page offers the enroll call to action and no
      // route into the courseware. Reached through the catalog, by search where the
      // installation enables it and by paging the list where it does not — see
      // `locateCourseInCatalog`.
      await locateCourseInCatalog(
        catalogPage,
        config,
        courseKey,
        catalogSearchTermFor(courseDetail),
      );
      await catalogPage.openCourseAbout(courseKey);

      await expect(courseAboutPage.enrollButton).toBeEnabled();
      await expect(courseAboutPage.coursewareLink(courseKey)).toHaveCount(0);
      expect(await isEnrolled(request, config, courseKey)).toBe(false);

      await courseAboutPage.enroll(courseKey);

      // The authoritative check: the platform records an active enrollment.
      expect(await isEnrolled(request, config, courseKey)).toBe(true);

      // Revisiting About shows the enrolled state — a way into the course rather
      // than an enroll button.
      await courseAboutPage.goto(courseKey);
      await expect(courseAboutPage.coursewareLink(courseKey)).toBeVisible();
      await expect(courseAboutPage.enrollButton).toHaveCount(0);
    },
  );
});
```

Then add `checkA11y(page, { label: '<surface>' })` for every surface the spec
visits, and run `npm run check`.

## Tags

- Tier: `@smoke` (critical path) or `@regression` (broader depth); `@unit` for
  pure logic (no browser/target).
- Capability: `@discussions`, `@catalog-search`, … — must exist in
  `src/config/capabilities.ts`. The `capabilityGate` fixture reads the test's
  own tags and skips automatically, so **the tag is the whole contract**. A gated
  spec must assert the feature's surface is really present, so a target that
  declares a capability it lacks fails rather than passing vacuously.
- MFE/subsystem: `@mfe-authn`, `@mfe-learning`, `@mfe-authoring`, …
- `@authenticated` when the spec reuses the captured learner session (runs in the
  `lms-learner` project). Tests that mutate per-user course state should instead
  take their own identity (`courseLearner`) for parallel safety.

## BTR test IDs

Add `annotation: testId('TC-0000X')` for any test that maps to a BTR Release Test
Plan case — explicit, never inferred from the title. The always-on coverage
reporter writes `test-results/btr-coverage.json`.

## Test data and accounts

- Generate deterministic, unique-per-run data.
- Prefer creating state via `src/api/` factories over driving the UI, unless the
  UI flow is under test.
- Get a sign-in-able learner via `provisionLearnerAccount(request, config)`
  (`src/accounts/`) — never assume the target auto-activates. `ACCOUNT_BACKEND`
  decides how activation clears, so specs stay identical across targets.

## Studio specs and sessions

Studio tests run in the `studio-author` project as a per-worker author whose
session can be evicted at any time by the platform (concurrent-login rule, Redis
eviction). `references/studio-auth.md` has the full model; the non-negotiables:

- Depend on `studioAuthorSession` for browser work and on a worker course
  (`authoredCourse`, `contentCourse`, `futureCourse`) or `authoringCourse`.
- API calls as the same author in a test that holds a browser session use
  `page.request`, not the `request` fixture.
- Other users (learners, admin) get their own context: `roundTripLearner`,
  `adminPage` / `adminApi`. Never sign a second user in on the author's `page`.
- LMS session-auth views (cohorts) need a fresh `loginSession` on a throwaway
  request context, opened after the browser authoring is done.
- New legacy CMS writes (`/course/`, `/xblock/`) go through `studioWrite`.
- Never add an unconditional sign-in: the login limit is 30 per account per 5
  minutes on a default install.

## Known upstream defects

Write the spec against the **intended** behaviour, add `test.fixme(true, '<why>:
<issue URL>')` and an `issue(...)` annotation beside the `test_id`. Do not soften
the assertion to match the bug, and do not paper over it with `force`. If a
workaround is needed to reach _other_ coverage, put it in the page object with a
comment naming the issue and keep a separate `fixme` test on the broken path.

## Accessibility

WCAG 2.2 AA via `@axe-core/playwright`; fails on critical/serious. Pre-existing
issues go in the known-debt baseline (`src/a11y/baseline.ts`) — still executed and
reported, just not failed. New screens should pass without adding to the baseline.
Every run consolidates scans into `test-results/a11y-violations.json`.
