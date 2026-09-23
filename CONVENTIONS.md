# Conventions

Living companion to [ADR-0002](docs/decisions/0002-core-principles.rst) and
[ARCHITECTURE.md](ARCHITECTURE.md). These are the day-to-day rules for writing
tests in this suite.

## Files and naming

- Specs: `tests/<domain>/<feature>.spec.ts` (e.g. `tests/lms/auth/login.spec.ts`).
- Page objects live in the matching domain folder, **one per surface** the
  platform renders, not one per spec: `src/pages/<domain>/<surface>.page.ts`
  (`catalog.page.ts` serves both `discovery.spec.ts` and `enrollment.spec.ts`).
- Component objects for something rendered _inside_ a surface — an XBlock in a
  unit — use `*.block.ts` beside their page (`courseware/problem.block.ts`).
- Setup projects: `*.setup.ts`.
- One `*.spec.ts` covers one Feature — focused coverage of a single capability.
  To extend the suite, add a new spec under the relevant domain composing existing
  page objects, steps, and fixtures.

## Adding a Feature spec

The layers exist so a spec reads as a sequence of intentions, not of selectors.
Build outwards in this order, and stop as soon as the layer you need already
exists — most new coverage adds only the last two steps.

**1. Anchors → `src/config/selectors/<surface>.ts`.** One module per surface. Give
every anchor a comment naming the localized string it stands in for, so a reader
can trace the spec back to its test case without the suite depending on copy.

```ts
export const CATALOG_SELECTORS = {
  /** Header link to the catalog — the sheet's "Discover New" link. */
  navCatalogLink: 'a.nav-link[href$="/courses"]',
} as const;
```

**2. State → `src/api/<resource>.ts`.** A typed client for whatever the platform
knows about the thing under test. This is what the spec will _assert_ on: an API
answer is numeric or an enum, so it survives both translation and MFE re-skinning.
Throw `ApiError` with an actionable message on an unexpected response.

**3. Behaviour → `src/pages/<domain>/<feature>.page.ts`.** Locators and
single-surface actions. Page objects **never assert** — they navigate, click and
fill, and wait for the state change their action causes (a response, a URL change),
never for a fixed time.

**4. Multi-surface flows → `src/steps/<flow>.ts`.** Only when a journey crosses
page objects (enroll through the catalog; complete a unit). A step that cannot do
its job **reports why** — returning the blockers, as `completeUnit` does — rather
than throwing or, worse, quietly succeeding.

**5. Composition → `src/fixtures/index.ts`.** Add a fixture so the spec receives a
finished object. Put any `skip` here too: a course without the content a spec needs
is a fixture concern, and it keeps conditionals out of the test body. Distinguish
"not configured" from "misconfigured": `courseKey` skips when `COURSE_KEY` is
unset but **fails** (via `assertCourseAccessible`) when it names a course the
target does not have, because that is an operator error, not optional coverage.

**6. The spec → `tests/<domain>/<feature>.spec.ts`.** One Feature per file. Each
test carries its stability tier, any capability tag, `@authenticated` if it reuses
the captured session, and a `testId(...)` annotation when it maps to a BTR case.

