# `src/fixtures/` — composition root

**Single responsibility:** wire the layers together for tests. Fixtures are the
composition root that hands specs ready-to-use page objects, API clients, the
data factory, and authenticated state (via the `AuthProvider` contract).

This is where Playwright's `test.extend` lives, so a spec can declare exactly the
capabilities it needs and receive fully-composed, typed objects.

One fixture is automatic rather than requested: `capabilityGate` skips a spec
whose tags name a capability the installation has not enabled (`@discussions` on
an install without discussions, `@mfe-authn` where `CAPABILITIES=-mfe-authn`).
Gating in one place is what keeps specs free of configuration logic — ADR-0002's
rule that skips live in fixtures, not test bodies.

Rules:

- Fixtures compose; they do not implement business logic themselves.
- **Fixtures own the skips.** Whether a spec can run on this target — no
  `COURSE_KEY`, a course without a unit of the needed shape, an undeclared
  capability — is decided here, so test bodies hold no conditionals. The
  `capabilityGate` fixture is `auto` and reads each test's own tags.
- Skip for _optional_ coverage; fail for _misconfiguration_. `courseKey` skips
  when unset but fails when the target lacks the course.
- Per-test identity where state is mutated: `courseLearner` provisions a fresh
  learner and installs its session over the project's shared storage state, so
  enrollment and completion tests are parallel-safe.
- **Worker-scoped state where creation is irreversible.** Studio offers no
  course-deletion API, so `authoredCourse` is a worker fixture: one course per
  worker, created on first use and reused by every Studio spec in that worker,
  idempotent per (run id, worker slot) so a restarted worker finds its
  predecessor's course. Only a spec whose subject _is_ course creation makes its
  own. `studio` (test-scoped) is the skip gate for the Studio tree.
- **One author per worker.** `workerAuthor` provisions the author the worker runs
  as and overrides the `storageState` option so `page` and `request` load it
  (`.auth/author-worker-<n>.json`). The platform ends a user's other sessions on
  every sign-in (`PREVENT_CONCURRENT_LOGINS`), so a shared author would have
  workers logging each other out; `studioAuthorSession` normally completes Studio
  SSO silently off the loaded state and only re-logs-in through the UI to recover
  a decayed session. The admin stays shared: `adminPage` and `newOrgCreator` hold
  the `withAdminSession` lock for the whole test, and the default grant reuses
  the `setup` admin session where it is still alive.
- **Learners for the LMS half of a Studio case.** `newLearner()` provisions a
  fresh learner per call on a request context of its own (the author's `request`
  must stay the author's), disposed when the test ends.
- **Two content courses per worker.** `contentCourse` (seeded past-start with
  subsection gating on) is where the authoring round-trip specs build content —
  each builds its own section (`ownSection` / `authorSection`) and never touches
  another's — and `futureCourse` keeps a default 2040 start for future-dated
  publish and cross-course-paste cases. Both are worker-scoped and are the
  round-trip budget's two content courses, distinct from `authoredCourse` (which
  the settings specs move around). `authoringCourse` is a **fresh, empty** course
  per test, for building the outline through the UI where unambiguous
  `.first()`/`.last()` card lookups matter.
- **A round-trip learner is never the author's page.** `roundTripLearner` (and
  `roundTripLearners`, `futureCourseLearner`, `authoringCourseLearner` /
  `authoringCourseLearners`) each provision a fresh account enrolled in the
  matching course, holding **their own** browser context and request — the
  author's `page`/`request` are untouched, or `PREVENT_CONCURRENT_LOGINS` would
  evict one of the two sessions.
- **A staff API session for the global-staff-only reads.** `adminApi` hands a
  spec a superuser API context (Studio SSO completed) under the admin-session
  lock, for the few author-side actions the author cannot do — reindexing a
  course, reading the staff-only `reindex_link`.
- **Cohort fixtures need session auth.** The LMS cohort views are Django
  session-auth, not JWT: drive them from a fresh `loginSession` on a throwaway
  context, not the author's JWT-only session (see the `api/` README /
  `studio-auth-resilience.md`).
- This is the only layer that reaches across all the others.
