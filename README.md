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

| Variable                            | Required | Description                                          |
| ----------------------------------- | -------- | ---------------------------------------------------- |
| `LMS_BASE_URL`                      | ✅       | LMS origin, e.g. `http://local.openedx.io`           |
| `APPS_BASE_URL`                     | ✅       | MFE host origin, e.g. `http://apps.local.openedx.io` |
| `CMS_BASE_URL`                      | —        | Studio origin (only needed for Studio specs)         |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | —        | Admin/staff account (set both or neither)            |
| `ORG`                               | —        | Organization short code, e.g. `OpenedX`              |
| `COURSE_KEY`                        | —        | Default course for course-completion specs           |
| `CAPABILITIES`                      | —        | Comma-separated capabilities enabled on your install |
| `ALLOW_CROSS_SITE_ORIGINS`          | —        | Escape hatch for non-same-site deployments           |

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
- `setup` — signs in once per role and writes reusable auth state (stubbed until
  Epic 2).
- `smoke` / `regression` — browser tests tagged `@smoke` / `@regression`.

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

## Project structure

```
tests/                 # specs, grouped by platform domain (lms/, studio/)
  config/              # config-layer unit tests
  auth.setup.ts        # auth setup project
src/
  config/              # typed, validated environment configuration
  auth/                # provider-swappable authentication contract
  api/                 # typed API client + data factories
  pages/{lms,studio}/  # page objects (mirror the tests/ tree)
  steps/               # reusable multi-page business flows
  fixtures/            # composition root (config + pages + api + auth)
docs/
  decisions/           # ADRs
```

The layers have a strict dependency direction —
`config → api → pages → steps → fixtures → tests` — with each layer's
responsibility described in its own `README.md` under `src/`. Companion
`ARCHITECTURE.md` (layer diagram) and `CONVENTIONS.md` (locator priority, tagging,
test-data rules) documents are being added as part of Epic 1.

## Contributing

- Write TypeScript under strict settings; `npm run check` must pass.
- Keep configuration centralized in `src/config/` — never read `process.env`
  directly in specs.
- Never commit a real `.env` or captured auth state (both are gitignored).
