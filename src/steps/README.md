# `src/steps/` — reusable business flows

**Single responsibility:** compose page objects (and API/data layers) into
reusable, multi-page business flows — e.g. "register an account", "enroll in a
course", "complete a unit".

Steps sit above page objects and below fixtures/specs. A step orchestrates
several single-surface actions into one meaningful user flow that multiple specs
can reuse — e.g.:

- `studio.ts` — the Studio authoring flows: `createCourseThroughStudioHome` (open
  the New Course form, submit, follow the MFE to the new outline),
  `grantCourseCreatorThroughAdmin`, and the Studio-SSO helpers
  (`establishStudioBrowserSession` / `signInToStudioThroughUi`).
- `instructor.ts` — the instructor-dashboard waits and flows: `waitForInstructorTask`
  / `waitForReport` / `waitForLearnerProgress` / `waitForLearnerProblem` (bounded
  polls that return their last readings instead of throwing, so a spec's failure
  names what the platform said), `ensureDataResearcher` (the course role report
  generation needs) and `mintCertificateByException` (allowlist → regenerate →
  the learner's own certificate status).
- `library.ts` — the content-library flows: `authorLibrary(shape)` (a library
  with its components, units / subsections / sections and collections in one
  call, published by default — the `buildSection` of libraries) and the bounded
  waits `waitForSyncAvailable` (a course block's link reports a newer library
  version), `waitForMigration` (a legacy-library migration task settles) and
  `waitForLearnerBlock` (a learner's outline lists a block), each returning its
  last reading rather than throwing. The course-side import itself is the
  single API call `importLibraryContent` (`src/api/library-sync.ts`).
- `notifications.ts` — `waitForNotification(recipient, config, match)` (the
  recipient's own list, polled under `notificationDelivery`, returning the match
  and every row read), `aboutThread(type, threadId)` (the grouping-safe match:
  a row's `content_url`, not its `thread_id`, names the thread it is about now)
  and `checkNotificationAbsent` (the sentinel rule: absence is read only after
  the same notification has reached a sentinel).
- `chrome.ts` — the site-chrome readings: `readPageChrome` (which frontend
  generation rendered a page's header and the configuration behind it, read
  from where that generation reads it), `anonymousHeaderExpectation`,
  `partitionSiteLinks`, `horizontalOverflow`, and `KNOWN_CHROME_DEFECTS`, the
  chrome defects keyed to a generation and layout that fixtures turn into
  expected failures for the cases they break.
- `poll.ts` — `pollUntil` and `PollOutcome`, the bounded poll the instructor and
  library waits share: re-read every second until satisfied or out of budget,
  never throwing, so a spec's failure names the last reading.
- `gating.ts` — `satisfyPrerequisiteByScore` (answer a prerequisite problem
  correctly through the LMS `problem_check` handler so a score-gated subsection
  unlocks) and `submitProblem` (submit an answer and return the platform's grade).

Rules:

- No raw locators — call page-object methods instead.
- Steps perform actions and navigation; specs still own the assertions that
  decide pass/fail.
- A step that cannot do its job **reports why** rather than throwing or quietly
  succeeding: `completeUnit` returns the blocks it could not drive as typed
  `UnviewedBlock[]` data, and the spec decides whether that is a failure or an
  inventory. Throwing is reserved for target-data errors (a course the catalog
  does not list), which no spec should tolerate.
- Where an optional capability is one of two routes to the same place, the step
  takes whichever the target offers (`locateCourseInCatalog` searches or pages),
  so only coverage _about_ the feature is gated.
- Depends on `pages/`, `api/`, `accounts/` (the UI sign-in/sign-out defaults the
  auth steps delegate to), and `config/`.
