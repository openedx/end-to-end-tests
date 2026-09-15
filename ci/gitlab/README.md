# Running the suite from GitLab CI

[`run-suite.yml`](run-suite.yml) is a GitLab CI template that owns _how_ this
suite runs: the image, fetching the suite at a pinned ref, installing it,
building the Playwright command line, and collecting the reports. It is the
counterpart of the [`run-suite`](../../.github/actions/run-suite/action.yml)
composite action for GitHub Actions.

It defines one hidden job, `.openedx-e2e`. A consuming pipeline extends that job
and supplies only what it alone knows: which origins its environment serves, when
that environment is ready to be driven, and where the credentials come from.

Nothing is added to the installation under test — no service, no Kubernetes Job,
no extra container. The runner is an ordinary external HTTP client, which is what
the suite simulates anyway, and driving it from outside keeps the ingress and the
TLS termination a real user traverses inside the scope of the test.

The template's header comment is the reference for the variables it reads. This
file is the reference for the patterns around it, drawn from a Tutor/Kubernetes
deployment pipeline that runs the suite after deploying. Hostnames and group
paths below are placeholders.

## The smallest thing that works

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/openedx/end-to-end-tests/<sha>/ci/gitlab/run-suite.yml'

stages:
  - e2e

e2e:
  extends: .openedx-e2e
  stage: e2e
  variables:
    E2E_SUITE_REF: <sha> # required; keep equal to the include ref
    LMS_BASE_URL: https://courses.example.com
    APPS_BASE_URL: https://apps.example.com
```

Everything else has a working default. The suite is configured by its own
environment variables, so [`.env.example`](../../.env.example) is the
authoritative list of what else you can set — and a variable added there works
here the day it works locally.

## A worked example: gating on a deploy

The pattern below runs the suite against the environment a pipeline has just
deployed. It splits across two files for a reason given under
[Keep the remote include off the deploy path](#keep-the-remote-include-off-the-deploy-path).

**The parent pipeline** triggers the suite as a child pipeline once the deploy
has finished:

```yaml
variables:
  # The environment's hostname, in one place: it is both the environment URL and
  # the origin the suite is pointed at. See "Derive the origins from one hostname".
  DEV_PLATFORM_DOMAIN: dev.example.com

stages:
  - deploy
  - e2e

e2e-dev:
  stage: e2e
  needs:
    # Optional so this job's presence never decides whether the pipeline can be
    # created; the rules below already keep the two in step.
    - job: deploy-dev
      optional: true
  variables:
    ENV_NAME: dev
    E2E_PLATFORM_DOMAIN: $DEV_PLATFORM_DOMAIN
  trigger:
    include:
      - local: /.gitlab/ci-templates/e2e.yml
    strategy: depend
    forward:
      pipeline_variables: true
  # Required, not merely convenient — see "A manual job needs allow_failure".
  allow_failure: true
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
```

**The child pipeline** (`.gitlab/ci-templates/e2e.yml`) is the caller. Note how
little of it is about Playwright:

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/openedx/end-to-end-tests/<sha>/ci/gitlab/run-suite.yml'

stages:
  - e2e

e2e:
  extends: .openedx-e2e
  stage: e2e
  variables:
    # This repository's own checkout is not needed: the job's whole payload is
    # the suite, which the template clones itself.
    GIT_STRATEGY: none

    E2E_SUITE_REF: <sha>

    LMS_BASE_URL: https://$E2E_PLATFORM_DOMAIN
    APPS_BASE_URL: https://apps.$E2E_PLATFORM_DOMAIN
    CMS_BASE_URL: https://studio.$E2E_PLATFORM_DOMAIN

    ORG: OpenedX
    COURSE_KEY: 'course-v1:OpenedX+DemoX+DemoCourse'
    CAPABILITIES: 'discussions,notes'
    ACCOUNT_BACKEND: automatic

    ADMIN_USERNAME: $E2E_ADMIN_USERNAME
    ADMIN_PASSWORD: $E2E_ADMIN_PASSWORD

  resource_group: $ENV_NAME
  timeout: 30m

  before_script:
    # Defined in this same file - see "Wait for the target to serve".
    - !reference [.wait-for-target, script]
```