```ts
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

Then add the accessibility gate for any surface the spec visits
(`await checkA11y(page, { label: 'course-about' })`) and run `npm run check`.

### The division that matters

**The UI drives the action; the API decides the outcome.** Reserve UI assertions
for cases where the rendering _is_ the thing under test — a completion marker
appearing, a form's error state — and keep them structural. Everything else, ask
the platform.

## Locators

Prefer stable, user-facing locators. **Never match on the target's displayed
(localized) text** — installations run in different languages, so text-based
locators break under a different site language. Priority order:

1. **Test IDs** — `getByTestId(...)` where the app exposes them.
2. **Stable attributes / roles** — `name` / `id` / `href` attributes, or
   `getByRole('<role>')` **without** a localized `name`.
3. **CSS containers** — only as a last resort, for language-independent structural
   scoping.

Do **not** use `getByText`, `getByLabel`, `getByRole(..., { name: '<literal>' })`,
`toContainText('<literal>')`, `hasText`, `:has-text()`, etc. against platform copy.
Matching a value the test itself supplied (a generated username, a name you typed)
is fine — that is your own, language-independent data. The rule is enforced by
`tests/conventions/no-displayed-text.spec.ts` and detailed in
[ARCHITECTURE.md](ARCHITECTURE.md#locators-never-depend-on-displayed-text).

Avoid brittle selectors (deep CSS/XPath chains, nth-child, generated class names).

## Assertions and stability

- Use **web-first, auto-retrying** assertions (`await expect(locator).toBeVisible()`),
  not manual polling.
- **Never compare a value read from the UI against a value fetched separately
  beforehand.** Platform state (grades, completion) is recomputed asynchronously,
  so two readings taken at different moments can straddle an update and disagree
  when nothing is wrong. Take both readings together inside `expect.poll(...)`,
  then restate the comparison as an equality so a real failure names both values.
- **No fixed sleeps.** Never use `waitForTimeout`. Wait for a condition, and take
  timeout budgets from `src/config/timeouts.ts`.
- **`count()` does not retry.** In a spec, prefer `toHaveCount` or `expect.poll`.
  In a page object or step, branching on `count()` is acceptable only after an
  explicit wait for the container it is counted in (`waitFor({ state: 'attached' })`
  on the block, a response the content follows), never straight after navigation.
- Specs **own the assertions** that decide pass/fail. Page objects and steps
  perform actions and navigation; they don't assert outcomes.
- Tests must be **parallel-safe**: each test owns its context and identity and
  makes no assumptions about order or shared mutable state.

## Test data

- Generate **deterministic, unique-per-run** data (e.g. a unique suffix per test)
  so parallel runs don't collide.
- Set up state through **portable mechanisms** — documented public APIs or a
  documented, idempotent seeding step — never one operator's private fixtures.
- Prefer creating data via `src/api/` factories over driving the UI, except when
  the UI flow is the thing under test.
- Obtain a sign-in-able learner via `provisionLearnerAccount(request, config)`
  (`src/accounts/`), never by assuming a target auto-activates. The configured
  `ACCOUNT_BACKEND` decides how the account clears email validation, so specs stay
  the same across targets.

## Authoring-to-learner round trips

Studio specs that author content and then check what a learner sees follow one
shape. Read `.private/studio-auth-resilience.md` for the session mechanics behind
these rules.

- **One test, both halves.** Author through `src/api/` (`buildSection`,
  `authorProblem`/`authorHtml`/`authorVideo`, the `xblock`/`clipboard`/`cohorts`
  clients), drive the one action under test through the page object, and assert
  the learner's reading — Blocks API, course-home outline, `navigation`,
  `progress`, `problem_check` — in the **same** test. The UI drives; the API
  decides pass/fail.
- **A content spec creates a section, never a course.** There is no
  course-deletion API, so courses accumulate. Take a worker course from a fixture
  (`contentCourse` / `futureCourse` for shared reads, `authoringCourse` for a
  fresh per-test course) and build a uniquely-named **section** inside it. Two
  content courses per worker is the budget; do not create a course in a spec body.
- **Two actors, two contexts.** The learner is a different user, so it gets its
  own browser context and `request` (`roundTripLearner(s)`, `futureCourseLearner`,
  `authoringCourseLearner(s)`) — never sign a learner in on the author's `page`.
- **Same user, browser + API in one test → `page.request`, not the `request`
  fixture.** A separate `request` context for the author is evicted by the
  browser's own session work and the heal cannot outrun it; `page.request` shares
  the live browser jar. (See `tests/studio/home/course-lifecycle.spec.ts`.)
- **LMS session-auth views (cohorts, instructor dashboard) need a fresh login.**
  They are Django session-auth, so a JWT-only context is redirected to login and
  the write surfaces as **HTTP 405**. After the browser authoring is done, open a
  throwaway `playwright.request.newContext()`, `loginSession` as the worker author,
  drive those calls there, and dispose it.
- **Poll every learner reading after a publish.** The block-structure rebuild runs
  on a delay (`COURSE_PUBLISH_TASK_DELAY`, ~30 s locally and longer on a shared CI
  worker), so a learner read taken right after a publish can precede it. Poll under
  `TIMEOUTS.contentPublish`, and give a round-trip spec the `TIMEOUTS.contentTest`
  describe-level budget so the wait cannot trip the per-test timeout.
- **Copy/paste is a server-side clipboard.** The content-staging API
  (`src/api/clipboard.ts`) holds the clipboard per user with no browser grant, so
  a copy can be an API call and the paste the UI action under test.

## Instructor-dashboard round trips

The LMS instructor dashboard is the instructor-dashboard MFE
(`/instructor-dashboard/<course>/<tab_id>`, `verawood` onward — gated by the
default-on `instructor-dashboard` capability, which older releases opt out of).
Its specs live in `tests/lms/instructor/` and follow the authoring round-trip
rules above, plus:

- **The instructor is the worker author.** A course's creator holds its
  `instructor` and `staff` course roles, so instructor specs run in
  `studio-author` on the worker's `page`; the learner is a `roundTripLearner`.
  The seeds also grant the author the course `data_researcher` role, which
  report generation requires and a creator does not get by default.
- **The v2 instructor API accepts the JWT.** `/api/instructor/v2/…` rides
  `page.request` — no throwaway `loginSession` context, unlike the cohort views.
  The **Django admin** is still session-auth: the platform-wide certificate switch
  is flipped on a fresh admin `loginSession` context under `withAdminSession`.
- **Reach a tab by URL, prove it by its link.** Tab titles are localized; the
  API's `tabs[].tab_id` and URL are not. `instructorDashboard.tabLink(courseKey,
tabId)` is the "this tab is offered" assertion.
- **The request an action fires is the discriminator.** The MFE ships no test
  ids (`INSTR-001`), so several controls are located by position. Every
  page-object action waits for the exact instructor-API request it must cause and
  returns the response; a spec asserts that response's `results`, never a toast.
- **Wait for the conjunction, never a clock.** `generate` hands back no task id
  and `instructor_tasks` lists only running tasks (`INSTR-002`), so a task is
  done when none of its type is listed **and** its effect is readable (for a
  report: a download not in the listing taken before the request)
  (`waitForInstructorTask`, `waitForReport`, `waitForLearnerProgress`), under
  `TIMEOUTS.instructorTask`; every wait returns its last readings for the failure
  message rather than throwing.
- **A report about content needs the collected block structure.** Publish, then
  wait until the learner's Blocks API serves the unit before queuing a
  problem-responses report; queued earlier, the task fails with no trace
  (`INSTR-007`).
- **The learner's oracles** are `progress` (`subsections[].problem_scores`,
  `num_points_earned`, `due` — extensions included; `certificate_data.cert_status`),
  `isEnrolled`, and the Blocks API (beta early access). The course-home dates API
  does not list the assignment (`INSTR-004`).
- **Certificates** use the worker `certificateCourse` and a per-test
  `certificateLearner` enrolled `honor` on its first enrollment (an existing
  audit enrollment is not moved). Specs are tagged `@certificates` and take
  `certificateGenerationEnabled`, which skips without an admin account.
- **The auto-generation switch is shared state, so it is locked.**
  `certificates.auto_certificate_generation` is a platform-wide waffle switch:
  turned on, a passing learner's certificate is issued without a request, which
  changes every other certificate case's premise. Every `certificateLearner`
  holds the `certificate-auto-generation` lock shared, and `certificateSwitch`
  holds it exclusively, starts from off, turns it on only when the test asks
  and turns it off afterwards (`src/fixtures/named-lock.ts`). Never flip the
  switch outside that fixture.

## Library round trips

Content libraries v2 are the library-authoring MFE (`/library/<lib key>`, the
`content-libraries` capability, declared on `main` and `verawood`) and the
`/api/libraries/v2/` API; legacy `library-v1:` libraries and the migrator are
behind the opt-in `content-libraries-v1`. Their specs live in
`tests/studio/library/` and follow the authoring round-trip rules above, plus:

- **The library admin is the worker author.** Creating a library makes its
  creator the admin, so library specs run in `studio-author` on the worker's
  `page`. Second actors — a member, an unaffiliated Studio user — are **course
  creators** provisioned per test (`studioColleague`) on their own contexts:
  `allow_public_read` grants a plain learner nothing (measured), so a learner is
  never the "other user" of an access case.
- **Everything here is Studio-session-authed.** The v2 API answered the
  author's Studio session cookie with no JWT in the jar (measured, plan §1.2),
  so library reads and writes ride `page.request` — the browser's own session.
  Legacy `POST /library/` and the course-side `POST /xblock/` (the import, the
  section build) are session-authed too, and 302 to sign-in when that session
  is gone.
- **Never run the API SSO handshake from a spec.** v2 library writes rotate the
  Studio session on the context that makes them, and `establishStudioSession`
  _corrupts_ a session whose LMS half a provisioned learner has left stale — a
  seeded library plus a learner in one test 302s on its first legacy write. The
  recipe: seed on `page.request`, re-sync **once through the browser**
  (`resyncStudioAuthor`) before any course write, do the course writes, and
  provision the learner **last** (`roundTripLearnerLater` /
  `authoringCourseLearnerLater`). Fixtures on the plain `request` context build
  first and handshake only after a write has actually 302'd
  (`buildWithAuthorWriteSession`). A separate-identity context is not an escape:
  its sign-in evicts the worker author.
- **Reach by URL, prove by the fetch.** `LibraryPage.goto(key, tab)` waits for
  the MFE's `GET <lib>/`; that response is the "this surface really renders"
  assertion of a gated spec. Every page-object action waits for the v2 request it
  must cause and returns the response; the spec asserts the API afterwards
  (`has_unpublished_changes`, `collections[]`, `children/`, `hierarchy/`,
  `downstreams/<usage>`) and the rendering only where the rendering _is_ the case
  (a card under the test's own title, a two-step confirmation, a `disabled`
  switch).
- **Imports and sync.** `POST /xblock/` with `library_content_key` needs
  `category` (500 without it); the downstream list URL-encodes the course key.
  The unit page's "Update available" reads the downstream directly; the course
  Libraries "Review Content Updates" tab is fed by the search index and lags
  `ready_to_sync` under load (`LIB-002`) — use `waitForReviewCard`, on a fresh
  per-test course. A customized block's preview offers "Keep course content" in
  place of the sync as its primary; the dialog reads the footer structurally.
- **Libraries accumulate.** `DELETE <lib>/` is 500 once a library ever held a
  container ([`LIB-001`](docs/findings.md), filed as
  [edx-platform#39117](https://github.com/openedx/openedx-platform/issues/39117));
  teardown tries, annotates, and relies on run-unique slugs. Every list a spec selects from — the course picker, an outsider's
  `listLibraries`, the migration destination step — is **paginated**, so filter
  by the library's title or slug before selecting; never trust `.last()` or the
  first page.
- **Both halves, both states.** A reuse case publishes the course section and
  ends in the learner's context (`waitForLearnerBlock`, then the rendered unit,
  under `contentPublish`); an update is accepted for one library change and
  declined for the next, each read back from the learner. Public read is asserted
  on **and** off from the other user's context and picker.
- **a11y.** One gate per new surface; the library MFE's serious debt is
  `LIBRARY_A11Y_BASELINE` (`LIB-004`), applied to library scans only.

## Tagging, the authoring sidebar, and course files

Epic 11 covers the Verawood authoring sidebar, content tagging, the Files page,
textbooks, updates and upload agreements. A few rules keep this coverage
deployment-agnostic and stable.

- **The admin owns taxonomies.** Managing a taxonomy (import, assign to an org,
  export, delete) is staff-only, so it runs under the admin-session lock
  (`withAdminSession`). Two fixtures serve it: `workerTaxonomy` seeds a shared
  taxonomy for the tag-drawer specs, and `taxonomyAdmin` signs the admin into
  Studio in its own browser (its `page.request` is the same session, used for the
  content-tagging API and cleanup). Never combine `taxonomyAdmin` with a fixture
  that re-takes the admin lock (`workerTaxonomy`, `authoringTaxonomy`) in one
  test — the lock is not reentrant and the two deadlock; the taxonomy-page cases
  seed their own taxonomies through the UI instead.

- **`object_tags` is the tag oracle.** The UI drives the tag drawer; the
  `content_tagging/v1/object_tags/` API decides whether a tag stuck. A course is
  tagged by its **course key**, a block by its usage key. The drawer opens from a
  card's "Manage tags" kebab (outline) or the Align rail (unit page / component);
  a component's drawer is reached through the unit page's legacy iframe.

- **The Files page filters client-side.** Search, sort and the type filter act
  over the already-loaded asset set, so the oracle is the rendered card/row count
  for the test's own uploads (keyed by asset id, an attribute) alongside the
  `/assets/<key>/` API. Cards carry `grid-card-<assetId>`; list rows expose no
  per-asset attribute, so they assert by count. The sort/filter modal's radios
  are hidden behind a clickable `.pgn__selectable_box`.

- **Upload agreements are gated statically.** `AGREEMENT_GATING` is an MFE-config
  value the LMS serves (five-minute cache), so it cannot be toggled per run; CI
  declares it and the suite only seeds the rows (`seededUploadAgreements`, once
  per worker through the LMS Django admin) and accepts them
  (`acceptedUploadAgreements`, the author's own `POST agreement_record`).
  `agreement_record.is_current` is the oracle. Gating is **global to the target**,
  so it is not only the upload cases that meet it: while an agreement is
  outstanding the MFE disables the whole Files page, down to the view toggle and
  every row. The `filesPage` fixture therefore takes `acceptedUploadAgreements`
  itself, and no Files spec has to remember to.

  A case whose premise is "this user has accepted nothing yet" needs its own
  throwaway user: acceptance is per user and permanent, so asserting it of a
  worker-scoped identity passes once and fails on every retry.

## Roles and permissions (RBAC)

The `tests/rbac/` tree drives `openedx-authz`: the Roles and Permissions
console, the legacy role matrix, the migration in both directions, and Studio
under AuthZ. It is gated on the `rbac` capability and, for anything that moves a
waffle override, an admin account.

- **Accounts come from the worker's cast, not from a fresh registration per
  case.** `rbacCast(part)` provisions one account per _part_ — `instructor`,
  `staff`, `courseAdmin`, `libraryUser`, `outsider`, … — on first use, and every
  spec in the worker shares them. This is a correctness rule as much as a cost
  one: a full run of the tree used to provision ninety-odd accounts, which put
  it past the platform's registration and sign-in limits, and the failures that
  produced (slow Studio Home renders, dead sessions, `waitForURL` timeouts in the
  authn MFE) looked like anything but rate limiting.
- **A part is a role, so reuse cannot surprise a case.** An account only ever
  plays the part it is named for, so `cast('staff')` holding `staff` in three
  courses changes nothing about what `staff` may do in the course under test.
  `outsider` is granted nothing, anywhere, by anyone — several cases read its
  emptiness as the assertion.
- **Take a throwaway account (`studioColleague`) when the case needs a history
  of its own**: one it deactivates (TC-00649), or one whose exact role list it
  asserts on a scope other specs also write to (the console's assign-role and
  audit cases).
- **Seeding roles is idempotent.** `seedScopeAssignments` treats the API's
  `user_already_has_role` as the wanted state; anything else still raises.
- **Scopes, not targets.** A course-level waffle override names one course and an
  organization-level one names an organization the run created, so this tree
  never changes what another spec sees. Migration is a one-way door for a
  scope's roles, so the transition cases build their own course (or
  organization) and roll it back when they end.

## Notifications and discussions

The `tests/lms/notifications/` and `tests/lms/discussions/` trees cover the
notifications tray, the preference centre, notification e-mail and the course
forum. They run in `studio-author`: the worker author is the course's
instructor and staff, the actor behind notify-all posts, course updates and ORA
grades. A few rules keep them honest.

- **The recipient is fresh; the other actors are a cast.** What a recipient has
  received is the assertion, and preferences are per user, so every case takes
  a new learner from `notificationRecipient()` (or `mailboxLearner()`). The
  learners who post, respond or moderate are `forumCast('poster' |
'moderator')`, one account per part per worker (the `rbacCast` rule).
- **The recipient's own list decides; the tray is the second reading.**
  `waitForNotification` polls the recipient's `/api/notifications/` under
  `notificationDelivery` and returns the row it matched and every row it read.
  The spec then shows that row in the tray (`notificationTray.row(id)`).
- **Match on the test's own content, never on "the newest row".**
  Notifications for posts, notify-all posts and course updates fan out to every
  enrolled learner, and the list has no course filter. Match a forum type with
  `aboutThread(type, threadId)`: it uses the row's link, because a merged row
  keeps the older post's `thread_id`. Match ORA types with `aboutOra`, and a
  course update by its unique text.
- **Absence needs a sentinel.** "Nothing arrives" cannot be shown by waiting a
  fixed time. `checkNotificationAbsent` waits until a second recipient has
  received the same notification, and only then reads the subject's list. The
  mail version waits for the sentinel's mail, then reads the subject's inbox
  once.
- **Seen and read are different states.** Opening a tray tab sends `mark-seen`,
  which is all the unseen count counts. Clicking a row or "Mark all as read"
  sends `read`, which clears unread dots and leaves the count alone.
- **Preconditions are preferences.** New posts and questions are off in the tray
  by default; the sheet's "Given I've turned ON …" is a preference the case sets
  first. Threads are created **following** (`createThread`'s default), because
  the platform notifies an author only of threads they follow.
- **The forum UI needs the topic sync.** A fresh course's topic list is filled
  by a task after creation, and the discussions MFE loaded before it cannot
  post. Take `forumCourse`, or `forumUnit` for an in-context topic.
- **Mail is an opt-in oracle.** Cases whose assertion is the mail itself carry
  `@email-inbox` and take `mailboxLearner`. A mail is recognised by what it
  links to (`linkingTo`), never by its copy. Only a learner's first immediate
  mail is sent at once, so each case waits for exactly one mail per learner.

## Site chrome and learner pages

The header, footer, landing page and the learner's own pages (dashboard,
profile, course home, courseware tools) are covered from `tests/lms/chrome/`,
`tests/lms/catalog/`, `tests/lms/course-home/`, `tests/lms/courseware/`,
`tests/lms/dashboard/`, `tests/lms/profile/`, `tests/lms/teams/` and
`tests/lms/i18n/`. A few rules keep this coverage portable while the
frontend-base conversion moves apps between frontends.

- **Three chrome generations, one set of blocks.** A page's header and footer
  come from the frontend-base shell, the legacy `frontend-component-header`, or
  its learning header, and which apps use which is changing release by release.
  `HeaderBlock` and `FooterBlock` read all three through union anchors
  (`src/config/selectors/chrome.ts`), and `HeaderBlock.generation()` says which
  one a page rendered. Nothing lists apps by generation.
- **Configuration is the oracle for what the chrome offers.** A Help link exists
  iff `SUPPORT_URL` is set, the catalog link iff discovery is on, Order History
  iff `ORDER_HISTORY_URL`. `chromeCase.read()` reads the configuration from
  where the rendered generation reads it (the app's `mfe_config`, or the shell's
  site config), and specs compare the rendered links with it — never with a
  sheet's list of labels, which describes one provider's theme.
- **Known chrome defects are keyed to what rendered.** `KNOWN_CHROME_DEFECTS`
  ties each defect to the generation, width and scenario that have it;
  `chromeCase.expectKnownDefects` marks the test an expected failure only
  there, so a marker lifts itself when the page moves to a frontend without the
  defect. `@frontend-base` stays reserved for markup only the shell renders
  (its legal line, its language menu).
- **One viewport table.** Responsive cases take their sizes from
  `src/config/viewports.ts`, each on one side of a breakpoint the frontends
  switch on, and assert structure: nothing scrolls sideways, every promised
  link is reachable (visible, or behind the menu toggle or the narrow legacy
  header's account menu), cards fit. Logo sizing
  compares the pages of one install with each other; there is no pixel
  baseline (ADR-0002).
- **Privacy is decided by someone else.** A profile or certificate visibility
  case reads the account or certificates through a second learner
  (`profileViewer`); the owner always sees everything. A profile stays private
  until its account has an adult year of birth (`profileLearner` sets one).
- **Session-only learner APIs take the learner's own context.** Bookmarks and
  teams accept a session or Bearer token, not a JWT alone; the learner's
  signed-in context has both. The dashboard's unenroll and the progress tab's
  certificate request are Django form views that also need CSRF.
- **Platform switches are scoped.** Course e-mail is turned on for the content
  course alone (`courseEmailEnabled`: the flag with course authorization still
  required, plus one authorization), and the certificate switch is locked (see
  "Instructor-dashboard round trips").
- **Read language back through the browser.** The LMS copies the language
  cookie a request carries into `pref-lang`, so a language case reads the
  preference on `page.request`; a separate context holding the old cookie would
  reset it.

## Tags

Domain decides the folder; everything else is a tag. Tags drive Playwright
project selection (`--grep`) and make failures legible to non-technical readers.

- **Stability tier:** `@smoke` (critical path), `@regression` (broader depth).
- **Pure logic:** `@unit` (no browser/target; runs in the `unit` project).
- **Capability:** `@discussions`, `@teams`, `@notes`, `@mfe-authn`, … —
  gates coverage on what the installation has (see `CAPABILITIES` in
  `.env.example`). `src/config/capabilities.ts` is the authoritative vocabulary; a
  tag must match an entry there. A tag that names a capability is **enforced** —
  the `capabilityGate` fixture in `src/fixtures/` reads each test's own tags and
  skips it where that capability is not enabled, so the tag is the whole of the
  contract — while any other tag is only a filter. Most capabilities are off until
  declared; the `DEFAULT_ON_CAPABILITIES` (stock surfaces: `mfe-authn`,
  `frontend-base`, `instructor-dashboard`, `discussions` and `notifications`) are
  on unless turned off with a `-` prefix.

  `@frontend-base` marks coverage that only makes sense in the `frontend-base`
  shell (`main` onward): its chrome's a11y debt, markup only it renders. It is
  **not** a version switch — a journey that merely passes through the shell stays
  ungated and matches both headers with a selector union (see
  `src/config/selectors/account-menu.ts`). Reach for the tag only when the two
  models need mutually exclusive assertions.

  A capability gates the coverage that is _about_ the optional feature, not every
  spec that happens to pass through it. Where the feature is one of two routes to
  the same place, give the journey a step that takes whichever route the target
  offers and leave those specs ungated — `locateCourseInCatalog` does this for
  catalog search (`@catalog-search`), so discovery and enrollment coverage runs on
  an install with no search field while the search specs themselves skip. A gated
  spec should assert the feature's surface is really present, so a target that
  declares a capability it does not have fails rather than passing vacuously.

- **MFE / subsystem:** `@mfe-account`, `@mfe-learning`, `@mfe-authoring`,
  `@mfe-instructor-dashboard`, `@mfe-catalog`, `@mfe-learner-dashboard`,
  `@mfe-profile`, … —
  filters the suite to one micro-frontend. `@mfe-authn` is also a capability, so
  apply it only to coverage that genuinely needs the authn MFE — not to specs
  that drive sign-in through the account backend's flows.
- **Authenticated:** `@authenticated` — the spec runs in the `lms-learner` project
  (which depends on `setup`); the anonymous `@smoke`/`@regression` projects exclude
  it. The project loads the captured learner storage state, and specs that only
  read (`session`, `profile`) use it as is. Specs that **change course state**
  (enroll, complete, grade) request `courseLearner`, which provisions a fresh
  learner for that test and installs its session in place of the shared one, so
  parallel tests never share an enrollment. That costs one registration per test —
  see the README's rate-limit section.

- **Author:** `@author` — the spec runs in the `studio-author` project (depends on
  `setup`) as the worker's own author (`workerAuthor`), whose session is valid on
  Studio and the LMS; the anonymous projects exclude it. A spec that signs a
  browser in as the **admin** takes the `adminPage`/`newOrgCreator` fixtures,
  which hold the cross-worker admin lock — never sign the admin in from a test
  body. Every Studio spec also carries `@studio`, the
  capability that gates the tree, and `@mfe-authoring`. Studio specs act on the
  worker-scoped `authoredCourse` unless creating a course is the thing under test:
  **there is no course-deletion API, so a Studio spec never creates a course it
  does not have to.**

Apply tags with the `tag` option:

```ts
test('the LMS landing page loads', { tag: '@smoke' }, async ({ page }) => {
  /* ... */
});
```

## BTR test-case IDs

Tests that correspond to a case in the BTR Release Test Plan carry that case's ID
explicitly — as a `test_id` annotation of the form `TC-0000X`, never inferred from
the title. Build it with the `testId` helper so typos fail fast:

```ts
import { testId } from '../../../src/reporting';

