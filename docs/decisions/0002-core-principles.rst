0002 Core Principles of the End-to-End Test Suite
#################################################

Status
******

**Provisional**

Context
*******

We are establishing strict, universal rules for a new Playwright automated test
suite. The goal is to allow any hosting provider to run these tests against their
own setup.

Main ideas:

- **The suite is for the community, works for any provider.** The suite must not
  assume any single operator's URLs, credentials, tenants, or hosting.

- **The suite must integrate with release validation.** The Build/Test/Release
  (BTR) Working Group validates each named release against a Google-Sheets
  "Release Test Plan" in which every case has an identifier. If automated tests carry the
  corresponding case identifiers, their results can be mapped back to the sheet to
  mark cases as passed or failed.

Decision
********

Configurable and deployment-agnostic
=====================================

Nothing installation-specific is hard-coded. All environment-dependent
values - base URLs for the LMS, Studio and each MFE; credentials; tenant /
organization identifiers; feature toggles - are read from a single typed
configuration module fed by environment variables, with every variable documented
in a committed ``.env.example`` and given a sensible default where one is safe.
Configuration is validated at load time (fail fast with a clear message on a
missing or malformed value) so a misconfigured run never produces a misleading
failure in a test.

Runnable by any provider against their own installation
=======================================================

This follows directly from the previous principle: any operator can point the suite
at their own Open edX installation through configuration alone, without editing
test code. The suite does not depend on infrastructure, seed data, or CI unique
to any one provider.
Test data setup relies on portable mechanisms (documented public APIs or a
documented, idempotent seeding step) rather than one operator's private fixtures.
Providers may layer their own private overlays on top of the shared suite.

Installations differ in which optional features are enabled and which
micro-frontends are deployed, so the suite separates a **mandatory core** - the flows
every Open edX installation is expected to support (sign in, dashboard, browse,
enroll, view courseware) - from **optional, capability-gated** coverage. The core
always runs, and a failure there is a real failure. Everything beyond it is tagged
with the capability it requires (for example ``@discussions``, ``@teams``,
``@certificates``) and gated by an **explicit capability declaration in configuration**
(defaulting to the platform's demo defaults); a provider turns capabilities on or
off to match their installation, and gated tests are excluded cleanly when their
capability is off (via ``--grep-invert`` on the disabled tags).

TypeScript as the core language
================================

All test and framework code is written in TypeScript under strict compiler
settings and ``tsc --noEmit`` is a required CI gate. Playwright transpiles but
does not type-check, so this gate is what actually catches type errors; without it,
strictness is decorative. We favor ``unknown`` plus narrowing over ``any`` and use
the type system deliberately (typed API clients, discriminated unions for
configuration and test data) so that the framework is self-documenting and
refactors are safe.

Domain-oriented organization, extensible with new Features
==========================================================

Tests are organized **primarily by platform domain** - the application area they
exercise (for example ``lms/auth``, ``lms/course-home``, ``studio/outline``) - and
the page objects mirror that tree.
This matches how the platform is built and owned, keeps everything for one area in
one place, and scales to many domains as coverage grows.

A concrete layout looks like this (illustrative - the companion docs are
authoritative on exact names)::

    tests/                       # specs, grouped by platform domain
      lms/
        auth/                    login.spec.ts, registration.spec.ts, ...
        course-home/
          progress.spec.ts       # each *.spec.ts is one Feature -
          discussions.spec.ts    #   focused coverage of a single capability
          badges.spec.ts         # <-- to extend the suite: add a new Feature spec here
        instructor/              ...
      studio/
        outline/, settings/      ...
    src/
      pages/{lms,studio}/...     # page objects mirror the tests/ tree, e.g.
                                 #   badges.spec.ts -> pages/lms/course-home/badges.page.ts
      steps/                     reusable multi-page flows
      fixtures/                  composition root (page + api + data factory)
      api/                       typed API client + data factories
      config/                    typed env, routes, selectors, constants

Domain decides the folder layout; everything else about a test is expressed with
**tags**, not more folders:

- **Stability tier** - ``@smoke`` for the mandatory critical path,
  ``@regression`` for broader depth - expressed as tags plus Playwright projects,
  so a domain's tests stay together.
- **Capability** - ``@discussions``, ``@teams``, ``@certificates``, and so on - gates
  optional coverage on or off per installation (see *Runnable by any provider
  against their own installation*).

**Every test carries a BTR test ID.** The suite covers exactly the cases in
the BTR Release Test Plan: each test is annotated with its case's ``test_id`` (of
the form ``TC-0000X``; see *BTR Release Test Plan cross-linking via test IDs*), and
a test with no ``test_id``
does not belong in the suite - annotation coverage is reported on every run, so gaps
are visible. The ``test_id`` is always **explicit**, never inferred from a test's
path or title; a domain or capability tag, by contrast, may be derived from the
folder path for convenience. Shared building blocks (page objects, steps, fixtures,
factories) exist precisely so that adding a new **Feature** - focused coverage of
one capability - is just a new ``*.spec.ts`` under the relevant domain, composing
the page objects, steps, and fixtures that already exist.

Accessibility testing
======================

We build accessibility checks into the suite from the start rather than bolting
them on later. The suite integrates automated accessibility checks
(``@axe-core/playwright``) against **WCAG 2.2 Level AA** - the conformance target
the Open edX project requires for code merged into its repositories, and cumulative
so it already covers the earlier 2.0 and 2.1 A/AA criteria - failing on critical
and serious violations. To make this usable on existing screens with pre-existing
issues, the gate supports a **known-debt baseline**: listed rule identifiers are
reported and attached to the run for triage but do not fail the build, so new
regressions are caught while historical debt is tracked and paid down over time
rather than blocking all progress.