## Patterns worth copying

### Derive the origins from one hostname

A stock install serves Studio and the MFE host as sub-domains of the LMS host,
which is also how Tutor derives `CMS_HOST` and `MFE_HOST` from its own
`LMS_HOST`. Mirroring that means one variable to change, and it is the same
variable the pipeline already needs for `environment:url`:

```yaml
LMS_BASE_URL: https://$E2E_PLATFORM_DOMAIN
APPS_BASE_URL: https://apps.$E2E_PLATFORM_DOMAIN
CMS_BASE_URL: https://studio.$E2E_PLATFORM_DOMAIN
```

Keep the prefixes in step with however your installation is configured. If they
drift, the readiness check below fails immediately and names the host that did
not answer — rather than the suite failing several minutes later as though its
locators had gone stale.

Leave `CMS_BASE_URL` unset to skip the Studio specs.

### Wait for the target to serve

An orchestrator reporting that a deploy finished does not mean the ingress is
already serving. `tutor k8s init` returning, or a Helm release going ready, still
leaves pods rolling. And waiting on the LMS alone is not enough: the authn-MFE
specs would run against an MFE host that is still starting, and every one of
them would fail as though the suite had drifted.

Two hosts, two different notions of "up" — the LMS has a real health endpoint,
while an MFE host's root may legitimately redirect or 404:

```yaml
.wait-for-target:
  script:
    - |
      set -euo pipefail
      wait_http() {
        # $2 = strict     require 200 (the LMS heartbeat is a real health check)
        # $2 = answering  anything but a connection failure or a 5xx, so a host
        #                 whose root redirects or 404s still counts as up
        url="$1"; mode="$2"; status=""
        for attempt in $(seq 1 60); do
          status=$(curl -sS -o /dev/null -w '%{http_code}' "$url" || true)
          if [ "$mode" = strict ] && [ "$status" = "200" ]; then
            echo "ready: $url"; return 0
          fi
          if [ "$mode" = answering ]; then
            case "$status" in
              ""|000|5??) ;;
              *) echo "ready: $url ($status)"; return 0 ;;
            esac
          fi
          echo "waiting for $url ($attempt/60, last status ${status:-none})"
          sleep 10
        done
        echo "NOT READY after 10 minutes: $url (last status ${status:-none})"
        return 1
      }
      wait_http "$LMS_BASE_URL/heartbeat" strict
      wait_http "$APPS_BASE_URL" answering
```

This belongs in the consuming pipeline, not in the template: how long a target
takes to serve, and which of its hosts to wait on, is a property of how it is
deployed.

### Serialise runs against one environment, and bound them

Every run registers several accounts, and the platform rate-limits registration
per IP address. Two runs against the same environment race each other into that
limit, so gate them on a resource group:

```yaml
resource_group: $ENV_NAME
timeout: 30m
```

The timeout is not decoration. A resource group held by a hanging job also blocks
the _next_ deploy if the deploy jobs share it — and under CI the suite runs
single-worker with two retries, so an unhealthy target can keep a job alive for a
long time. Give it a bound well below the project timeout.

### A manual job needs `allow_failure`

A manual job declared through `rules:` defaults to `allow_failure: false`, which
makes it a **blocking** manual job: the pipeline sits in `blocked` rather than
`success` until someone presses play. On a bridge whose parent waits with
`strategy: depend`, that means every deploy looks unfinished until the suite is
run.

The cost of `allow_failure: true` is that a genuine test failure shows as a
warning rather than a red X. The child pipeline's own status is the unambiguous
signal, and GitLab's **Tests** tab has the per-test detail.