test('signs in with valid credentials', { tag: '@smoke', annotation: testId('TC-00003') }, ...);
```

Two always-on reporters read the annotation: the coverage reporter maps each
`test_id` to its outcome and reports annotation coverage every run
(`test-results/btr-coverage.json`), and the run-detail reporter records per-case
specs, notes and timing with the run's metadata (`test-results/btr-run.json`).
Both are local files; CI opt-in publishing to the per-release BTR results sheets
is described in `src/reporting/README.md`.

## Timing report

Every run also writes `test-results/timings-tests.csv` (one row per test attempt)
and `test-results/timings-steps.csv` (one row per recorded step), each row stamped
with the run's start time and target URL for import into a spreadsheet or
database and comparison across runs. Nothing to do in a spec: Playwright records
the durations; the reporter reshapes them. Wrapping a long flow in
`test.step('…')` gives it a named row in the steps file.

## Known upstream defects

When a test case describes behaviour the platform does not yet deliver, write the
spec against the **intended** behaviour and mark it so the report stays honest.
Two markers exist and they do different jobs:

- **`test.fail()` — a defect we expect to be fixed.** The body runs on every run
  and is expected to fail. The day the fix lands the body passes, Playwright
  reports an _unexpected pass_ and fails the run, and that is the signal to drop
  the marker. Put the issue URL in the reason and add an `issue(...)` annotation
  next to the `test_id`:

  ```ts
  test(
    'clears the search in a single click',
    {
      tag: '@regression',
      annotation: [testId('TC-00016'), issue('https://github.com/openedx/…/issues/160')],
    },
    async ({ catalogPage }) => {
      test.fail(true, 'The clear-search button needs two clicks: https://github.com/…/160');
      /* ... */
    },
  );
  ```

- **`test.fixme()` — a body that cannot run yet.** Nothing in the platform will
  flip it: the course content lacks what it needs, or the mechanism has no
  automatable path (an ORA that needs peers, an LTI launch to a third party). Use
  the **declaration form** so Playwright skips it before any fixture runs — an
  in-body `test.fixme(true, …)` still provisions a learner, enrolls and fetches
  the outline, then skips, which spends the registration rate limit for nothing.
  Say why in a comment above it:

  ```ts
  // 100% completion is unreachable: the course holds ORA, LTI and custom-JS problems.
  test.fixme(
    'completes every unit in the course',
    { tag: ['@regression', '@authenticated'], annotation: testId('TC-00022') },
    async ({ courseOutline }) => {
      /* ... */
    },
  );
  ```

  Before reaching for `fixme`, check whether the mechanism is drivable after all:
  a video with an HTML5 source is completed through the platform's own `<video>`
  element (`VideoBlock.watchToEnd`), with the bytes served from the suite's
  bundled clip so no third-party host is involved. Only a YouTube-only video is
  out of reach.

The coverage reporter reads both the same way — an expected failure or a `fixme`
counts as `skipped` for its BTR case, so a case with passing siblings shows as
`partial` — and treats an unexpected pass as a failure so a stale marker is
visible. A declarative `test.fixme` carries no reason Playwright can report, so
add `knownGap('why')` beside the `testId` and `issue` annotations; the results
sheet then says why the case is held back instead of "fixme (no reason
recorded)". Do **not** instead soften the assertion to match the buggy behaviour, and
do not work around a defect with `force`. Where a workaround is genuinely needed
to reach _other_ coverage, put it in the page object with a comment naming the
issue, and keep a separate `test.fail` test on the broken path itself.

## Configuration and secrets

- Read configuration through `getConfig()` / the `config` fixture. **Never read
  `process.env` directly in specs, pages, or steps** — that is the anti-pattern
  the typed config layer exists to prevent.
- **Plugins are the one exception.** An account-backend plugin under `plugins/`
  (or an operator's own) has no hook into the config schema, so it reads and
  validates its own `PLUGIN_*` variables at load time and fails with a clear
  message before any account is registered. Its polling budgets are its own too,
  since `TIMEOUTS` is tuned for browser actions; keep them named and documented.
- Only `.env.example` is committed. Never commit a real `.env` or captured auth
  state (`.auth/`); both are gitignored.

## Accessibility

Accessibility checks (`@axe-core/playwright`) target **WCAG 2.2 Level AA** and
fail on critical/serious violations, with a known-debt baseline for pre-existing
issues. Call the gate as an explicit assertion line:

```ts
import { checkA11y } from '../../../src/a11y';

await checkA11y(page, { label: 'login' });
```

Baselined rules (`src/a11y/baseline.ts`) are still executed and reported, just not
failed — unlike disabling a rule, which hides it. New screens should pass the gate
without adding to the baseline.

Every run consolidates all scans into **`test-results/a11y-violations.json`**
(grouped by rule; failing / baselined / below-threshold) — the working list for
fixing the accessibility backlog. Per-screen detail is also attached to each test
in the HTML report.

## Quality gates

Run `npm run check` (typecheck + lint + format) before pushing. Strict
`tsc --noEmit` is the real type gate — Playwright transpiles but does not
type-check. Favor `unknown` + narrowing over `any`.
