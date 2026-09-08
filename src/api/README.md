# `src/api/` — API client & data factories

**Single responsibility:** typed HTTP clients for the Open edX APIs the suite
needs, and deterministic, unique-per-run data factories. Set state up through
portable, documented endpoints — never a private fixture or Tutor-shell coupling
(ADR-0002).

Depends only on `src/config/`.

Contains:

- `csrf.ts` — `fetchCsrfToken`: the `GET /csrf/api/v1/token` the authn MFE makes
  before a credentialed POST. Lands the `csrftoken` cookie in the request context.
  Takes an `origin` (LMS by default) because the cookie is per host: a Studio
  write needs a token from Studio.
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
  hard-coded copy — plus dates, pacing, effort, visibility and media, the LMS-side
  reading for what an author saved in Studio.
- `course-metadata.ts` — `fetchCourseMetadata`: course-home tabs (in learner
  order) and course access, the LMS-side reading for Pages & Resources toggles,
  custom-page order and prerequisite gating.
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

### Studio clients

Everything Studio-side goes through `studio-origin.ts` (`studioOrigin`,
`studioWriteHeaders`: Studio's CSRF token plus a Studio `Referer`) so a missing
`CMS_BASE_URL` reads as configuration.

- `studio-session.ts` — `establishStudioSession`: the silent OAuth handshake that
  gives a request context holding an LMS session its Studio session too. The LMS
  cookies alone get a `302 /login/` from every Studio URL and a `401` from every
  Studio API; after this one `GET` they work. Success is judged by
  `GET /api/user/v1/me` on Studio, not by a cookie name.
- `studio-home.ts` — `fetchStudioHome` (course-creator status, org flags,
  in-process re-runs) and `listStudioCourses` (the paginated list with the MFE's
  search / sort / filter parameters; falls back to the v1 payload on releases
  without the v2 endpoint).
- `course-creator.ts` — `requestCourseCreator` (the API) and
  `grantCourseCreator` (Studio's Django admin form, the only grant path on a
  default install; needs a superuser session) — BTR TC-00310 as a mechanism.
- `course-factory.ts` — `newCourseIdentity` (org + `E2E<run id><slot>` number:
  Studio's uniqueness rule is org+number, so the run does not disambiguate),
  `createCourse` (`POST /course/`; a duplicate is **HTTP 200 with `ErrMsg`**, so
  success is "the body has `course_key`"), `ensureCourse` (idempotent per
  identity, and the retry that absorbs `STUDIO-001`), `rerunCourse` /
  `waitForRerun`.
- `course-settings.ts` — Schedule & Details (`v1/course_details`, GET/PUT),
  grading (`v1/course_grading`), Advanced Settings (`/settings/advanced`, the
  legacy JSON view that answers on every release).
- `course-team.ts`, `group-configurations.ts`, `certificates.ts`,
  `course-apps.ts` (Pages & Resources toggles), `course-transfer.ts` (export
  start/poll, import status), `course-checklists.ts` (validation and quality
  behind the Launch and Best-practices checklists — served by the Studio origin).

The auth primitives are what the default auth provider (`src/auth/`) and the
account backends compose into a captured storage state; the course primitives
are what specs assert on ("the UI drives the action; the API decides the
outcome").
