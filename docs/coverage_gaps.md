# Coverage gaps

What the suite does not exercise, and which BTR cases still need a person even
when their tests pass. Nothing here is a defect (those are in
[`findings.md`](findings.md)): it is simply untested, or tested less fully than
the BTR sheet asks.

Two parts:

- **Gaps** — product areas with no test, written up as they are found: what is
  missing, why it matters, and what a spec would need. When a gap is covered,
  delete its entry and mention the TC number in the PR.
- **[Cases needing a manual check](#cases-needing-a-manual-check)** — one row
  per BTR case. The BTR results publisher reads this table
  (`scripts/btr-sheet/coverage-gaps.mts`), so keep its shape.

This file is refreshed by hand; see "Refreshing the coverage-gaps table" in
[`DEVELOPER.md`](../DEVELOPER.md).

## Learner Dates tab: extensions and past-due state

**Found:** 2026-10-09, resolving `INSTR-004`; narrowed 2026-11-23, when
`tests/lms/course-home/dates.spec.ts` covered the basic listing (a graded
subsection's due date in the dates API and on the tab, via the
`assignmentDatesListed` fixture).

**Missing:** the Dates tab is not read after a per-learner extension (TC-00525
still reads the progress API), nor for an assignment whose due date has passed
(`dates_banner_info.missed_deadlines`, the "Past due" badge).

**What a spec needs:** `assignmentDatesListed` plus TC-00525's extension step
for the first; a subsection with a `due` in the past for the second. The day
badges differ only by their localized label, so the state has to come from the
API.

## Demo-course passing grade (TC-00031)

**Found:** 2026-10-13, resolving `DEMO-002`.

**Missing:** nothing earns a passing grade in the demo course; TC-00031's
"reaches a passing grade" is a `test.fixme` in
`tests/lms/course-home/progress.spec.ts`.

**Why it matters:** the pass path (grade summary, `is_passing`, certificate
eligibility on the demo course) is what a new install's evaluators try first.

**What a spec needs:** an answer key. Import it from
`../demo_course_playwright` (github.com/bmtcril/demo_course_playwright,
Apache-2.0): `UNIT_ANSWERS` in `tests/demo-course.spec.ts` covers every graded
problem (radio, checkbox, text, dropdown, hinted, Show-Answer-with-override,
the custom-JS fish, the library-content pair). Re-key it by block usage key
rather than unit position, and map its answer types onto `ProblemBlock`.

## Cases needing a manual check

Reviewed against: Willow Test Sheet V2.0 (2026-11-19), suite at d551e7a.

A case belongs here when a passing run still leaves something for a person to
check. Cases the run already reports as held back, expected to fail, disputed,
skipped or failed are **not** listed: the run says so itself.

One row per case, sorted by Test ID. `Reason` is one of:

| Reason    | Meaning                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| `no test` | Nothing automated carries the case id.                                         |
| `gap`     | Tests pass, but the case touches a gap described above.                        |
| `wording` | The case expects specific copy; the suite asserts structure or API state.      |
| `email`   | The case expects an e-mail that no test reads.                                 |
| `visual`  | The case asks for a judgement by eye ("renders properly").                     |
| `partial` | Tests cover part of the case; the row says which part is not checked.          |

<!-- manual-check-table:start -->

| Test ID  | Reason  | What the suite does not check |
| -------- | ------- | ----------------------------- |
| TC-00001 | partial | The account page's password-reset button is not driven; the reset itself is covered from the sign-in page (TC-00004). Case asks for password reset, other profile fields and persistence after refresh; the one tagged test updates the full name only. |
| TC-00002 | email | The sheet expects a registration e-mail to confirm the account; no test reads one. No activation mail: CI sets `SKIP_EMAIL_VALIDATION`, so accounts are active on registration. |
| TC-00005 | no test | Third-party SSO needs a real identity provider. |
| TC-00006 | no test | Third-party SSO needs a real identity provider. |
| TC-00007 | no test | Third-party SSO needs a real identity provider. |
| TC-00008 | wording | Expects the disabled button to say 'You are enrolled in this course'. |
| TC-00012 | wording | "Date format is correct" is a locale-dependent rendering judgement. |
| TC-00014 | partial | The catalog is opened directly, not through the home page's "Explore courses" link. |
| TC-00016 | wording | Expects the search bar placeholder 'Search for a course' and a no-results message. |
| TC-00017 | wording | Expects filter headings named Modes, Org, Language. Only the organization filter is applied and removed; language and type are checked for presence only, and no filter is combined with a search term. |
| TC-00019 | wording | "Renders properly" with links labeled Explore courses / Register for Free / Sign in. The header's links and buttons are counted and the logo is followed; Register and Sign in are followed under TC-00062. |
| TC-00020 | wording | "Renders properly" with a link labeled Discover and menu options named Dashboard, Profile, Account, Sign Out. On `main` these run as expected failures for known chrome defects (`BASE-004`, `BASE-005`, `BASE-006`, `LEARN-002`, `FP-001`); the run report names the defect and the chrome. `verawood` verifies them. |
| TC-00021 | wording | "Renders properly" with links labeled My Courses / Discover and seven named menu options incl. Order History. On `main` these run as expected failures for known chrome defects (`BASE-004`, `BASE-005`, `BASE-006`, `LEARN-002`, `FP-001`); the run report names the defect and the chrome. `verawood` verifies them. |
| TC-00023 | wording | "Renders properly" with links labeled Courses, Programs, Discover New and named menu options. |
| TC-00025 | partial | The outline is opened directly; reaching it from the dashboard or the catalog is not driven. |
| TC-00036 | wording | Expects the ribbon text to change between "bookmark this page" and "bookmarked". |
| TC-00038 | partial | Taking a note runs as an expected failure (`NOTES-001`); the Notes tab and the show/hide switch are verified. |
| TC-00041 | partial | The course card and its title link only: filtering by status and sorting by enrollment date or title are not driven. Case also asks for Start/Resume buttons, Refine filter by status and sort; the test lists enrolled courses. |
| TC-00048 | no test | The active unit is marked by colour only: no aria-current, no selected-state class, so there is nothing non-localized to assert (tests/lms/courseware/sidebar.spec.ts). |
| TC-00049 | wording | Expects the label "Course Outline" at the top of the sidebar. |
| TC-00051 | partial | The opened unit's content and URL are checked, not that it becomes the highlighted unit: the active unit is marked by colour only. |
| TC-00054 | partial | The two unit types' icons are compared in the navigation API only: the sidebar is not read, and the completed-unit icon is never produced. |
| TC-00055 | partial | The subsection's completed mark is checked; the section-level mark in the course-outline view is not. |
| TC-00056 | partial | The page fitting a phone screen runs as an expected failure (`LEARN-003`); the outline button's upper-left position is not asserted. |
| TC-00059 | partial | A staff-only section is hidden through the API and read from the learner's outline; a hidden subsection and the sidebar itself are not checked. |
| TC-00060 | partial | On `main` these run as expected failures for known chrome defects (`BASE-004`, `BASE-005`, `BASE-006`, `LEARN-002`, `FP-001`); the run report names the defect and the chrome. `verawood` verifies them. |
| TC-00061 | visual | Asks for iOS, Android and tablet checks in Chrome and Safari; the suite checks viewport sizes in its own browsers, not real devices. On `main` these run as expected failures for known chrome defects (`BASE-004`, `BASE-005`, `BASE-006`, `LEARN-002`, `FP-001`); the run report names the defect and the chrome. `verawood` verifies them. |
| TC-00063 | wording | Expects seven footer links labeled About Us, Blog, Donate, Terms of Service, Privacy Policy, Help, Contact Us. |
| TC-00064 | wording | Expects the exact notice “Copyrights ©2025. All Rights Reserved.”; the test checks the year and site name. |
| TC-00065 | wording | Expects the placeholder to read "Search for a course". |
| TC-00066 | wording | Tests prove the language switch takes effect (pages declare the language); whether translated strings read correctly is not checked. On `main` these run as expected failures for known chrome defects (`BASE-004`, `BASE-005`, `BASE-006`, `LEARN-002`, `FP-001`); the run report names the defect and the chrome. `verawood` verifies them. |
| TC-00073 | wording | Asks to check the reset e-mail's content and the "Contact technical support" button. |
| TC-00113 | no test | Operator setup of an external credentials service. |
| TC-00114 | wording | Expects two exact certificate status messages on the Progress page and a "View my certificate" button. |
| TC-00116 | no test | An operator major-version upgrade is not something a browser suite can drive. |
| TC-00130 | partial | The survey is created through the API with its default questions; adding and editing it in Studio is not driven. The learner's answers are. |
| TC-00131 | partial | The recommender is added from the Advanced tile and judged in the Studio preview only: its learner view loads scripts from public CDNs (`XBLOCK-001`). |
| TC-00132 | partial | One setting is changed and re-read in the block's editor; the learner view is not opened (`XBLOCK-001`). |
| TC-00134 | wording | Expects the page's new name “Files” to display. Both views and the file count are checked: the header elements (title, search box, Sort and Filter, Actions, Add Files) are not asserted one by one. |
| TC-00136 | partial | Substring, extension and no-match searches are driven: a search term containing a space is not. |
| TC-00139 | partial | Rows and their checkboxes are checked: each row's metadata (size, type, status) is not. |
| TC-00140 | partial | A representative subset of each row's options or filters. |
| TC-00141 | partial | A representative subset of each row's options or filters. |
| TC-00150 | partial | The learner side is the course's not-started access error, not the About page or View live; the content is seeded through the API, only the publish is driven. |
| TC-00151 | partial | The learner side is the course's not-started access error, not the About page or View live; the content is seeded through the API, only the publish is driven. |
| TC-00152 | partial | The learner side is the course's not-started access error, not the About page or View live; the content is seeded through the API, only the publish is driven. |
| TC-00173 | no test | The sheet itself says this cannot be tested until the release docs are built. |
| TC-00190 | wording | Expects a header section called “Course Tags”. |
| TC-00215 | partial | One advanced setting only: allow video downloads. "Test all advanced settings"; the tagged test sets one advanced download option. |
| TC-00216 | partial | Problems are authored as OLX through the API and answered through the problem API; the Studio problem editor is opened only as far as its type picker. |
| TC-00217 | partial | A representative set of editor functions: bold, italic, underline and a heading (TinyMCE's alignment shortcuts do nothing in this editor; toolbar-only functions are not driven). "All of the editor functions"; the tagged test covers inline styles and a heading. |
| TC-00218 | partial | A representative set of editor functions: bold, italic, underline and a heading (TinyMCE's alignment shortcuts do nothing in this editor; toolbar-only functions are not driven). "Test TinyMCE in detail"; shares the single inline-styles-and-heading test with TC-00217. |
| TC-00219 | wording | Expects a "Discussions Enabled" text next to the unit title. Toggled from the unit page's Settings tab and read back from Studio; the outline's Configure dialog and the "Discussions Enabled" label are not checked. |
| TC-00220 | partial | The learner sees the block render; no item is dragged or dropped. |
| TC-00221 | partial | The learner sees the block render; no response is submitted or assessed. |
| TC-00222 | partial | The component menu's Copy to Clipboard is held (`STUDIO-013`); the paste is driven. |
| TC-00237 | partial | The pages are created through the API: adding a custom page in the UI is not driven, only the reorder. |
| TC-00239 | partial | A representative subset of each row's options or filters. Case names Calculator and ORA settings; the tagged test toggles the calculator only. |
| TC-00240 | partial | A representative subset of each row's options or filters. Case names the Discussion and Wiki pages; the tagged test toggles the wiki only. |
| TC-00247 | partial | Bold only, in the Updates editor. "Every function works" (bold, emoticons, headers…); one formatting test. |
| TC-00256 | partial | A representative subset of each row's options or filters. Case covers search, filters, the no-results notice and sorting; the tagged test covers search narrowing. |
| TC-00257 | partial | A representative subset of each row's options or filters. Case covers filters, the no-results notice and sorting; the tagged test covers the sort control. |
| TC-00258 | partial | A representative subset of each row's options or filters. Case also expects the re-run modal from the 3-dot menu; the tagged test covers View live. |
| TC-00259 | partial | The imported tags are read back from the API; the taxonomy's tile, its expanded tag tree and the details widget are not checked. |
| TC-00269 | partial | Visibility is judged by how the LMS course API answers a learner (not served, or served as hidden): the catalog listing and About page are not opened, and the "about" value is never set. |
| TC-00272 | partial | Mobile availability is read back from Studio only: there is no mobile oracle. |
| TC-00273 | partial | The learner side is read from the courseware API's calculator flag: the calculator itself is opened under TC-00039. |
| TC-00276 | visual | "Print to check layout is good" is a visual judgement; the test previews the certificate. The preview link is checked to be the certificate web view and to load: the certificate's layout (signatories, course name, organization) is not inspected. |
| TC-00287 | partial | The grace period is set and read back from the grading policy: a late submission is not driven, as the course has no graded problem with a due date. |
| TC-00292 | partial | The cohort is created and linked to the content group through the LMS API, not the cohort UI: no learner is placed in the cohort or shown group-restricted content. |
| TC-00295 | partial | Access and archival are read from the LMS APIs: the dates are not read on the learner's Dates tab or About page. |
| TC-00296 | partial | The start time is not read back in the Studio outline's Start Date field. |
| TC-00297 | partial | The certificate available date is read back from Studio: a learner sees it only on a certificate-eligible track, which the course under test is not. |
| TC-00306 | partial | The checklist is read back from Studio only. |
| TC-00307 | partial | Only an empty course's state: items shown and drawn incomplete. No content is added to turn an item complete. |
| TC-00311 | wording | Expects named menu options and the exact moderation pop-up sentence. |
| TC-00322 | partial | A representative set of editor functions: bold, italic, underline and a heading (TinyMCE's alignment shortcuts do nothing in this editor; toolbar-only functions are not driven). "All of the editor functions"; one rich-text creation test. |
| TC-00323 | partial | The saved YouTube id is read back from the library; the editor's cancel, keep-editing and discard paths are not driven. |
| TC-00324 | partial | The uploaded transcript is read back as a file on the video; playback with captions, "allow downloads" and "show transcript by default" are not checked. |
| TC-00325 | partial | The start and stop times are read back from the library; the video is not played to see it start at the timestamp. |
| TC-00328 | partial | The search is cleared by emptying the field, not with the clear button; the yellow highlight on matches is not checked. |
| TC-00329 | partial | The filter is applied at the taxonomy level; a single top-level tag and a nested tag from the drop-down are not selected. |
| TC-00332 | partial | Title A-Z and Z-A, Newest, Oldest and Recently modified are driven; Most relevant and Recently published are not. |
| TC-00342 | partial | The delete is confirmed; cancelling it to see the component remain is not driven. |
| TC-00343 | partial | The delete is confirmed; the warning about courses using the unit and the Cancel path are not checked. |
| TC-00346 | partial | Updates are accepted and ignored from the unit page; the course Libraries page's "Review Content Updates" is not driven for a component (TC-00348 drives it for a unit). |
| TC-00348 | partial | Updates are accepted and ignored from the course Libraries page; the update icon on the unit in the course outline is not driven. |
| TC-00386 | partial | Case is about trimming and de-duplicating the Users input (one request per user); the tagged test assigns to one and several accounts. |
| TC-00420 | wording | Expects the toggle labeled "Allow all Studio users to reuse published content from this library". |
| TC-00421 | partial | The outsider's read access decides; the switch disabling while it saves and the success message are not checked. |
| TC-00426 | partial | The outsider adds a published item from the picker; no draft item is seeded here, so "I do not see drafts" is not checked (TC-00575 checks it). |
| TC-00442 | partial | Only the not-found view's action is driven, and only that it leaves that page, not where it lands; skipped on `main`, where the action does nothing (`RBAC-008`). |
| TC-00454 | wording | Expects the toast texts "Team member added successfully" and "Role added successfully". |
| TC-00455 | wording | Expects the toast text "Role added successfully". The success message is checked after an assignment started in the wizard itself, not from an account's User View. |
| TC-00466 | partial | Both endorsement notifications are read from the notifications API; the tray's Discussions tab is not opened. |
| TC-00473 | wording | Expects preferences named "New ORA submission for staff grading" and "Reported content". |
| TC-00474 | email | The sheet expects grouping in the Daily and Weekly e-mail summaries; those digests are held back. ORA grouping is read from the notifications API, not the tray; the daily and weekly e-mail summaries are held (TC-00478, TC-00480, `NOTIF-004`). Case also expects grouping in the Daily/Weekly e-mail summary; the test covers the tray, and the digest cases are held back. |
| TC-00482 | partial | The resize handle is shown but not dragged; narrow-viewport behaviour is not checked. |
| TC-00483 | partial | Section and subsection selection only; selecting a unit from the outline is TC-00489. |
| TC-00484 | partial | The menu is opened and dismissed; no action is chosen here. The actions are driven under TC-00485. |
| TC-00485 | partial | Delete (with confirmation), Duplicate and Move Down are driven; Move Up is not. |
| TC-00486 | partial | The tabs, the tags control and the presence of settings links only: not the content summary counts, tag names or where the links lead. |
| TC-00488 | partial | Only the grading-type control on the Settings tab: not release or due dates, visibility, or the unit count. |
| TC-00489 | partial | The unit is selected from the keyboard where its header leaves no blank space to click (`AUTH-002`); the Details and Settings tabs are checked, the Preview tab is not. |
| TC-00490 | partial | A section is tagged from the Align rail; the subsection and unit repeats on the outline are not driven (the unit is tagged from its own page, TC-00497). |
| TC-00491 | partial | Only that the Add New and Add Existing tabs open: nothing is added, and the library filter and empty state are not checked. Case walks adding a section, library search and filter, the empty state and the library-reference restriction; the tagged test opens the sidebar and its two tabs. |
| TC-00492 | wording | Help topics show at course and section level; that they differ per level (the difference is localized copy) and closing the panel are not checked. |
| TC-00496 | partial | Only that the Add New and Add Existing tabs open: no component is added, new or from a library. Case walks adding each component type, library search, cancel and the library-reference restriction; the tagged test opens the sidebar and its two tabs. |
| TC-00499 | partial | Duplicate and delete are driven from the component's menu; Move (to another unit) is not. |
| TC-00501 | partial | The banners and blocked upload are driven on the Files page only: the course outline's banner is not checked. |
| TC-00502 | partial | Decided by the agreement record API only: no banner or blocked upload control is rendered for these agreements. |
| TC-00503 | partial | Decided by the agreement record API only: no banner or blocked upload control is rendered for these agreements. |
| TC-00506 | no test | The sheet marks the row deprecated: there is no separate video page for it. |
| TC-00507 | partial | Decided by the agreement record API only: no banner or blocked upload control is rendered for these agreements. |
| TC-00510 | partial | The PDF block is added from the Advanced list; it is not reopened to upload a PDF, and its preview is not checked. |
| TC-00514 | partial | Each role's tabs are compared with the platform's own rules, not the sheet's list: Certificates is optional for the instructor, and staff get Course Team only as Discussion Admins. |
| TC-00516 | wording | Expects a chip reading "Upcoming". |
| TC-00518 | wording | The status modal's answer is a localized sentence only, so the instructor API's enrollment flag decides. |
| TC-00519 | partial | Secondary steps of the row are not driven. |
| TC-00521 | partial | The learner's progress page is opened; the gradebook is not. |
| TC-00525 | gap | The learner's Dates tab is not read after a per-learner extension (see "Learner Dates tab" above). Secondary steps of the row are not driven. |
| TC-00556 | partial | The tag is shown and filtered only after the course is republished; the case without a republish is held (`ASPECTS-007`). |
| TC-00560 | wording | Expects the console title "Roles and Permissions Management". The Studio-home entry point is unverified in CI: it needs `rbac-global`, which no CI profile installs. |
| TC-00561 | wording | Expects named columns, a "Showing X of Y users" counter and "(me)" beside the username; column sorting is not evident in the tagged test. The row counter and column sorting are not checked; paging is checked only as a disabled Next on a single page. |
| TC-00562 | partial | A representative subset of each row's options or filters. |
| TC-00563 | partial | Single and multiple assignment only: the unknown-account and cancel scenarios run under TC-00452 and TC-00564, and the success message under TC-00454. |
| TC-00564 | partial | Case selects a new role from the audit view and saves it; the tagged test opens the wizard from the audit view and cancels. |
| TC-00567 | partial | On `verawood` your own admin row has no remove control at all, so the greyed state and its tooltip are checked on `main` only. |
| TC-00569 | wording | Column and area names are not read (localized copy); pinned headers and scroll-to-top are checked at phone width, the only width the matrix scrolls at, and the row labels (not pinned) are not; the match with the API's permission list runs on `main` only. |
| TC-00570 | partial | Deleting a content item and the remove control on another member's row are not checked; content is created and edited through the API. |
| TC-00573 | partial | Drafts being hidden from a Library User is held: the role is served drafts by design (`RBAC-010`). |
| TC-00575 | partial | The success message after flipping the switch is held: the MFE shows none (`RBAC-013`). |
| TC-00576 | partial | Only an outline rename is made as Course Staff, through the API: publishing, the settings pages and files are not exercised, nor the team list's missing remove control. |
| TC-00577 | partial | The Assign Role button is checked as shown, but the role is added and removed through the API: no wizard, success message or confirmed removal (`RBAC-014`). |
| TC-00578 | partial | On the direct URL only the outline's absence is checked, not an error message; absence from Studio home is held, since the course is listed (wg#613). |
| TC-00598 | partial | The no-role account is an enrolled learner, refused Studio and the instructor tools; an account with no enrollment either is not read. |
| TC-00611 | partial | The no-role account is an enrolled learner whose access is compared with its own earlier reading; an account with no enrollment either is not read. |
| TC-00616 | partial | The course is created by a course-creator account through the API, not by Global Staff from Studio home. |
| TC-00617 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00618 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00619 | partial | The console naming the role Beta Tester runs as an expected failure (`RBAC-003`); the row being listed is checked. |
| TC-00620 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00621 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00622 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00623 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00624 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00625 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00626 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00627 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00628 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00629 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00631 | wording | Expects the console title "Roles and Permissions Management". Run as a course author, not Global Staff: the Settings link to the console is read, and no team change is made to compare the two systems. |
| TC-00633 | wording | Expects the error message "You do not have permission to perform this action". Only the absence of the outline and Settings menu is checked, not a permission message; absence from Studio home is not checked, since the course is listed (wg#613). |
| TC-00634 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00636 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00639 | partial | The override is not created in the test: it reads the one the suite's setup placed on its AuthZ course and compares a course without one. |
| TC-00641 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00642 | partial | No video is uploaded (no transcoding pipeline): the Videos page's data is served to a course admin and refused to an outsider. |
| TC-00643 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00645 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00647 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00648 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00649 | wording | Expects the exact error "User … has registered but has not yet activated their account". Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00650 | partial | Studio under AuthZ: the action is made through Studio's API as the role and read back from the platform. Studio's pages, dialogs and messages are not driven. |
| TC-00651 | no test | New in sheet V2.0; no test carries the id yet. |
| TC-00652 | no test | LTI 1.1 is not automated; only LTI 1.3 is in scope. |
| TC-00653 | no test | Covered by the LTI 1.3 specs, which are not merged yet. Remove this row when they land. |
| TC-00654 | no test | LTI 1.1 is not automated; only LTI 1.3 is in scope. |
| TC-00655 | no test | Covered by the LTI 1.3 specs, which are not merged yet. Remove this row when they land. |
| TC-00656 | no test | Covered by the LTI 1.3 specs, which are not merged yet. Remove this row when they land. |
| TC-00657 | no test | Covered by the LTI 1.3 specs, which are not merged yet. Remove this row when they land. |
| TC-00658 | no test | Covered by the LTI 1.3 specs, which are not merged yet. Remove this row when they land. |
| TC-00659 | no test | Covered by the LTI 1.3 specs, which are not merged yet. Remove this row when they land. |
| TC-00660 | no test | Covered by the LTI 1.3 specs, which are not merged yet. Remove this row when they land. |
| TC-00661 | no test | Covered by the LTI 1.3 specs, which are not merged yet. Remove this row when they land. |

<!-- manual-check-table:end -->
