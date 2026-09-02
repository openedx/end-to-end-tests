# Debugging test failures

## 1. Classify the failure before touching a spec

Four very different causes look alike in the report:

| Symptom                                                            | Likely cause                                        | Where the fix goes                                       |
| ------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| Fails at startup with a `ConfigError`, or every browser spec fails | misconfiguration / wrong target                     | `.env` or the run's env vars — **not** the test          |
| `HTTP 403 forbidden-request`, or "previous request is in progress" | rate limits (registration, password reset)          | the target's settings; see `references/running-tests.md` |
| A gated spec fails on a surface that isn't there                   | `CAPABILITIES` declares something the install lacks | the declaration (this failure is by design)              |
| A locator times out, or an API answer changed shape                | the platform's markup/API moved                     | selector module / api client / page object               |

A step that reports blockers (`completeUnit`) or a course that lacks the needed
content is **not** a failure — it is a property of the target. Don't "fix" it by
weakening an assertion.

## 2. Read the artifacts the run already produced

```sh
npm run report                       # HTML report: trace, screenshot, video, a11y detail
npx playwright show-trace test-results/<…>/trace.zip
cat test-results/a11y-violations.json   # all scans, grouped by rule
cat test-results/btr-coverage.json      # test_id → outcome
```

`trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`,
`video: 'retain-on-failure'` — locally `retries: 0`, so re-run the one failing
test with `--retries=1` (or `--trace=on`) to get a trace.

Re-run narrowly and interactively:

```sh
npx playwright test tests/lms/auth/login.spec.ts -g "valid credentials" --headed
npm run test:ui        # best for stepping through locators
npm run test:debug
```

## 3. Probe the live instance with Playwright

When a locator or an API shape is in doubt, **look at the real page** instead of
guessing markup. Use the Playwright MCP tools (`mcp__playwright__*`) against the
running target:

- `playwright_navigate` to the surface (build the URL the same way the page object
  does — `${APPS_BASE_URL}/learning/course/<key>/home`, etc.).
- `playwright_get_visible_html` / `playwright_get_visible_text` to see the actual
  DOM around the element.
- `playwright_evaluate` to test a candidate selector before committing it, e.g.
  `document.querySelectorAll('[data-testid="check-circle-icon"]').length`.
- `playwright_console_logs` for MFE hydration errors, and `playwright_screenshot`
  when the layout is the question.
- `playwright_get` against the platform's APIs to confirm what a `src/api/` client
  should expect (`/api/mfe_config/v1`, the Blocks API, progress, enrollment).

Rules for probing:

- Probe a **development or test installation**. Don't drive a production target,
  and don't create accounts or mutate course state on a shared environment
  without the explicit user's say-so. Ask which instance to probe if it isn't
  obvious and remain mindful of env var overrides and the current .env settings.
- Authenticated surfaces need a session: either sign in through the probe like a
  user would, or reproduce the failure through the suite (`--headed`, `--debug`,
  UI mode) where the captured `.auth/<role>.json` state is already loaded.
- A probe finding is not a fix. Translate it into the right layer: a new/changed
  anchor in `src/config/selectors/` **with a comment naming the localized string
  it stands in for** and any version caveat, then update the page object.

## 4. Fix in the right layer, keep the rules

- Locator broke → selector module, obeying the priority order. Never reach for
  localized text as the escape hatch; if there is genuinely nothing
  non-localized to anchor on, say so and read the state from the API instead
  (that is what the courseware unit-marker comment records).
- Flaky timing → wait for the causing condition in the page object; add or reuse
  a justified constant in `src/config/timeouts.ts`. Never `waitForTimeout`, never
  `force`.
- Two readings disagreeing intermittently → collapse them into one
  `expect.poll(...)`; platform state (grades, completion) is recomputed
  asynchronously.
- Auth/cross-origin failures → check the origin requirements (one scheme, one
  registrable parent domain) and the captured state in `.auth/`. `globalSetup`
  clears `.auth/` each run; a stale session is not the usual culprit. **Never**
  disable web security to make cross-origin auth work.
- The platform is genuinely wrong → `test.fixme()` + `issue(...)` annotation
  against the intended behaviour (see `references/writing-tests.md`).

Finish with `npm run check`, then re-run the affected specs.
