# `src/api/` — API client & data factories

**Single responsibility:** typed HTTP clients for the Open edX APIs the suite
needs, and deterministic, unique-per-run data factories. Set state up through
portable, documented endpoints — never a private fixture or Tutor-shell coupling
(ADR-0002).

Depends only on `src/config/`.

Contains:

- `csrf.ts` — `fetchCsrfToken`: the `GET /csrf/api/v1/token` the authn MFE makes
  before a credentialed POST. Lands the `csrftoken` cookie in the request context.
- `registration.ts` — `registerLearnerAccount`: creates a user via
  `POST /api/user/v1/account/registration/` (the authn MFE's `/register` path).
  Portable account seeding that needs no admin rights; on success the platform
  also signs the user in.
- `login.ts` — `loginSession`: signs in via `POST /api/user/v2/account/login_session/`
  with the CSRF header, leaving parent-domain session/JWT cookies in the jar.
- `user-identity.ts` — `newLearnerIdentity`: a unique-per-run learner identity
  (UUID-suffixed username/email, throwaway password) so parallel tests never
  collide.
- `errors.ts` — `ApiError`, carrying status/url/body for actionable failures.

These are the primitives the default auth provider (`src/auth/`) composes into a
captured storage state.
