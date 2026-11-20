# `src/lti-tools/` — LTI tool providers

**Single responsibility:** give the LTI 1.3 specs (`tests/lms/lti/`) a tool to
launch, and a way to see what each launch carried. It is the oracle behind the
`lti-tool` capability: a launch is judged by the claims the tool received, and
grades, rosters and deep linking by what the platform answered the tool.

A provider opens one **session** per test (`openSession`): its own registration
of the platform, so parallel tests never share one. The session gives the URLs to
write into a block and the tool's public key; it registers the platform's values
as Studio shows them (`register`), readies each other actor's browser to launch
into it (`admit`), reads a launch (`readLaunch`), calls the platform's LTI
Advantage services as the tool (`postScore`, line items, `memberships`), and
answers a deep-linking request with a resource the test picks
(`chooseDeepLink`). `types.ts` documents each call.

A provider also declares its **features** — `claims`, `services`,
`deep-linking`, `inline` — so a target only runs the cases its tool supports.

## Selecting a provider

`LTI_TOOL_PROVIDER` names the provider (default `local`, the suite's bundled
tool). Other providers are plugins listed in `CUSTOM_LTI_TOOL_PROVIDER_PLUGINS`:
a module's named `ltiToolProvider` export when present, else its default export,
each the provider itself, a class, or a factory (which is where a plugin
validates its own settings, so a bad one fails the run up front).
`LtiToolProviderRegistry` holds the built-ins and the loaded plugins.

Plugin loading and selection are unit-tested in `tests/lti-tools/registry.spec.ts`.
