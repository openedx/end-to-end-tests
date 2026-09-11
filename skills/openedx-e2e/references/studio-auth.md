# Studio sessions: writing tests that survive session disruption

Read this before writing or debugging any spec under `tests/studio/`, any fixture
that signs in, or any `src/api/` client that hits a legacy (non-DRF) view.

## The platform facts everything follows from

1. **Two credentials per user, with different consumers.** A Django session
   cookie (LMS `sessionid`, ~2 weeks, not extended by activity) and a JWT cookie
   (~1 h; browsers refresh it, a captured API state cannot). DRF APIs
   (`/api/user/v1/me`, `/api/contentstore/...`, settings/grading/advanced writes,
   Blocks API) accept the JWT. Legacy views (`POST /course/` create and re-run,
   `POST /xblock/`, LMS instructor and cohort views, the Django admin) accept
   **only the session**.
2. **Studio has its own Django session**, obtained by a silent OAuth handshake:
   `GET ${CMS_BASE_URL}/login/` → LMS `/oauth2/authorize` (`cms-sso`) → back to
   Studio. It needs a live LMS session to trade and cannot recover from a dead
   one. `establishStudioSession` (API) and `establishStudioBrowserSession`
   (page) do this; success is judged by asking Studio who the session is.
3. **`PREVENT_CONCURRENT_LOGINS` is on by default and per service.** Every
   sign-in of a user ends that user's other sessions for that service. The
   Studio SSO handshake **is a CMS login**. A browser completing SSO evicts the
   same author's separate `request` context's Studio session; a second worker
   signing in as a shared account evicts the first's.
4. **Sessions live in the shared Redis cache with `allkeys-lru`.** Under memory
   pressure (CI) a session vanishes with no logout event and no log line. A
   service restart flushes them all. This is the dominant decay in CI and the
   SSO handshake cannot heal it; only a fresh credential sign-in can.
5. **Login is rate-limited per account**: `LOGISTRATION_PER_EMAIL_RATELIMIT_RATE`
   defaults to 30 per 5 minutes (`400 "Too many failed login attempts"`, 5-minute
   lockout). CI raises it to `100/m`; local runs do not. Every recovery path
   must spend zero logins when healthy and at most one when not.
6. **`login_session` refuses a dirty jar.** A credential POST on a context that
   still holds session cookies returns a bare-HTML 400, and `APIRequestContext`
   cannot clear cookies: API re-authentication always happens on a **new**
   context. Browser recoveries `clearCookies()` first. (A separate, fixed race:
   the very first POST on a fresh context can fail CSRF with the same bare 400;
   `loginSession` refetches the token and retries once.)
7. **`GET /api/user/v1/me` is JWT-authed.** It answers 200 on a dead session
   and is therefore useless as a liveness probe for session-auth work. The
   authenticated-vs-anonymous signal in a cookie jar is the JWT cookie's
   presence (`hasAuthenticatedSession`), never `sessionid`, which anonymous
   visitors also carry.

## The architecture that encodes them (`src/fixtures/index.ts`)

- **One author per worker** (`workerAuthor`, `studio-author` project). Each
  worker provisions its own account and captures state to
  `.auth/author-worker-<n>.json`; `page` and `request` load that file. A
  replacement worker resumes its slot's file and courses. Cross-worker eviction
  of authors is therefore impossible; the only shared accounts left are the
  admin and the `lms-learner` learner.
- **Self-healing holders, gated on failure evidence, persisted per worker:**

  | Holder | Detects a dead session by | Recovers with |
  |---|---|---|
  | worker course provisioning (`provisionWorkerCourse`) | `StudioSessionExpiredError` from `POST /course/` | fresh context, `reauthenticateStudioAuthor`, retry; also the post-provision smoke check |
  | browser (`studioAuthorSession`) | landing on the authn login field instead of Studio Home | one `signInToStudioThroughUi` as the worker author |
  | per-test `storageState` | `testInfo.retry > 0` | fresh context re-auth before `page`/`request` load the file |
  | per-test `request` before `/xblock/` writes | none: calls `establishAuthorWriteSession` (idempotent SSO handshake) | refreshes the Studio session off the still-live LMS session |

  Recoveries write back to the worker's state file so the rest of the worker
  reuses the live session. Never reduce `studioAuthorSession` to reuse-only.
