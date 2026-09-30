0003 Network Interception Only Simulates Server Failure
######################################################

Status
******

**Provisional**

Context
*******

Some release-test cases are about how the UI behaves when the **server**
fails: a list that answers ``500`` must show an error state with a retry, a
retry must send exactly one request, navigating away must not leak the
previous page's error. The Roles and Permissions console has a block of such
cases (BTR ``TC-00440``, ``TC-00441``, ``TC-00443``, ``TC-00450``,
``TC-00451``, ``TC-00456``).

A healthy installation cannot produce those responses on demand. Everything
else in this suite drives the real platform and asks the real API whether an
action worked (ADR-0002, "the UI drives the action; the API decides the
outcome"), so there is no existing mechanism for "make this one request fail".

Playwright can intercept requests from the page (``page.route``). Used
carelessly that would undermine the suite's whole premise: a test could fake
a success, assert against a fixture of its own invention, and pass against an
installation that does not work at all.

Decision
********

This decision governs interception of **the platform's own responses** — the
LMS, Studio and MFE APIs the suite asserts against. Third-party media is out of
scope and keeps its existing treatment: ``stubVideoSources`` answers a course's
HTML5 video sources with a bundled clip, because whether a runner can reach
someone else's bucket says nothing about the platform, and the block, the player
and the completion record it produces are all still the real thing.

Interception of a platform response is allowed **only to make it fail**, for
coverage whose subject is the UI's error handling. Concretely, an intercepted
test must:

1. **Fail, never fabricate.** An intercepted route returns an error status.
   Interception must not supply a success body, a made-up payload, or data the
   platform would otherwise have provided.
2. **Name one route.** Exactly one route pattern is intercepted, for the one
   request under test, and the interception is removed when that test ends.
3. **Assert the rendering, structurally.** What is asserted is the UI's error
   state — an alert being present, a control disabled, a single retry request
   being sent — located the way every other assertion in this suite is, with
   no dependency on displayed text.
4. **Never assert platform state through the interception.** A test that wants
   to know what the platform recorded asks the API on a real request, outside
   the intercepted route.

A spec that intercepts says so in its header comment and names the case whose
premise requires it.

At the time of writing that is two specs — ``rbac/console/error-views.spec.ts``
and ``rbac/console/assign-role-errors.spec.ts`` — plus the media stub above.

Consequences
************

The suite keeps one narrow, documented exception to "drive the real platform":
error-handling coverage that would otherwise be unreachable becomes testable,
while a faked success remains impossible by rule. Reviewers have a short
checklist to apply to any new ``page.route`` call, and ``grep`` over
``page.route`` is enough to audit every use: each hit is either a platform
failure under this rule or the media stub named above.

Where an error state *can* be produced honestly, it must be: clearing a
context's cookies to get a ``401``, requesting a key that does not exist for a
``404``, or acting as a user without the right for a ``403``. Interception is
the last resort, not the first.

Rejected Alternatives
*********************

Stub the API for whole specs
============================

Rejected. It is the fastest way to write tests that pass while the product is
broken, and it would make every assertion a statement about the stub rather
than about an Open edX installation.

Leave the cases unautomated
===========================

Rejected. Error handling is a real part of the product, and these cases are in
the release plan. Marking six cases permanently manual to avoid a narrow,
auditable exception trades more than it saves.

Break the server on purpose instead
===================================

Rejected. Making the platform return ``500`` (stopping a service, corrupting
data) affects every worker on a shared target and cannot be scoped to one
request, which is exactly what these cases need.
