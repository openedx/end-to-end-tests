# `src/fixtures/` — composition root

**Single responsibility:** wire the layers together for tests. Fixtures are the
composition root that hands specs ready-to-use page objects, API clients, the
data factory, and authenticated state (via the `AuthProvider` contract).

This is where Playwright's `test.extend` lives, so a spec can declare exactly the
capabilities it needs and receive fully-composed, typed objects.

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
- This is the only layer that reaches across all the others.
