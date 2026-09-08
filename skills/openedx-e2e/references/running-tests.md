# Running the suite against an environment

## Decide the target before running anything

Browser specs need a real, reachable Open edX installation. **Only the `unit`
project runs with no target and no browsers.** So:

1. If the task is pure logic (config validation, registry, reporting, selector
   conventions), just run `npx playwright test --project=unit`.
2. Otherwise, work out the target. Check in this order:
   - `.env` in the repo root (gitignored, local dev target);
   - environment variables already set in the shell — **real env vars take
     precedence over `.env`**, always;
   - what the user said.
3. **If the target is still ambiguous or credentials/course key are missing, ask
   the user** rather than guessing — a wrong target produces confusing failures,
   and interactive backends need their input. Ask specifically for the values you
   are missing (LMS/Apps/CMS origins, admin credentials, `COURSE_KEY`,
   `CAPABILITIES`, `ACCOUNT_BACKEND`), and offer to run against the local `.env`
   target as the default. Suggest the user run interactive commands themselves
   with `! <command>` when a login or a prompt is involved.
4. Never write real credentials into a committed file. `.env` is gitignored;
   prefer `VAR=value npx playwright test …` for one-offs.

`.env.example` documents every variable. Essentials: `LMS_BASE_URL`,
`APPS_BASE_URL` (required), `CMS_BASE_URL` (Studio specs), `ADMIN_USERNAME`/
`ADMIN_PASSWORD` (both or neither), `ORG`, `COURSE_KEY` (unset ⇒
course-completion specs skip cleanly), `CAPABILITIES`, `ACCOUNT_BACKEND`,
`CUSTOM_ACCOUNT_BACKEND_PLUGINS`, `ALLOW_CROSS_SITE_ORIGINS`.

**Origin requirements:** one scheme for all origins, one registrable parent
domain (e.g. `*.local.openedx.io`) so a single sign-in covers every sub-domain.
No `localhost`, no IPs. Over HTTP the target must serve `SameSite=Lax`,
non-`Secure` cookies.

## Commands

```sh
npm test                 # everything
npm run test:smoke       # --grep @smoke
npm run test:regression  # --grep @regression
npm run test:ui          # interactive UI mode
npm run test:headed
npm run test:debug
npm run report           # open the last HTML report
npm run check            # typecheck + lint + format:check — before pushing
```

Projects: `unit` (no browser/target) · `setup` (signs in per role → `.auth/<role>.json`)
· `smoke` / `regression` (anonymous) · `lms-learner` (`@authenticated`, depends on
`setup`).

```sh
npx playwright test --project=unit
npx playwright test --project=smoke
npx playwright test --grep @smoke
npx playwright test tests/lms/auth -g "signs in with valid credentials"
```

First-time setup: `nvm use` (Node 24) → `npm install` → `npm run install:browsers`
→ `cp .env.example .env`.

## Prerequisites that bite

- **Demo course.** Course-completion specs need real content; importing differs
  per install (`tutor local do importdemocourse`), then point `COURSE_KEY` at the
  resulting key. Unset ⇒ those specs skip; set to a course the server lacks ⇒
  preflight fails at startup with an actionable message.
- **Registration rate limit.** `REGISTRATION_RATELIMIT` defaults to `60/7d`; each
  run creates several accounts, so repeated runs hit `HTTP 403`
  `forbidden-request`. Raise it on any target you run against repeatedly
  (`REGISTRATION_RATELIMIT = "100/m"`, then restart LMS).
- **Password-reset rate limit.** `PASSWORD_RESET_IP_RATE` defaults to `1/m` **per
  IP**, covering every worker — so a re-run or a Playwright retry inside the same
  minute gets a 403 whose message ("your previous request is in progress") is
  misleading. Symptom: a reset spec that passes alone and fails on re-run. Raise
  `PASSWORD_RESET_IP_RATE`/`PASSWORD_RESET_EMAIL_RATE` on repeated targets.
- **Account backends.** `automatic` (default; the reusable session comes from the
  registration itself, so it works even where accounts stay inactive) ·
  `manual` (interactive: prompts for an email, then the activation link/token —
  **run with `--workers=1`** and expect the prompt on the controlling terminal) ·
  `openinbox` (example plugin, unattended) · a custom plugin via
  `CUSTOM_ACCOUNT_BACKEND_PLUGINS`. Specs driving a _separate_ UI sign-in (`login`,
  `logout`) need an install where the account can actually log in — i.e.
  `SKIP_EMAIL_VALIDATION = True`, or `manual` to activate first.
- **Capabilities.** Ask the install, don't assume. e.g. catalog search:
  `curl -s <LMS_BASE_URL>/api/mfe_config/v1 | grep ENABLE_COURSE_DISCOVERY`.
  Declaring a capability the target lacks makes gated specs fail (by design);
  declaring two mutually-exclusive ones fails validation at load time.

## CI

Both browser workflows share the `run-suite` composite action and differ only in
how the target is provisioned:

- **`run_tests_tutor.yml`** — stands up an ephemeral Tutor "local" install on the
  runner (release's Tutor/plugin versions, demo course, admin user) and runs
  against it. Inputs: `openedx_release`, `test_ref`, `domains`, `features`,
  `exclude_features`, `capabilities`. Runs on dispatch, on a Mon/Fri 5am ET
  schedule against `main`+`main`, and via `workflow_call` from `ci.yml`.
- **`run_tests_external.yml`** — runs against an already-running installation.
  Credentials come from a **GitHub Environment**, base URLs and filters from
  inputs. This is how a provider points the suite at their own target with no code
  changes.
- **`ci.yml`** — the fast PR gate (static checks + the browser-free `unit`
  project, required) plus two `run_tests_tutor` calls per PR/push to `main`: one
  against `Tutor main` and one against the last named release.
