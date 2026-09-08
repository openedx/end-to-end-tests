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
- This is the only layer that reaches across all the others.
