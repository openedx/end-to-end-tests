0001 Purpose of This Repo
#########################

Status
******

**Provisional**

Context
*******

Open edX already has end-to-end tests written in Cypress, hosted in
`openedx/cypress-e2e-tests <https://github.com/openedx/cypress-e2e-tests>`_.
Contributors interested in expanding end-to-end coverage do not wish to
build on that framework, citing limitations in Cypress's flexibility. The
BTR (Build/Test/Release) process still relies on a sizable set of manual
checks at release time, and there is no other home for new end-to-end tests.

Decision
********

We will create this repository to house new end-to-end tests for the Open
edX Platform. Initial tests will be written using
`Playwright <https://playwright.dev/>`_.

Consequences
************

This repository will be treated as experimental. Decisions about the
existing Cypress repo are deferred; the long-term goal is to converge on a
single end-to-end test repo usable by the whole community. An initial group
of core contributors will build and maintain this repo. Community members
are welcome to participate and may eventually join the core contributor
group. No near-term coverage or release-validation targets are set; the
immediate goal is to see whether the effort gains traction.

Rejected Alternatives
*********************

Add Playwright tests to the existing Cypress repo
==================================================

Rejected because that repo is named after its framework; housing two
frameworks side-by-side would make the repo more complex and the name
misleading.

Rely on existing per-service tests
==================================

Per-service tests exist but do not exercise multiple systems together in
a production-like environment, so they cannot reliably catch regressions
in cross-service happy-path flows.

References
**********

- `openedx/cypress-e2e-tests <https://github.com/openedx/cypress-e2e-tests>`_ — the existing Cypress-based end-to-end tests.
- `WGU-Open-edX/openedx-e2e-tests <https://github.com/WGU-Open-edX/openedx-e2e-tests>`_ — Playwright tests maintained by WGU; prior art and a likely starting point for tests to bring into this repo.
