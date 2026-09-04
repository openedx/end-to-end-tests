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
- `activation.ts` — `activateAccount` / `extractActivationKey`: visits the
  `/activate/<key>` link (or bare key) an install that enforces email validation
  sends, for the `manual` and plugin account backends.
- `enrollment.ts` — `isEnrolled` / `enrollInCourseViaApi`: the enrollment API,
  both the outcome the catalog specs assert on and the portable seeding the
  course-state fixtures use.
- `course-detail.ts` — `fetchCourseDetail`: the course's own name/org/number,
  so a spec can search or match on data the platform supplied rather than on
  hard-coded copy.
- `course-outline.ts` — `fetchCourseOutline` / `buildOutline` / `unitsContaining`:
  the Blocks API folded into sections → subsections → units with per-block
  completion, which is what the completion steps and fixtures drive from.
- `course-preflight.ts` — `assertCourseAccessible` / `courseKeySkipReason`:
  distinguishes "no `COURSE_KEY`" (fixtures skip) from "`COURSE_KEY` names a
  course the target lacks" (`CoursePreflightError`, the run fails).
- `progress.ts` — `fetchCourseProgress`: the course-home progress API — grade,
  passing threshold, completion counts — the numeric answers the course-home
  specs assert on.
- `errors.ts` — `ApiError`, carrying status/url/body for actionable failures.

The auth primitives are what the default auth provider (`src/auth/`) and the
account backends compose into a captured storage state; the course primitives
are what specs assert on ("the UI drives the action; the API decides the
outcome").