### Keep the remote include off the deploy path

`include: remote:` is fetched when a pipeline is **created**, not when the job
runs. Put it in your deploy pipeline and github.com being unreachable means the
deploy pipeline cannot be created at all — a test-tooling outage blocking
deploys.

Triggering the suite as its own child pipeline contains that: the blast radius is
one `allow_failure: true` bridge job. This is the reason the worked example is
split across two files, and the reason survives even after other reasons to split
go away.

On a self-managed instance that mirrors this repository, a project include
removes the dependency entirely — it resolves on the instance:

```yaml
include:
  - project: 'your-group/end-to-end-tests'
    ref: <sha>
    file: '/ci/gitlab/run-suite.yml'
```

### Pin the ref, in both places

`E2E_SUITE_REF` is required and has no default, because silently tracking `main`
lets a change here turn your pipeline red without anything in your deployment
having changed. Keep it equal to the ref in the include URL: the include governs
_how_ the suite is run, the variable governs _which_ suite is run, and there is no
reason for them to differ.

### Secrets are CI variables, not `variables:` values

A `variables:` entry is committed in plain text. Define the password as a masked,
protected CI variable and reference it:

```yaml
ADMIN_USERNAME: $E2E_ADMIN_USERNAME
ADMIN_PASSWORD: $E2E_ADMIN_PASSWORD
```

`ADMIN_USERNAME` and `ADMIN_PASSWORD` are validated as a pair: set both or
neither. Half a pair is always a mistake — a typo in a variable name, or a
variable not exposed to the current branch — so the template fails rather than
guessing which half you meant.

Use a throwaway staff account, never a real administrator's: the traces and videos
in the artifacts record the sign-in.

## Preparing the installation under test

Mostly the suite adapts to the install rather than the other way round. Three
things are worth checking.

**Registration rate limits.** The platform caps `REGISTRATION_RATELIMIT` and
`REGISTRATION_VALIDATION_RATELIMIT` per IP address (`60/7d` and `30/7d` by
default), and CI runners typically share one egress address. A full run costs
several registrations, so a repeatedly tested environment starts answering `403
forbidden-request` after a handful of runs. Raise both to a short self-resetting
window (e.g. `100/m`) on any environment you test regularly.

**Email confirmation is _almost_ never needed.** The default `automatic` account
backend captures the session that registration itself creates, so the whole
authenticated tier works on an install that leaves accounts inactive until
activation. Only the two specs that drive a _separate_ UI sign-in —
`tests/lms/auth/login.spec.ts` "signs in with valid credentials" and
`tests/lms/auth/logout.spec.ts` — need an account that can log in, i.e.
`FEATURES["SKIP_EMAIL_VALIDATION"] = True` or an activating backend. Note that
those two currently **fail rather than skip** without it. If you cannot set that
flag but your target does send activation email, the shipped `plugins/openinbox.plugin.ts` backend
clicks the activation link for you (see `.env.example`).

**Content the specs target.** `COURSE_KEY` is a prerequisite of the installation,
not something the suite creates — import a course however your install does (on
Tutor, `tutor local do importdemocourse`) and name it. Leave it unset and the
course-completion specs skip cleanly. Keep `CAPABILITIES` in step with the
features the install actually has; an unknown value fails the suite's own config
validation, and the defaults in `.env.example` track a stock install.

## Reading the results

`artifacts:reports:junit` populates GitLab's **Tests** tab, with history and
flaky detection across runs. The browsable HTML report, the traces, screenshots
and videos for whatever failed, and the suite's own BTR-coverage and
accessibility JSON are job artifacts.

`PLAYWRIGHT_JUNIT_OUTPUT_FILE` is what puts the JUnit reporter in the list, and
the template sets it. Do not pass `--reporter=junit` instead: that replaces the
whole configured list and silently stops the BTR-coverage and accessibility
reporters producing anything.
