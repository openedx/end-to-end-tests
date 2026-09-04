# end-to-end-tests

End-to-end tests for the Open edX Platform, written in [Playwright](https://playwright.dev/)
and TypeScript.

The suite is **deployment-agnostic**: most providers should be able to point it at
their own Open edX installation through configuration alone, without editing test
code.

See [ADR-0002](docs/decisions/0002-core-principles.rst) for the core principles
guiding development.

## Prerequisites

- **Node.js 24** (see [`.nvmrc`](.nvmrc)). With [nvm](https://github.com/nvm-sh/nvm):
  ```sh
  nvm install
  nvm use
  ```
- **npm 11+** (ships with Node 24).
- A reachable Open edX installation to test against (see [Configuration](#configuration)).
- **The Open edX Demo Course imported on the target** for the course-completion
  specs.** Those specs need real content to work through, and importing content
  differs per installation. So the course is a prerequisite of the environment
  rather than something the suite creates. Import one with whatever mechanism
  your installation uses — on Tutor:

  ```sh
  tutor local do importdemocourse
  ```

  then point [`COURSE_KEY`](#configuration) at the imported key (the demo course's
  key differs between installs, e.g. `course-v1:OpenedX+DemoX+DemoCourse`). Leave
  `COURSE_KEY` unset and the course-completion specs skip cleanly; set it to a
  course that doesn't exist on the server and pre-test checks will fail at startup.

## Setup

```sh
# 1. Install dependencies
npm install

# 2. Install Playwright browser binaries (first run only)
npm run install:browsers

# 3. Create your local configuration
cp .env.example .env
# then edit .env to point at your installation
```

## Configuration

All installation-specific values are read from environment variables and validated
at load time — a missing or malformed value fails fast with a clear message
instead of a confusing test failure. Every variable is documented in
[`.env.example`](.env.example).

The essentials:

| Variable                            | Required | Description                                                        |
| ----------------------------------- | -------- | ------------------------------------------------------------------ |
| `LMS_BASE_URL`                      | ✅       | LMS origin, e.g. `http://local.openedx.io`                         |
| `APPS_BASE_URL`                     | ✅       | MFE host origin, e.g. `http://apps.local.openedx.io`               |
| `CMS_BASE_URL`                      | —        | Studio origin (only needed for Studio specs)                       |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | —        | Admin/staff account (set both or neither)                          |
| `ORG`                               | —        | Organization short code, e.g. `OpenedX`                            |
| `COURSE_KEY`                        | —        | Course the course-completion specs work through; unset ⇒ they skip |
| `CAPABILITIES`                      | —        | Comma-separated capabilities enabled on your install               |
| `ALLOW_CROSS_SITE_ORIGINS`          | —        | Escape hatch for non-same-site deployments                         |
| `ACCOUNT_BACKEND`                   | —        | How new accounts clear email activation (see below)                |
| `CUSTOM_ACCOUNT_BACKEND_PLUGINS`    | —        | Comma-separated paths of custom account backends                   |

**Where values come from.** Configuration is read from `process.env`, with values
from a local `.env` file layered in underneath. **Real environment variables take
precedence** - a variable already set in your shell or CI environment is _not_
overridden by `.env`. In practice: use `.env` for local development, and set
environment variables directly in CI (no `.env` needed there). A `.env` value only
applies when that variable is not already present in the environment.

**Origin requirements.** All origins (LMS, Studio, MFEs) must share **one scheme**
(all `http://` or all `https://`) and **one registrable parent domain** (e.g.
`*.local.openedx.io`), so a single sign-in covers every sub-domain. Do not use
`localhost` or IP addresses - they have no sub-domain structure for shared cookies.
Over HTTP, the target must serve `SameSite=Lax`, non-`Secure` cookies.

## Account creation & email activation

Installations differ in how a newly-registered account becomes able to sign in —
chiefly around email activation. Rather than assume one path, the suite obtains
accounts through a **user-choosable backend** selected by `ACCOUNT_BACKEND`, so the
same specs run against very different targets (see
[issue #10](https://github.com/openedx/end-to-end-tests/issues/10) and
[`src/accounts/README.md`](src/accounts/README.md)).

| `ACCOUNT_BACKEND` | Use when…                                                  | Behaviour                                                                                                                                  |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `automatic`       | "Automatic login on" — the default (incl. Tutor/sandbox)   | Generates a throwaway `@example.com` identity; no email needed. The reusable session is taken from the one registration itself creates.    |
| `manual`          | Target enforces email activation and can't be reconfigured | Interactive: prompts you for an email to register with, then for the activation link/token.                                                |
| `openinbox`       | You want activation email automated, unattended            | Example plugin (`plugins/openinbox.plugin.ts`): registers with a disposable openinbox.io inbox and visits the activation link it receives. |
| _plugin name_     | Your install has its own auth/mailbox flow                 | Loaded from `CUSTOM_ACCOUNT_BACKEND_PLUGINS`; see [`src/accounts/README.md`](src/accounts/README.md).                                      |

The `automatic` backend works against the **default** without any email setup:
registration auto-authenticates the account, so the captured (reusable) session and
the registration spec pass even on installs that leave accounts inactive until
activation. Specs that drive a **separate** UI sign-in (`login`, `logout`) still
need an install where the account can actually log in — i.e.
`SKIP_EMAIL_VALIDATION = True`, or the `manual` backend to activate the account
first.

Planned (from the spike, not yet implemented): a 3rd-party mailbox API
(Mailosaur/MailSlurp/MailHog) and a local-file mail reader.

### Registration rate limit

Open edX caps account registrations per IP with `REGISTRATION_RATELIMIT`, whose
default is **`60/7d`** (60 per 7 days). Because each run creates several accounts,
frequent runs exhaust it and registration then fails with `HTTP 403`
`forbidden-request` — the suite reports this explicitly. For any target you run
against repeatedly, raise the limit to a short, self-resetting window (the
platform's own test settings use per-minute values). With Tutor, override the LMS
setting and restart:

```py
# a Tutor plugin patch on "openedx-common-settings"
REGISTRATION_RATELIMIT = "100/m"
```

```sh
tutor local restart lms   # or: tutor dev restart lms
```

If you have already tripped the default limit, either apply the override above and
restart, or wait for the 7-day window to reset.

### Password reset rate limit

The password-reset request is throttled twice over, per IP **and** per email
address:

| Setting                     | Default | Scope                           |
| --------------------------- | ------- | ------------------------------- |
| `PASSWORD_RESET_IP_RATE`    | `1/m`   | one request per minute per IP   |
| `PASSWORD_RESET_EMAIL_RATE` | `2/h`   | two requests per hour per email |

The per-IP limit is the one that bites: **one request per minute** covers every
worker on the machine, so a second reset request within the same minute — a
re-run, a Playwright retry, or another spec — is rejected. `POST /account/password`
then answers `HTTP 403` with:

```json
{
  "success": false,
  "value": "Your previous request is in progress, please try again in a few moments."
}
```

Note that message is misleading: nothing is in progress, the request was
throttled. The authn MFE renders it as a generic error alert, so the symptom is a
password-reset spec that passes alone and fails when re-run within the minute.

Only the reset-request test posts (an invalid address is rejected in the browser
without a request), so a single run is fine; back-to-back runs and CI retries are
not. Raise the limit on any target you run against repeatedly:

```py
# a Tutor plugin patch on "openedx-common-settings"
PASSWORD_RESET_IP_RATE = "100/m"
PASSWORD_RESET_EMAIL_RATE = "100/m"
```

```sh
tutor local restart lms   # or: tutor dev restart lms
```

### Running with the `manual` backend

Set `ACCOUNT_BACKEND=manual` and run with a **single worker** so the interactive
prompts don't interleave:

```sh
ACCOUNT_BACKEND=manual npx playwright test --project=smoke --workers=1 \
  -g "signs in with valid credentials"
```

For each account the suite provisions, it prompts on your terminal to:

1. **enter an email** to register with — use an inbox you can read;
   plus-addressing (`you+e2e1@example.com`) lets one inbox serve several runs; and
2. **paste the activation link or token** from the resulting email (either the
   full `.../activate/<key>` URL or just the key).

The prompt reads your controlling terminal directly (via `/dev/tty`) and disables
the test timeout while it waits, so an interactive run won't time out. Each
provisioned account needs a unique email, so specs that provision their own
account (login, logout, and the `setup` sign-in) prompt once each.

**Getting the activation key without email (Tutor).** If you administer the target
and would rather not wait on (or configure) email, read the pending
registrations' activation keys straight from the database and paste the one
matching the email you registered with:

```sh
tutor local run lms ./manage.py lms shell -c "from common.djangoapps.student.models import Registration; rs = [ (r.user.email, r.activation_key) for r in Registration.objects.select_related('user').all()]; print(rs);"
```

Use `tutor dev run` on a dev stack. The prompt accepts either the bare key or the
full `.../activate/<key>` link.

## Running tests

```sh
npm test                 # run everything
npm run test:smoke       # critical-path (@smoke) tier only
npm run test:regression  # broader (@regression) tier
npm run test:ui          # interactive Playwright UI mode
npm run test:headed      # headed browser
npm run test:debug       # step-through debugger
npm run report           # open the last HTML report
```

Tests are organized into Playwright **projects**:

- `unit` — pure logic tests (e.g. config validation); no browser or target needed.
- `setup` — signs in once per role and writes reusable auth state to `.auth/`.
- `smoke` / `regression` — anonymous browser tests tagged `@smoke` / `@regression`.
- `lms-learner` — authenticated tests (`@authenticated`) that reuse the captured
  learner session; depends on `setup`.

Run a single project or filter by tag:

```sh
npx playwright test --project=unit        # just the unit tests
npx playwright test --project=smoke
npx playwright test --grep @smoke
```

The `unit` project needs no configuration or browsers, so you can run it right
after `npm install`:

```sh
npx playwright test --project=unit
```

## Quality gates

```sh
npm run check         # typecheck + lint + format:check (run before pushing)

npm run typecheck     # tsc --noEmit (strict; catches what Playwright's transpile won't)
npm run lint          # ESLint
npm run lint:fix      # ESLint with autofix
npm run format        # Prettier write
npm run format:check  # Prettier check
```

## CI workflows

Browser specs need a running Open edX installation, so they run in dedicated
GitHub Actions workflows rather than the fast PR gate (`ci.yml`, which runs
static checks and the browser-free `unit` project as required, blocking checks).
Both workflows share the same [`run-suite`](.github/actions/run-suite/action.yml)
composite action. They differ only in how the target installation is provisioned.

`ci.yml` additionally runs `run_tests_tutor.yml` twice every PR and push to
`main`: once against an ephemeral **`Tutor main`**, and once against the **last
named release** environment (currently `verawood`).

### `run_tests_tutor.yml` — ephemeral Tutor installation

Stands up a fresh **Tutor "local"** Open edX install on the runner (installing
the named release's Tutor/plugin versions, launching it, importing the demo
course, and creating an admin user), then runs the suite against it. Everything
is provisioned from scratch, so this is a heavier, self-contained job — nothing
to configure beforehand beyond triggering it.

Triggers:

- **`workflow_dispatch`** — run on demand with:

  | Input              | Description                                                                                                                                   |
  | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
  | `openedx_release`  | Named release (`main`, `verawood`, `ulmo`, `teak`, `sumac`, `redwood`); drives the Tutor/plugin version and capabilities. Default `verawood`. |
  | `test_ref`         | Git ref of _this_ repo to test. Defaults to the branch the workflow runs from.                                                                |
  | `domains`          | Space-separated domains to run (e.g. `lms studio`). Empty = all.                                                                              |
  | `features`         | Space-separated tag filter (e.g. `@smoke @discussions`). Empty = all.                                                                         |
  | `exclude_features` | Space-separated tags to exclude (mapped to `--grep-invert`, e.g. `@unit`). Empty = exclude nothing.                                           |
  | `capabilities`     | Override the release's default capabilities (comma-separated). Empty = use the release default from `.ci/openedx-releases.json`.              |

- **`schedule`** — automatically at **09:00 UTC (5am US Eastern in daylight
  time), Mondays and Fridays**,
  always against this repo's `main` branch with the `main` Open edX release
  (`domains`/`features`/`capabilities` are dispatch-only and don't apply to
  scheduled runs, so scheduled runs cover the full suite with `main`'s default
  capabilities).

- **`workflow_call`** — called by `ci.yml`'s `docker-main` and
  `docker-last-release` jobs (see above); same inputs as `workflow_dispatch`.

The MySQL state after migrations is cached per release/Tutor-version so most
runs skip the ~20-minute migration step; delete the `tutor-mysql-*` cache from
the Actions UI if it ever needs a clean rebuild.

**Per-release configuration.** [`.ci/openedx-releases.json`](.ci/openedx-releases.json)
is the single source of truth for what each named release needs: the Tutor
version constraint (replacing what used to be a hardcoded shell `case`
statement) and the default `CAPABILITIES` to declare for that release, since
feature/MFE availability can differ across platform versions. Adding or
removing a supported release is just an edit to that file (plus the matching
`openedx_release` dropdown option in the workflow — `ci.yml`'s "Verify
openedx_release choices match .ci/openedx-releases.json" step fails the build
if the two ever drift apart).

### `run_tests_external.yml` — arbitrary, already-running installation

Runs the suite against **any installation you already have running** — a Tutor
`dev` stack, a staging server, or a provider's own environment — instead of
provisioning one. This is how providers point the suite at their own
installation without editing any code.

Credentials are sourced from a **GitHub Environment** (Settings → Environments)
rather than hard-coded, so different targets (and their approval/protection
rules) stay isolated from each other:

| Input                      | Description                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `environment` (required)   | Name of the GitHub Environment to source `ADMIN_USERNAME`/`ADMIN_PASSWORD` secrets from.                            |
| `test_ref`                 | Git ref of this repo to test. Defaults to the branch the workflow runs from.                                        |
| `lms_base_url` (required)  | LMS origin, e.g. `https://courses.example.com`.                                                                     |
| `apps_base_url` (required) | MFE host origin, e.g. `https://apps.example.com`.                                                                   |
| `cms_base_url`             | Studio origin. Leave empty to skip Studio specs.                                                                    |
| `org`                      | Organization short code.                                                                                            |
| `course_key`               | Default course for course-completion specs.                                                                         |
| `capabilities`             | Comma-separated capabilities enabled on the target.                                                                 |
| `account_backend`          | `automatic` (default; requires `SKIP_EMAIL_VALIDATION` on the target) or `manual` (interactive — not usable in CI). |
| `allow_cross_site_origins` | Set when LMS/Studio/MFE origins are not same-site.                                                                  |
| `domains` / `features`     | Same filters as above.                                                                                              |
| `exclude_features`         | Space-separated tags to exclude (mapped to `--grep-invert`, e.g. `@unit`). Empty = exclude nothing.                 |

To run it against your own installation: create a GitHub Environment (e.g.
`staging`) with `ADMIN_USERNAME`/`ADMIN_PASSWORD` secrets (and any required
approval rule), then trigger the workflow with that environment name and your
target's base URLs.

## Project structure

```
tests/                 # specs, grouped by platform domain (lms/, studio/)
  config/              # config-layer unit tests
  api/ a11y/ reporting/ # unit tests for the pure logic in those modules
  lms/auth/            # authn MFE specs: registration, login, logout, session
  auth.setup.ts        # auth setup project
src/
  config/              # typed, validated environment configuration
  auth/                # provider-swappable authentication contract
  api/                 # typed API client + data factories
  pages/{lms,studio}/  # page objects (mirror the tests/ tree)
  steps/               # reusable multi-page business flows
  fixtures/            # composition root (config + pages + api + auth)
  reporting/           # BTR test_id annotations + coverage reporter
  a11y/                # @axe-core/playwright WCAG 2.2 AA gate
docs/
  decisions/           # ADRs
```

The layers have a strict dependency direction —
`config → api → pages → steps → fixtures → tests` — with each layer's
responsibility described in its own `README.md` under `src/`. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) (layer diagram and responsibilities) and
[`CONVENTIONS.md`](CONVENTIONS.md) (locator priority, tagging, test-data rules)
for the full mechanics.

## Contributing

- Write TypeScript under strict settings; `npm run check` must pass.
- Keep configuration centralized in `src/config/` — never read `process.env`
  directly in specs.
- Never commit a real `.env` or captured auth state (both are gitignored).
