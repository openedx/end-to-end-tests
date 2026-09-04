# `src/steps/` — reusable business flows

**Single responsibility:** compose page objects (and API/data layers) into
reusable, multi-page business flows — e.g. "register an account", "enrol in a
course", "complete a unit".

Steps sit above page objects and below fixtures/specs. A step orchestrates
several single-surface actions into one meaningful user flow that multiple specs
can reuse.

Rules:

- No raw locators — call page-object methods instead.
- Steps perform actions and navigation; specs still own the assertions that
  decide pass/fail.
- A step that cannot do its job **reports why** rather than throwing or quietly
  succeeding: `completeUnit` returns the blocks it could not drive as typed
  `UnviewedBlock[]` data, and the spec decides whether that is a failure or an
  inventory. Throwing is reserved for target-data errors (a course the catalog
  does not list), which no spec should tolerate.
- Where an optional capability is one of two routes to the same place, the step
  takes whichever the target offers (`locateCourseInCatalog` searches or pages),
  so only coverage _about_ the feature is gated.
- Depends on `pages/`, `api/`, `accounts/` (the UI sign-in/sign-out defaults the
  auth steps delegate to), and `config/`.