- **Legacy writes go through `studioWrite`** (`src/api/studio-origin.ts`):
  `maxRedirects: 0`, any 3xx → `StudioSessionExpiredError` (re-authenticate,
  don't retry), 403 → permission message, 2xx with HTML → `ApiError{retryable}`.
  It also sends the XHR headers older releases need for JSON.
- **Shared accounts go behind `withAdminSession`** (`src/accounts/admin-lock.ts`),
  a cross-worker `mkdir` lock held from sign-in to the last request needing the
  session. `adminPage`, `adminApi`, `newOrgCreator`, and the course-creator grant
  all use it and reuse `.auth/staff.json` where they can.
- **Both cookies stay on API contexts.** Stripping the JWT to force session auth
  was tried twice and reverted: the call then has no fallback when the session
  decays.
- **State files are written atomically and validated on read**
  (`persistStorageState`, `isUsableStateFile`). Never `existsSync` then load.

## Rules for a Studio spec

1. Run in `studio-author`; depend on `studioAuthorSession` for browser work; use
   the worker courses (`authoredCourse`, `contentCourse`, `futureCourse`) or the
   per-test `authoringCourse` rather than creating courses ad hoc.
2. **Same user, browser + API in one test → `page.request`**, never the
   `request` fixture. The browser's SSO evicts a separate context and re-evicts
   it after every heal. Add the one-line comment pointing at
   `tests/studio/home/course-lifecycle.spec.ts`.
3. **Different user → different context.** Learners come from
   `roundTripLearner`(s) with their own browser context and request context.
   Admins come from `adminPage` / `adminApi`. Never `clearCookies()` and sign
   someone else in on the author's `page`. Mixing one user's session cookie with
   another's JWT triggers a safe-sessions user-mismatch logout.
4. **LMS session-auth views (cohorts, instructor dashboard, Django admin) → a
   fresh `loginSession` on a throwaway `playwright.request.newContext()`**, after
   the browser authoring is done, as the worker author
   (`fetchStudioUsername(page.request)` + `DEFAULT_PASSWORD`). Dispose it in
   `finally`. Pattern: `tests/studio/outline/sidebar.spec.ts`,
   `tests/studio/settings/group-configurations.spec.ts`, client in
   `src/api/cohorts.ts`.
5. **New legacy CMS writes go through `studioWrite`** so a dead session is a
   typed error. A per-test write on `request` (no browser session in the test)
   calls `establishAuthorWriteSession` first, or uses `page.request`.
6. **Detect a dead session by the operation, never by `/me`.** Attempt the
   write; recover on `StudioSessionExpiredError` or the login-page landing.
7. **Every recovery: one login, clean context, persist.** No unconditional
   per-test sign-in. If you add a sign-in, count it against 30 per account per
   5 minutes on a local run.
8. **Never sign in as a shared account outside `withAdminSession`.**
9. **Do not restart platform services after `setup`** has captured state.
10. **On a new deployment, check** `PREVENT_CONCURRENT_LOGINS`,
    `SESSION_INACTIVITY_TIMEOUT_IN_SECONDS`, `SESSION_COOKIE_AGE`,
    `LOGISTRATION_*_RATELIMIT_RATE`, and the Redis `maxmemory-policy`. Set
    Open edX flags top-level **and** guarded in `FEATURES` for older releases.

## Signature → cause → fix

| You see | It means | Do |
|---|---|---|
| Studio page lands on the authn login MFE mid-run | browser session evicted or expired | `studioAuthorSession` heals it; if it recurs every test, some other context is logging in as this user |
| Legacy write 302s / `StudioSessionExpiredError`, while DRF writes in the same test succeed | Studio session dead, JWT alive | re-auth on a clean context; if the test also holds a browser session, switch to `page.request` |
| Same 302 on every retry and every worker | browser SSO re-evicts a separate `request` after each heal | `page.request` |
| `/api/user/v1/me` is 200 but writes bounce | you probed the JWT | act on the operation's typed error instead |
| `POST /courses/<key>/cohorts/...` → **405** | JWT-only context hit an LMS session-auth view and was redirected to login | throwaway context + `loginSession` (rule 4) |
| `login_session` → bare-HTML `Bad Request (400)` | posting on a jar with session cookies, or the first-POST CSRF race | new context; the CSRF race is already retried |
| `login_session` → 400 JSON "Too many failed login attempts" | per-email rate limit | wait 5 min; find and gate the unconditional re-login |
| Registration or password reset → 403 forbidden-request in CI | per-day platform rate limits exhausted | already raised to `100/m` in the Tutor patch |
| CI: one worker, every request `user None`, one unchanging session id for minutes | Redis LRU evicted the session | provisioning's re-auth covers it; never restart services mid-run |
| `Unterminated string in JSON` on `.auth/*.json` on every retry of a slot | torn state file | a writer bypassed `persistStorageState` |
| Legacy write → 404 on the collection URL | a followed 302-to-login became a GET | `maxRedirects: 0` via `studioWrite` |
| Re-run → 403 | destination is a new course *number* | re-run keeps org + number, changes `run` |
| Admin in the browser reaches only the login screen despite injected staff cookies | a captured API state does not drive interactive SSO | `signInToStudioThroughUi` under `withAdminSession` |
| HTML body from a legacy Studio view on an older release | missing XHR headers | `studioWriteHeaders` |

## Not auth, though it looks like it

- A re-run that "never finishes": it is a Celery task the CMS worker picks up
  late under load. Poll for the destination course, not Studio Home's
  in-process list (`waitForRerun`).
- A 2xx with an HTML error page under CMS load: `ApiError{retryable}`, retry
  the same call.

## Tried and reverted, do not retry without new evidence

Stripping the JWT from `request`; reuse-only `studioAuthorSession`;
unconditional per-test UI sign-in for the author; `/me` as a pre-write liveness
check; healing a separate `request` on retry while the test also holds a
browser session; explaining login 400s as "accounts inactive / must use email".
