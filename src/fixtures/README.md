# `src/fixtures/` — composition root

**Single responsibility:** wire the layers together for tests. Fixtures are the
composition root that hands specs ready-to-use page objects, API clients, the
data factory, and authenticated state (via the `AuthProvider` contract).

This is where Playwright's `test.extend` lives, so a spec can declare exactly the
capabilities it needs and receive fully-composed, typed objects.

Rules:

- Fixtures compose; they do not implement business logic themselves.
- This is the only layer that reaches across all the others.