BTR Release Test Plan cross-linking via test IDs
================================================

Each automated test that corresponds to a case in the BTR Release Test Plan is
annotated with that case's ``test_id`` using a stable, explicit convention - a
Playwright test tag or annotation (for example, an annotation of type
``test_id`` carrying the case ID (of the form ``TC-0000X``), and/or an Allure test-management link).
Matching is never inferred from test titles. Because the ``test_id`` is carried in
the report output, a custom reporter (or post-run tool) can produce a
``test_id → outcome`` mapping and use it to mark the corresponding sheet cases
passed or failed. That reporter is always active and reports annotation *coverage*
on every run - which tests carry a ``test_id`` and which do not - even when sheet
synchronization itself is turned off, so the completeness of the mapping is always
visible. This is the mechanism by which the suite progressively replaces manual BTR
release checks; it requires coordination with the BTR Working Group on a stable
``test_id`` scheme. Annotations plus a custom reporter are a standard, well-supported
way to synchronize results with an external test-management system, so this is a
low-risk approach.

Framework engineering principles
================================

We also adopt a set of technical principles:

- **Layered architecture with single responsibility:** configuration →
  API client / data factories → page objects → steps (business flows) → fixtures →
  tests, where each layer has one job (page objects hold locators and
  single-surface actions; steps compose flows; specs own the assertions that decide
  pass/fail) and higher-level composition happens one layer up.
- **Stability rules:** web-first auto-retrying assertions always; no fixed sleeps;
  deterministic, unique-per-run test data; parallel-safe isolation (each test owns
  its context and identity); centralized, individually justified timeouts; and a
  locator priority of test-id → role / label / text → CSS containers only.
- **Type-safety and secrets hygiene:** the strict ``tsc`` gate above, plus
  committing only ``.env.example`` and never committing real secrets or auth state.

The *detailed, living* form of these conventions belongs in companion
``ARCHITECTURE.md`` and ``CONVENTIONS.md`` documents, not in this record, because
they will evolve with the code. If they grow substantial or contentious, individual
decisions may graduate into their own ADRs. This ADR fixes the *intent*; the
companion docs carry the *mechanics*.

Consequences
************

- The BTR cross-linking principle couples the suite to the Release Test Plan's
  ``test_id`` scheme and requires a small tool (or custom reporter) plus ongoing
  coordination with the BTR Working Group; the ``test_id`` convention must stay
  stable to be useful.
- Being deployment-agnostic constrains how tests set up state: we cannot lean on
  any single operator's private fixtures, so some scenarios may be harder to
  automate until portable seeding or public APIs exist for them.
- Companion living documents (``ARCHITECTURE.md``, ``CONVENTIONS.md``) must be
  created and kept current alongside the code.

Rejected Alternatives
*********************

Write the suite in JavaScript
=============================

Rejected. A strict ``tsc --noEmit`` gate catches a class of errors that
Playwright's transpile-only pipeline never surfaces, and static types make a
community codebase with many contributors safer to extend and refactor.

Pin the suite to a canonical reference installation
====================================================

Rejected. Hard-coding one operator's URLs, tenants, or seed data would prevent
other providers from running the suite against their own installations, directly
contradicting the "runnable by any provider" principle.

Organize tests primarily by test type
=====================================

Rejected. Splitting the top level by test type (``smoke/``, ``regression/``)
scatters a single domain's tests across several folders, collapses as the domain
count grows, and does not match how the platform is built and owned or how the
existing Cypress suite (organized by ``lms`` / ``studio`` domains) is laid out -
making a future migration harder. We organize primarily by domain and express
stability tier as tags plus Playwright projects instead.

Pixel-level visual regression testing in the shared suite
=========================================================

Rejected. A pixel baseline is captured against one specific installation, but
providers theme Open edX differently (logos, colors, fonts, custom CSS, MFE
branding), so no baseline can be canonical across installations - this contradicts
*Runnable by any provider against their own installation*.

Infer BTR case mapping from test titles or file paths
=====================================================

Rejected as brittle. Titles and paths churn as the suite is refactored, silently
breaking the mapping. An explicit, stable ``test_id`` annotation is required.

References
**********

- `ADR-0001: Purpose of This Repo <0001-purpose-of-this-repo.rst>`_ - establishes the repo and the choice of Playwright.
- `openedx/cypress-e2e-tests <https://github.com/openedx/cypress-e2e-tests>`_ - the legacy Cypress suite; prior art for the domain-first organization (``lms`` / ``studio``) and for carrying explicit test-case identifiers (``[TC_*]``) in test titles, and a source of scenarios to re-author as typed Playwright specs.
- `Build-Test-Release (BTR) Working Group <https://github.com/openedx/wg-build-test-release>`_ and its `release testing process <https://openedx.atlassian.net/wiki/spaces/COMM/pages/3585441835/Open+edX+Release+Testing>`_ - the Release Test Plan spreadsheet this suite cross-links against.
- `Playwright test annotations and tags <https://playwright.dev/docs/test-annotations>`_, `projects <https://playwright.dev/docs/test-projects>`_, and `reporters <https://playwright.dev/docs/test-reporters>`_.
- `Open edX accessibility concepts for developers <https://docs.openedx.org/en/latest/developers/concepts/accessibility.html>`_ - the project requires WCAG 2.2 Level AA for code merged into its repositories; this is the target the accessibility gate checks against (distinct from the edx.org website policy, which targets WCAG 2.1 AA).
- `axe-core Playwright integration <https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright>`_ - the accessibility engine used by the gate.
