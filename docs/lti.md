# LTI 1.3 coverage

The suite tests Open edX as an **LTI 1.3 platform**: the LTI Consumer XBlock
(`xblock-lti-consumer`) launching an external tool. The specs are in
`tests/lms/lti/` and run on `main`. To check a launch, the suite needs an LTI
tool it can read from. The tool is pluggable:

- **`local`:** the suite's own bundled tool. It is the default and what CI runs.
- **`saltire`:** the public [saLTIre](https://saltire.lti.app/) emulator, for a
  public instance.

This page covers:

1. [What is covered](#what-is-covered)
2. [How a launch is checked](#how-a-launch-is-checked)
3. [Choosing a tool provider](#choosing-a-tool-provider)
4. [The `local` tool](#the-local-tool)
5. [saLTIre, for a public instance](#saltire-for-a-public-instance)
6. [LTI Store](#lti-store)
7. [Upstream defects](#upstream-defects)
8. [Writing a provider plugin](#writing-a-provider-plugin)

## What is covered

Every case sets up its own LTI Consumer block in a section of its own, and
launches it as a learner or as course staff. Each case also needs the
capabilities its tags name; see [capabilities](capabilities.md).

| Spec                   | Case                                                                                             | BTR       | Tool features         |
| ---------------------- | ------------------------------------------------------------------------------------------------ | --------- | --------------------- |
| `launch.spec.ts`       | An author sets the block up in Studio's editor, and a learner launches it inline.                | TC-00653  | claims, inline        |
| `launch.spec.ts`       | Course staff launch as an instructor; they are not sent the administrator role (`LTI-001`).      | TC-00653  | claims                |
| `launch.spec.ts`       | A duplicated component launches as itself, under the same registration.                          | TC-00659  | —                     |
| `ags.spec.ts`          | Grades through AGS: declarative and programmatic line items reach Progress.                      | TC-00655, TC-00656 | services     |
| `ags.spec.ts`          | Grades through AGS: a line item is deleted (`LTI-002`), and a block with grades off refuses scores. | TC-00656 | services         |
| `nrps.spec.ts`         | Course membership through NRPS: learner and instructor roles; refused without NRPS.              | TC-00658  | services              |
| `deep-linking.spec.ts` | An author picks a resource in the tool; a learner's launch carries it; a second pick replaces it. | TC-00657 | deep-linking, claims  |
| `pii.spec.ts`          | Personal-data sharing: no field, each field alone after consent, cancel, and inline consent.     | TC-00660  | claims (inline: also inline) |
| `lti-store.spec.ts`    | A reusable configuration kept in LTI Store launches (`LTI-003` for the default redirect URIs).   | TC-00661  | — (`lti-store`)       |

The `lti` capability alone, on every release, covers adding and configuring the
block without launching it (TC-00212).

## How a launch is checked

A launch is judged by **what the tool received**, not by the tool's page. Two
kinds of outcome are checked:

- **Launches:** the tool decodes the platform's `id_token` and verifies it
  against the platform's own keyset. The specs then assert on its claims: the
  message type, resource link, context, deployment, roles, `custom`, and the
  shared name and email.
- **Services:** grades, course membership and deep linking are judged by what
  the platform answered the tool. Grades are also read back from the learner's
  Progress through the API.

## Choosing a tool provider

| Variable                           | Default | Meaning                                                                    |
| ---------------------------------- | ------- | -------------------------------------------------------------------------- |
| `LTI_TOOL_PROVIDER`                | `local` | The tool the LTI specs launch: `local`, or a plugin's name (`saltire`).    |
| `CUSTOM_LTI_TOOL_PROVIDER_PLUGINS` | —       | Comma-separated plugin paths, e.g. `./plugins/saltire.plugin.ts`.          |

A target opts in by declaring the following in `CAPABILITIES`:

- `lti-tool`, together with `lti`;
- the **features** its tool supports:
  - `lti-tool-claims`;
  - `lti-tool-services`;
  - `lti-tool-deep-linking`;
  - `lti-tool-inline`.

A case needing an undeclared feature is skipped. A feature declared but missing
from the selected provider fails the run at setup, so a target never silently
runs a case its tool can't check. Both built-in providers support all four
features.

Pick by where the target is:

| Target                                                         | Provider  | Why                                                                                                                         |
| -------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tutor on this machine or a CI runner (`*.local.openedx.io`)    | `local`   | The tool runs beside the browser, and the LMS reaches it.                                                                   |
| A public HTTPS instance                                        | `saltire` | saLTIre is public and calls the instance's token, AGS and NRPS endpoints over the internet; a runner's tool can't be reached. |
| A private HTTPS instance                                       | —         | Neither fits. `local` serves plain HTTP (an HTTPS LMS blocks it inline), and saLTIre can't reach a private instance; write a plugin. |

On GitHub, `run_tests_external.yml` takes an `lti_tool_provider` input (`local`
or `saltire`), and `saltire` loads the plugin for you. Add `lti-tool` and the
feature capabilities to the `capabilities` input.

## The `local` tool

The bundled tool (`scripts/lti-tool.mts`) is a small LTI 1.3 tool with no
dependencies.

- **Starting it:** Playwright's `webServer` starts it when `lti-tool` is
  declared with the `local` provider.
- **Its address:** `LTI_TOOL_BASE_URL`, by default `http://lti.<LMS host>:8765`.
  The browser maps that host to this machine (`--host-resolver-rules`), so no
  DNS entry is needed.
- **Plain HTTP only:** an HTTPS LMS would block the inline launch as mixed
  content.
- **Same-site with the LMS:** deep linking posts back to the LMS from the tool's
  page, and the LMS's `SameSite=Lax` session cookie only goes with a same-site
  request. Configuration refuses a host that isn't on the LMS's site.
- **Reaching the LMS:** the tool calls the LMS's token, AGS and NRPS endpoints.
  The LMS never calls the tool, because blocks hold the tool's public key.

CI runs it on `main`, where the default profile declares `lti-tool` and all four
features.

## saLTIre, for a public instance

`plugins/saltire.plugin.ts` drives saLTIre's own pages as the tool. Set:

    CAPABILITIES=…,lti,lti-tool,lti-tool-claims,lti-tool-services,lti-tool-deep-linking,lti-tool-inline
    LTI_TOOL_PROVIDER=saltire
    CUSTOM_LTI_TOOL_PROVIDER_PLUGINS=./plugins/saltire.plugin.ts
    # optional, https only:
    SALTIRE_BASE_URL=https://saltire.lti.app

How it works:

- **One saLTIre session per test.** A session holds one platform registration.
  The plugin copies its cookie into each actor's browser, including the
  partition used by the block's iframe, so inline launches reach the right
  session.
- **Reading a launch:** saLTIre keeps no launch history, so a launch is read
  from the window or frame it landed in. Its raw `id_token` is verified against
  the platform's keyset, exactly as with `local`.
- **Calling services:** service calls go through saLTIre's own service pages,
  and report the platform's HTTP status and body.

Things to know:

- **Validation:** the plugin was checked against a public `main` instance on
  2026-11-20, with saLTIre 3.3.2. Launches (inline and new window), both AGS
  modes, NRPS, deep linking, personal-data consent and LTI Store all passed.
- **Fragility:** saLTIre is a third party with no published rate limits. Run it
  on demand, not in scheduled CI. Its markup can change; the plugin anchors on
  saLTIre's element ids.
- **Slower runs:** each test opens a session and drives saLTIre's pages, which
  adds seconds per call.
- **Admin-account steps:** the personal-data and LTI Store cases need the admin
  account. They set course-scoped switches in Django admin: the course's
  data-sharing flag, the reusable-configuration flag override and the store
  configuration. Leave those cases out on an instance where that isn't welcome.

## LTI Store

[openedx-ltistore](https://github.com/open-craft/openedx-ltistore) keeps
reusable LTI configurations in Django admin. A block uses one through the LTI
consumer's configuration filter.

- **Not in stock Tutor:** declare `lti-store` only where it is installed and
  wired into `OPEN_EDX_FILTERS_CONFIG`.
- **What the suite does:** it creates a configuration and turns the course's
  `lti_consumer.enable_external_config_filter` flag on through the admin
  account.
- **In CI:** the `lti` profile (`.ci/profiles.json`) runs only this case. It
  uses its own `main` image variant with the plugin installed
  (`.ci/tutor/e2e_lti.py`, `.ci/seed/lti.sh`).

A configuration left with the form's default redirect URIs can't launch
(`LTI-003`). The passing case lists the launch URL; the default case is held as
an expected failure.

## Upstream defects

Each is a `test.fail` that cites its issue, so a fix shows up as an unexpected
pass. Details are in [findings](findings.md).

| ID        | Defect                                                                  | Issue                                                                                     |
| --------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `LTI-001` | Course staff are launched with the platform-administrator role set.     | [xblock-lti-consumer#618](https://github.com/openedx/xblock-lti-consumer/issues/618)      |
| `LTI-002` | AGS refuses every line-item DELETE with 403.                            | [xblock-lti-consumer#745](https://github.com/openedx/xblock-lti-consumer/issues/745)      |
| `LTI-003` | A stored configuration with the default redirect URIs can't launch.     | [openedx-ltistore#57](https://github.com/open-craft/openedx-ltistore/issues/57)           |

## Writing a provider plugin

A provider is an `LtiToolProvider` (`src/lti-tools/types.ts`). It has three
parts:

- `name`, which `LTI_TOOL_PROVIDER` selects it by;
- `features`, the subset of `claims`, `services`, `deep-linking` and `inline`
  that it really supports;
- `openSession(context)`, which returns one `LtiToolSession` per test.

The session does the work:

| Call                        | What it does                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `launchUrl`, `oidcUrl`, `deepLinkingUrl`, `publicKey()` | What the suite writes into the block.                                                    |
| `register(info)`            | Registers the platform's values (client id, deployment, keyset, token and login URLs) as Studio shows them. It may be called more than once per session. |
| `admit(context)`            | Readies another actor's browser context to launch into this session; a no-op for a tool with no per-browser state.  |
| `readLaunch(source)`        | Returns what a launch carried, newer than `source.after` for a relaunch, read by resource link or from `source.surface`. |
| `postScore`, `createLineItem`, `listLineItems`, `deleteLineItem`, `memberships` | Calls AGS and NRPS as the tool, returning the platform's status and body (`services`). |
| `chooseDeepLink(window, choice)` | Picks resource `a` or `b` in the tool's deep-linking page and returns it; the two differ in `custom` (`deep-linking`). |
| `dispose()`                 | Frees the session.                                                                                                   |

A plugin module exports the provider as a named `ltiToolProvider`, or as its
default export. The export can be the provider itself, a class or a factory.
Validate the plugin's own settings in the constructor or factory, so a bad
setting fails the run before any test.

Unit-test what can be tested without the tool; `tests/lti-tools/` has examples.
`src/lti-tools/README.md` covers the layer, and `plugins/saltire.plugin.ts` is a
complete example.
