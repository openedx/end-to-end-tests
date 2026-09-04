# `src/config/selectors/`

Structural anchors for the surfaces the suite drives, one module per surface.

Two reasons this layer exists rather than every locator living inline in its page
object:

1. **One place to record what each anchor stands in for.** The BTR test scripts
   are written in English UI copy ("click the **Enroll Now** button"), while
   ADR-0002 forbids keying tests to displayed text. Every anchor here carries a
   comment naming the localized string it replaces, so a reader can trace a spec
   back to its test case without the suite depending on the copy.
2. **One place to fix when an MFE changes its markup.** Anchors are the part of
   the suite most exposed to upstream churn.

Page objects import from here and own the _behaviour_; specs own the assertions.
State assertions should prefer the API clients in `src/api/` — an anchor tells you
what rendered, not whether the platform did the right thing.
